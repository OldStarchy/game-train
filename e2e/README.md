# End-to-end tests

A host and two players play a round in real browsers, against a local
Supabase stack with this repo's migrations: real auth, database policies and
Realtime authorization. Runs in CI (`.github/workflows/e2e.yml`).

To run locally (needs Docker):

```sh
npx supabase start
eval "$(node e2e/supabase-env.mjs | sed 's/^/export /')"
npm run build
npx playwright install chromium
npx playwright test
```
