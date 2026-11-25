-- Create or update the caller's profile in one statement.
--
-- The client previously used a PostgREST upsert, which generates
-- `on conflict do update set <every sent column>`, including user_id. Clients
-- may only update display_name and avatar, so Postgres refused it. This
-- function updates only those columns and takes the user id from the session.
-- SECURITY INVOKER: the profiles grants and RLS policies still apply.

create function public.save_profile(p_display_name text, p_avatar text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
	insert into public.profiles (user_id, display_name, avatar)
	values (auth.uid(), p_display_name, p_avatar)
	on conflict (user_id) do update
		set display_name = excluded.display_name,
			avatar = excluded.avatar;
$$;

revoke execute on function public.save_profile(text, text) from public, anon;
grant execute on function public.save_profile(text, text) to authenticated;
