# engine

Pure game logic. Runs on the host device only.

- No React, DOM, network, `Date.now()`, `Math.random()` (lint-enforced).
  Time and randomness arrive through the reducer context.
- Segment types live in `segments/<type>/`, each with its config schema,
  reducer, per-device view builder and tests.
- Output is new state plus effects, and a view per device. Views never contain
  information the receiving device shouldn't see.

Built in milestone 3–4; see `docs/design.md`.
