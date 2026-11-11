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
- Choose the most appropriate tool for a problem, not the quickest one to
  write. Implementation effort is cheap here; maintainability is not.

## Commits

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
`chore:`). Small, focused PRs.
