-- Profiles, host allow-list, rooms and room membership.
-- Access model: docs/design.md, "Access and moderation".
--
-- Conventions for every table:
--   * RLS enabled, policies scoped to the `authenticated` role.
--   * Only the privileges clients need are granted (the project does not
--     expose new tables automatically).
--   * User-writable text has length limits.
-- Helper functions used by policies live in the `private` schema, which the
-- Data API does not expose. They are SECURITY DEFINER so policies on one table
-- can consult another without recursive RLS evaluation.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Records activity on update. An explicit change to updated_at is kept, so
-- maintenance and tests can backdate rows; clients have no grant on it.
create function private.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.updated_at is not distinct from old.updated_at then
		new.updated_at := now();
	end if;
	return new;
end;
$$;

-- Join codes: 5 characters from an alphabet without 0/O, 1/I/L.
-- Must match JOIN_CODE_ALPHABET in src/protocol/role.ts.
create function private.generate_join_code() returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
	bytes bytea;
	candidate text;
begin
	loop
		bytes := uuid_send(gen_random_uuid());
		candidate := '';
		for i in 0..4 loop
			candidate := candidate || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
		end loop;
		exit when not exists (select 1 from public.rooms where code = candidate);
	end loop;
	return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
	user_id uuid primary key references auth.users (id) on delete cascade,
	display_name text not null
		constraint display_name_length check (char_length(display_name) between 1 and 32)
		constraint display_name_printable check (display_name !~ '[[:cntrl:]]'),
	-- An emoji or a generated-avatar seed. No uploads.
	avatar text
		constraint avatar_length check (avatar is null or char_length(avatar) <= 16),
	updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
	for each row execute function private.touch_updated_at();

alter table public.profiles enable row level security;

-- Supabase may grant table privileges to API roles by default; start from none.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (user_id, display_name, avatar) on public.profiles to authenticated;
grant update (display_name, avatar) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Host allow-list. Managed by the project owner in the dashboard; clients have
-- no privileges on it and learn their own status via public.can_host().
-- ---------------------------------------------------------------------------

create table public.allowed_hosts (
	user_id uuid primary key references auth.users (id) on delete cascade,
	note text constraint note_length check (char_length(note) <= 200),
	created_at timestamptz not null default now()
);

alter table public.allowed_hosts enable row level security;
revoke all on public.allowed_hosts from anon, authenticated;

create function public.can_host() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false
		and exists (select 1 from public.allowed_hosts where user_id = auth.uid());
$$;

revoke execute on function public.can_host() from public, anon;
grant execute on function public.can_host() to authenticated;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------

create table public.rooms (
	id uuid primary key default gen_random_uuid(),
	code text not null unique default private.generate_join_code()
		constraint code_format check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'),
	host_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	name text not null default 'Game night'
		constraint name_length check (char_length(name) between 1 and 60)
		constraint name_printable check (name !~ '[[:cntrl:]]'),
	status text not null default 'lobby'
		constraint status_valid check (status in ('lobby', 'playing', 'ended')),
	auto_approve boolean not null default false,
	created_at timestamptz not null default now(),
	-- Last activity; rooms idle for longer than the retention period are purged.
	updated_at timestamptz not null default now()
);

create index rooms_host_id_idx on public.rooms (host_id);

create trigger rooms_touch before update on public.rooms
	for each row execute function private.touch_updated_at();

-- Abuse limit: a host can have a handful of unfinished rooms at once.
create function private.limit_rooms_per_host() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (select count(*) from public.rooms where host_id = new.host_id and status <> 'ended') >= 5 then
		raise exception 'Too many open rooms; end one first' using errcode = 'P0001';
	end if;
	return new;
end;
$$;

create trigger rooms_limit_per_host before insert on public.rooms
	for each row execute function private.limit_rooms_per_host();

alter table public.rooms enable row level security;

revoke all on public.rooms from anon, authenticated;
grant select, delete on public.rooms to authenticated;
grant insert (name, auto_approve) on public.rooms to authenticated;
grant update (name, status, auto_approve) on public.rooms to authenticated;

-- ---------------------------------------------------------------------------
-- Room membership
-- ---------------------------------------------------------------------------

