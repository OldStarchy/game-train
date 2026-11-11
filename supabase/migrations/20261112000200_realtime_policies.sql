-- Realtime Authorization for game channels.
-- Topic layout (docs/design.md, "Channel layout and trust"):
--
--   room:{room_id}:public      host sends; host and approved members receive
--   room:{room_id}:to:{uid}    host sends; only approved member {uid} receives
--   room:{room_id}:from:{uid}  only approved member {uid} sends; host receives
--   room:{room_id}:audience    approved audience members send; host receives
--
-- A broadcast doesn't carry an authenticated sender, so sender identity comes
-- from the topic. Only broadcast is allowed; presence payloads are
-- client-controlled, so connection status is tracked by the host instead.

create function private.parse_room_topic(p_topic text, out room_id uuid, out kind text, out subject text)
language plpgsql
immutable
set search_path = ''
as $$
declare
	parts text[] := string_to_array(p_topic, ':');
	n int := coalesce(array_length(parts, 1), 0);
begin
	if n not in (3, 4)
		or parts[1] <> 'room'
		or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
	then
		return;
	end if;

	if (n = 3 and parts[3] in ('public', 'audience'))
		or (n = 4 and parts[3] in ('to', 'from') and parts[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
	then
		room_id := parts[2]::uuid;
		kind := parts[3];
		subject := parts[4];
	end if;
end;
$$;

create function private.can_receive(p_topic text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	t record := private.parse_room_topic(p_topic);
begin
	if t.room_id is null then
		return false;
	end if;
	return case t.kind
		when 'public' then private.is_host(t.room_id) or private.is_approved(t.room_id)
		when 'to' then t.subject = auth.uid()::text and private.is_approved(t.room_id)
		when 'from' then private.is_host(t.room_id)
		when 'audience' then private.is_host(t.room_id)
		else false
	end;
end;
$$;

create function private.can_send(p_topic text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	t record := private.parse_room_topic(p_topic);
begin
	if t.room_id is null then
		return false;
	end if;
	return case t.kind
		when 'public' then private.is_host(t.room_id)
		when 'to' then private.is_host(t.room_id)
		when 'from' then t.subject = auth.uid()::text and private.is_approved(t.room_id)
		when 'audience' then private.member_role(t.room_id) = 'audience'
		else false
	end;
end;
$$;

revoke execute on function
	private.parse_room_topic(text),
	private.can_receive(text),
	private.can_send(text)
from public, anon;
grant execute on function
	private.parse_room_topic(text),
	private.can_receive(text),
	private.can_send(text)
to authenticated;

create policy "game-train: receive room broadcasts" on realtime.messages
	for select to authenticated
	using (realtime.messages.extension = 'broadcast' and private.can_receive((select realtime.topic())));

create policy "game-train: send room broadcasts" on realtime.messages
	for insert to authenticated
	with check (realtime.messages.extension = 'broadcast' and private.can_send((select realtime.topic())));

-- Membership changes reach hosts (join requests) and players (approval, kick)
-- through Postgres Changes, which applies the room_members select policy.
do $$
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		alter publication supabase_realtime add table public.room_members;
	end if;
end;
$$;
