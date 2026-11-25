# engine

Pure game logic. Runs on the host device only.

- No React, DOM, network, `Date.now()`, `Math.random()` (lint-enforced).
  Time arrives through `ReducerContext` (`context.ts`). A reducer that needs
  to act later returns `wakeAt`, and the host dispatches `tick` then.
- Segment types live in `segments/<type>/`, each with its state, reducer,
  per-device view builder and tests. `segments/manual` is the first and the
  model for the rest.
- Views are computed per device and never contain information the receiving
  device shouldn't see (another player's answer, a hidden rule).
