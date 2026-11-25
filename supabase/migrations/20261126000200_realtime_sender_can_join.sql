-- Realtime checks read permission when a client joins a channel, even if the
-- client only sends on it. The send-only topics (`to:{uid}` for the host,
-- `from:{uid}` for the member) were therefore refused on join and the links
-- never connected. Let the single authorized sender on each also read it.
-- Nothing is exposed: the only messages on those topics are the reader's own,
-- and nobody else gains access.

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
		else false
	end;
end;
$$;