create table public.room_members (
	room_id uuid not null references public.rooms (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null default 'player'
		constraint role_valid check (role in ('player', 'screen', 'audience', 'moderator')),
	status text not null default 'pending'
		constraint status_valid check (status in ('pending', 'approved', 'kicked', 'banned')),
	joined_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (room_id, user_id)
);

create index room_members_user_id_idx on public.room_members (user_id);

create trigger room_members_touch before update on public.room_members
	for each row execute function private.touch_updated_at();

alter table public.room_members enable row level security;

revoke all on public.room_members from anon, authenticated;
-- Inserts only happen through public.request_join().
grant select, delete on public.room_members to authenticated;
grant update (role, status) on public.room_members to authenticated;

-- ---------------------------------------------------------------------------
-- Policy helpers
-- ---------------------------------------------------------------------------

create function private.is_host(p_room_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (select 1 from public.rooms where id = p_room_id and host_id = auth.uid());
$$;

create function private.member_status(p_room_id uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
	select status from public.room_members where room_id = p_room_id and user_id = auth.uid();
$$;

create function private.member_role(p_room_id uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
	select role from public.room_members
	where room_id = p_room_id and user_id = auth.uid() and status = 'approved';
$$;

create function private.is_approved(p_room_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.room_members
		where room_id = p_room_id and user_id = auth.uid() and status = 'approved'
	);
$$;

-- Whether the current user may see another user's profile: hosts see everyone
-- who has asked to join their rooms; approved members see the host and the
-- other approved members.
create function private.shares_room_with(p_other uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.room_members m
		join public.rooms r on r.id = m.room_id
		where m.user_id = p_other and r.host_id = auth.uid()
	) or exists (
		select 1
		from public.room_members me
		join public.rooms r on r.id = me.room_id
		where me.user_id = auth.uid()
			and me.status = 'approved'
			and (
				r.host_id = p_other
				or exists (
					select 1 from public.room_members other
					where other.room_id = r.id and other.user_id = p_other and other.status = 'approved'
				)
			)
	);
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function
	private.generate_join_code(), -- evaluated as the inserting user (rooms.code default)
	private.is_host(uuid),
	private.member_status(uuid),
	private.member_role(uuid),
	private.is_approved(uuid),
	private.shares_room_with(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy "own profile or shared room" on public.profiles
	for select to authenticated
	using (user_id = (select auth.uid()) or private.shares_room_with(user_id));

create policy "create own profile" on public.profiles
	for insert to authenticated
	with check (user_id = (select auth.uid()));

create policy "update own profile" on public.profiles
	for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

create policy "host or member reads room" on public.rooms
	for select to authenticated
	using (host_id = (select auth.uid()) or private.member_status(id) is not null);

create policy "allowed hosts create rooms" on public.rooms
	for insert to authenticated
	with check (host_id = (select auth.uid()) and (select public.can_host()));

create policy "host updates room" on public.rooms
	for update to authenticated
	using (host_id = (select auth.uid()))
	with check (host_id = (select auth.uid()));

create policy "host deletes room" on public.rooms
	for delete to authenticated
	using (host_id = (select auth.uid()));

create policy "see own membership, roster, or own room's members" on public.room_members
	for select to authenticated
	using (
		user_id = (select auth.uid())
		or private.is_host(room_id)
		or (status = 'approved' and private.is_approved(room_id))
	);

create policy "host manages members" on public.room_members
	for update to authenticated
	using (private.is_host(room_id))
	with check (private.is_host(room_id));

-- Members can leave, but a ban can't be erased by leaving.
create policy "leave or host removes" on public.room_members
	for delete to authenticated
	using (
		(user_id = (select auth.uid()) and status <> 'banned')
		or private.is_host(room_id)
	);

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------

-- Ask to join a room by its code. Returns the room and the caller's resulting
-- membership status. Rejoining is idempotent; a kicked member may ask again;
-- a banned member may not. Rooms can't be listed or looked up any other way
-- by non-members.
create function public.request_join(p_code text, p_role text default 'player')
returns table (room_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_room public.rooms;
	v_existing public.room_members;
	v_status text;
begin
	if v_uid is null then
		raise exception 'Not signed in' using errcode = '28000';
	end if;

	if p_role not in ('player', 'screen', 'audience') then
		raise exception 'Invalid role' using errcode = '22023';
	end if;

	select * into v_room from public.rooms r
	where r.code = upper(btrim(p_code)) and r.status <> 'ended';

	if not found then
		raise exception 'Room not found' using errcode = 'P0002';
	end if;

	if v_room.host_id = v_uid then
		raise exception 'The host cannot join their own room' using errcode = 'P0001';
	end if;

	select * into v_existing from public.room_members m
	where m.room_id = v_room.id and m.user_id = v_uid;

	if found then
		if v_existing.status = 'banned' then
			raise exception 'Banned from this room' using errcode = '42501';
		elsif v_existing.status = 'kicked' then
			v_status := case when v_room.auto_approve then 'approved' else 'pending' end;
			update public.room_members m set status = v_status, role = p_role
			where m.room_id = v_room.id and m.user_id = v_uid;
		else
			v_status := v_existing.status;
		end if;
	else
		if (
			select count(*) from public.room_members m
			where m.room_id = v_room.id and m.status in ('pending', 'approved')
		) >= 40 then
			raise exception 'Room is full' using errcode = 'P0001';
		end if;

		v_status := case when v_room.auto_approve then 'approved' else 'pending' end;
		insert into public.room_members (room_id, user_id, role, status)
		values (v_room.id, v_uid, p_role, v_status);
	end if;

	update public.rooms r set updated_at = now() where r.id = v_room.id;

	return query select v_room.id, v_status;
end;
$$;

revoke execute on function public.request_join(text, text) from public, anon;
grant execute on function public.request_join(text, text) to authenticated;
