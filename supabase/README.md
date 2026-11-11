# Supabase

Backend for auth, realtime messaging and persistence. Access control is done
with Postgres Row-Level Security (RLS); see `docs/design.md`, "Access and
moderation".

## One-time project setup

1. **Create the project** in the Sydney region with these settings:
   - _Enable Data API_: **on** (supabase-js uses it).
   - _Automatically expose new tables_: **off**. Migrations grant access to
     each table explicitly.
   - _Enable automatic RLS_: **on**, as a safety net. Migrations also enable
     RLS explicitly.
   - Postgres type: plain Postgres.
2. **Authentication → Sign In / Providers:** enable _Anonymous sign-ins_
   (players). Discord/Twitch providers for hosts are set up in milestone 2.
3. **Realtime → Settings:** turn off _Allow public access_, so only private
   channels (authorised by RLS) can be used.
4. Copy the project URL and anon key into `.env.local` (see `.env.example`)
   and into the GitHub repo as Actions _variables_ `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. Both are safe to expose.

## Secrets

The **database password** is for the `postgres` superuser, which bypasses RLS.
Keep it in a password manager. It never goes in the app, `.env.local` or the
repo. CI uses it inside `SUPABASE_DB_URL`: the **session pooler** connection
string (IPv4; GitHub runners can't reach the IPv6-only direct connection),
stored as a secret of the `supabase-production` environment, which only `main`
can use. Special characters in the password must be URL-encoded in that
string. The password can be reset in the project's database settings (then
update the secret).

No Supabase access token is needed: migrations connect to the database
directly.

The **service role key** bypasses RLS too, and must never be used in the app.

## Migrations

Schema, RLS policies, realtime policies and grants live in `migrations/` and
are applied by the `migrate` job in `.github/workflows/deploy.yml` when
changes reach `main` (before the app is built and deployed). It uses the
`SUPABASE_DB_URL` secret from the `supabase-production` environment, which is
restricted to `main`.

Every table migration must:

- enable RLS and revoke default privileges before granting only what clients
  need,
- add size limits on user-writable columns,
- keep security-definer helpers in the `private` schema with
  `set search_path = ''`, and revoke execute from `public` and `anon`.

Migrations are append-only once merged: fix mistakes with a new migration.

### Tests

`tests/policies.test.ts` applies every migration to an embedded Postgres
(PGlite) and checks the access rules as different users: who can create rooms,
join, see profiles, and send or receive on each realtime topic.
`tests/supabase-shim.sql` stands in for Supabase's `auth` and `realtime`
schemas. They run with the rest of the tests (`npm test`).

## Adding a host

Hosting is invite-only. Once someone has signed in on the host page, add them
to the allow-list in the SQL editor:

```sql
insert into public.allowed_hosts (user_id, note)
values ('<their user id, shown on the host page>', 'who this is');
```
