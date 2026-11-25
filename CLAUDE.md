# game-train

A Game Changer-style party game show system: a host device drives what players'
phones show, over Supabase Realtime. Static site on GitHub Pages.

**Read `docs/design.md` before making architectural changes.** If a change
alters a decision recorded there, update the doc (including its decision log)
in the same PR.

## Commands

- `npm run dev`: dev server
- `npm run check`: typecheck + lint + tests (run before every commit)
- `npm run build`: production build
- `npm test`: tests in watch mode
- `npm run e2e`: Gherkin end-to-end scenarios (`e2e/features`) against a
  local Supabase stack; needs Docker, see `e2e/README.md`. They run in CI on
  every push (`.github/workflows/e2e.yml`).

## Rules

- **Engine purity.** `src/engine/**` has no React, DOM, network, `Date.now()`
  or `Math.random()`. Time and randomness come in through the reducer context.
  Every segment type has unit tests.
- **Layer boundaries** are enforced by ESLint (`no-restricted-imports` in
  `eslint.config.js`). Don't disable the rule; move code to the right layer.
- **Untrusted input.** Every message arriving over the network is parsed with
  its Zod schema in the transport layer before anything else touches it.
- **Per-device views.** Never broadcast state that contains information
  meant for one device. The engine computes views per device.
- **Access control lives in the database.** Every table enables RLS, gets
  explicit grants, and limits the size of user-writable columns. Never use the
  service role key in the app. See `supabase/README.md`.
- **Secrets stay on the device.** A user's API key is never put in programmes,
  exports, snapshots or anything sent over the network.
- **Programmes are data.** Changing the programme schema means bumping
  `schemaVersion` and adding a migration.
- **Types.** TypeScript strict. No `any`; prefer discriminated unions with
  exhaustive `switch` (use `assertNever` from `src/lib`).
- **New segment types** follow the structure of an existing one in
  `src/engine/segments/`; keep config schema, reducer, views and tests together.
- **End-to-end coverage.** A user-facing flow that crosses devices (host and
  players) gets a scenario in `e2e/features/*.feature`, written in plain
  language. Reuse existing steps in `e2e/steps/` where they fit. Unit tests
  can't catch problems that only appear with real Supabase (Realtime join
  checks, PostgREST-generated SQL); these scenarios do.
- Choose the most appropriate tool for a problem, not the quickest one to
  write. Implementation effort is cheap here; maintainability is not.

## Commits

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
`chore:`). Small, focused commits.

Commit and push straight to `main`; no PR or code review is needed. Run
`npm run check` first. Pushing to `main` deploys: new migrations are applied
to the production database, then the site is published. Watch the Deploy
workflow after pushing and fix any failure.

The Supabase project is on the free plan and pauses after about a week
without activity; while paused, the migrate job fails with "tenant/user not
found". Restore the project, then re-run the job.
