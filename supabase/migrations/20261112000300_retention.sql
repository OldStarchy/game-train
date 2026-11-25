-- Short-lived data (docs/design.md, "Abuse limits"): idle rooms and stale
-- anonymous users are deleted on a schedule.

create function private.purge_expired() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	-- Rooms with no activity for a day, with their memberships (cascade).
	delete from public.rooms where updated_at < now() - interval '24 hours';

	-- Anonymous users older than 30 days who aren't in any remaining room.
	-- Profiles cascade.
	delete from auth.users u
	where u.is_anonymous is true
		and u.created_at < now() - interval '30 days'
		and not exists (select 1 from public.room_members m where m.user_id = u.id);
end;
$$;

revoke execute on function private.purge_expired() from public, anon, authenticated;

-- Hourly, where pg_cron is available (it is on Supabase; test databases skip).
do $$
begin
	if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
		create extension if not exists pg_cron with schema pg_catalog;
		grant usage on schema cron to postgres;
		grant all privileges on all tables in schema cron to postgres;
		perform cron.schedule('game-train-purge-expired', '17 * * * *', 'select private.purge_expired()');
	end if;
end;
$$;
