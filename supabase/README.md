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
repo. It's used only by the Supabase CLI (`supabase link`, `supabase db push`)
and, once migrations are deployed from CI, as the repository _secret_
`SUPABASE_DB_PASSWORD`. It can be reset in the project's database settings.

The **service role key** bypasses RLS too, and must never be used in the app.

## Migrations

Schema, RLS policies, realtime policies and grants live in `migrations/`
(from milestone 2) and are applied with the Supabase CLI. Every table
migration must:

- enable RLS,
- grant only the privileges clients need,
- add size limits on user-writable columns.
