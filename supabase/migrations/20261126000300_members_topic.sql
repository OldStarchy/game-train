-- Private topic for membership change notifications: room:{room_id}:members.
--
-- The membership watcher used a public channel, which is refused when the
-- project's Realtime "Allow public access" setting is off (as recommended).
-- The host and anyone with a membership row in the room (pending included, so
-- they learn they were approved; kicked/banned, so they learn that too) may
-- join. Nobody may send on it. The Postgres Changes events delivered on it are
-- still filtered by the room_members select policy.

create or replace function private.parse_room_topic(p_topic text, out room_id uuid, out kind text, out subject text)
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

	if (n = 3 and parts[3] in ('public', 'audience', 'members'))
		or (n = 4 and parts[3] in ('to', 'from') and parts[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
	then
		room_id := parts[2]::uuid;
		kind := parts[3];
		subject := parts[4];
	end if;
end;
$$;

create or replace function private.can_receive(p_topic text) returns boolean
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
		when 'to' then
			private.is_host(t.room_id)
			or (t.subject = auth.uid()::text and private.is_approved(t.room_id))
		when 'from' then
			private.is_host(t.room_id)
			or (t.subject = auth.uid()::text and private.is_approved(t.room_id))
		when 'audience' then private.is_host(t.room_id)
		when 'members' then private.is_host(t.room_id) or private.member_status(t.room_id) is not null
		else false
	end;
end;
$$;
-- private.can_send is unchanged: it has no 'members' case, so nobody can send.
