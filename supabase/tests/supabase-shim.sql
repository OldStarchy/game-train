-- Minimal stand-in for the parts of Supabase the migrations depend on, so the
-- migrations and their policies can be tested in an embedded Postgres
-- (PGlite). This is a test double: it mirrors Supabase's documented
-- behaviour (auth.uid()/auth.jwt() read the request's JWT claims;
-- realtime.topic() is the topic being joined), not its implementation.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (
	id uuid primary key default gen_random_uuid(),
	is_anonymous boolean not null default false,
	created_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

create function auth.uid() returns uuid
language sql stable
as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

grant execute on function auth.jwt(), auth.uid() to anon, authenticated;

create schema realtime;
grant usage on schema realtime to anon, authenticated;

create table realtime.messages (
	id bigserial primary key,
	topic text not null,
	extension text not null,
	payload jsonb,
	event text,
	private boolean default true,
	inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to authenticated;
grant usage on sequence realtime.messages_id_seq to authenticated;

create function realtime.topic() returns text
language sql stable
as $$ select nullif(current_setting('realtime.topic', true), '') $$;

grant execute on function realtime.topic() to anon, authenticated;
