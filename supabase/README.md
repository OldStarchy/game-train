# Supabase

Backend for auth (anonymous sign-ins), realtime messaging and persistence.

## One-time project setup

1. Create a Supabase project (pick the Sydney region, `ap-southeast-2`).
2. **Authentication → Sign In / Providers:** enable _Anonymous sign-ins_.
3. **Realtime → Settings:** turn off _Allow public access_, so only private
   channels (authorised by RLS) can be used.
4. Copy the project URL and anon key into `.env.local` (see `.env.example`)
   and into the GitHub repo as Actions _variables_ `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.

Schema, RLS and realtime policies live in `migrations/` (from milestone 2) and
are applied with the Supabase CLI.
