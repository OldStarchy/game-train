# game-train — design

A build-your-own game show system in the spirit of _Game Changer_, played on
phones. One person hosts; players join by scanning a QR code; the host's
device drives what every phone shows. Works in the same room, over a Discord
call, or with a Twitch audience.

This document records the decisions the code is built on. When a decision
changes, update this file in the same PR.

## Goals

- **Playable with no setup beyond phones.** A shared TV screen is optional;
  only game formats that genuinely need one may require it.
- **Remote-first networking.** Players may be in different houses on different
  networks. Spectators may be a Twitch audience.
- **Improvisation first, automation second.** The host can always take manual
  control: push any widget to anyone, change scores, skip, undo. Presets
  automate the common formats on top of the same primitives, and the "happy
  path" through a preset needs only a few host taps.
- **Many independent rooms.** Any number of games can run at once.
- **Static hosting.** The app is a static site on GitHub Pages (HTTPS, which
  Screen Wake Lock needs). Supabase provides auth, realtime and storage. No
  server we run ourselves.
- **Safe to leave public.** The site is publicly reachable, but hosting is
  invite-only and nothing anyone can do with the public client lets them use
  our Supabase project as general-purpose storage. See _Access and
  moderation_.
- **AI-assisted authoring.** An in-app assistant can build and edit
  programmes and custom screens. See _AI-assisted authoring_.

## Non-goals (for now)

- Password accounts. Players are anonymous (one identity per device); hosts
  sign in with Discord or Twitch.
- Arbitrary code in the engine or with app privileges. Programmes are data.
  User- or AI-written _rendering_ code may run later, but only inside a
  sandbox; see _AI-assisted authoring_.
- Open sign-up for hosting, for now. See _Access and moderation_.

## Concepts

| Term             | Meaning                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Profile**      | A person's display name and optional avatar. Stored locally and mirrored to Supabase under their anonymous user id.       |
| **Party**        | A persistent group of people playing together over an evening (the Discord call, the lounge room). Survives across games. |
| **Room**         | One running game within a party. Has a join code, a host, and a programme.                                                |
| **Host**         | The device currently running the engine for a room. Holds the _host lease_.                                               |
| **Role**         | What a connected device is in a room: `host`, `player`, `screen`, `audience`, `moderator`.                                |
| **Programme**    | The full script of a game: an ordered list of segments plus settings. Pure data (JSON).                                   |
| **Segment**      | One part of a programme (a round, an intro, a scoreboard reveal). Each segment has a _segment type_.                      |
| **Segment type** | A module implementing one format: `manual`, `buzzer-quiz`, `category-board`, `noise-boys`, `prompt-and-vote`, …           |
| **Widget**       | A UI primitive a phone can render: text, buzzer, text input, choice, vote, colour/pattern flash, secret card, timer.      |
| **View**         | What one device should be showing right now: a tree of widgets, computed by the engine per device.                        |

Parties make "someone else hosts the next game" cheap: the new host creates a
room in the same party and everyone's phone follows them there. Programmes are
shareable data (link or file), so the new host can run any game.

## Architecture

```
  ┌──────────────────────── host device ────────────────────────┐
  │  Host UI (control panel)                                     │
  │      │ host commands                                         │
  │      ▼                                                       │
  │  Engine (pure TS)  ── state + event log ──► Supabase (snapshot)
  │      │ per-device views                                      │
  │      ▼                                                       │
  │  Transport ─────────────────────────────────────────────────┼──► Supabase Realtime
  └──────────────────────────────────────────────────────────────┘          │
                                                                            ▼
                         player phones / screen / audience  (thin renderers)
```

### Host-authoritative engine

- The host device runs the engine and is the single source of truth.
  Other devices render the view they're sent and send back inputs
  (`buzz`, `submit`, `vote`, …). They never compute game logic.
- **Per-device views.** The engine computes a view for each device. Secret
  information is only ever sent to the device that should see it. This is
  essential for _Game Changer_-style hidden rules and roles.
- The engine is **pure TypeScript with no DOM, network or time access**.
  Segment types are reducers: `(state, action, ctx) → { state, effects }`.
  Time and randomness come in through `ctx`, so everything is deterministic
  and unit-testable.
- **Event log.** The host keeps the ordered list of actions (player inputs and
  host commands), not just current state. This gives undo / corrections, and
  replay for debugging.
- **Host lease.** The authoritative state snapshot (plus log tail) is persisted
  to Supabase. If the host tab reloads, it resumes from the snapshot. Hosting
  can be handed to another device by transferring the lease; that device loads
  the snapshot and carries on. This is the same mechanism as crash recovery.

### Networking: Supabase Realtime

Chosen over PeerJS/WebRTC from the start because it works in more situations:

- It's WebSockets over HTTPS to Supabase, so it works on any network that can
  load a web page. WebRTC needs NAT traversal and fails on some mobile and
  corporate networks without a TURN server we'd have to run or pay for.
- Remote play and Twitch audiences mean many devices on many networks.
  A WebRTC star centred on the host's phone doesn't scale to an audience.
- We get anonymous auth (a stable user id per device) and Postgres in the same
  service, which the host lease and parties need anyway.

Costs and limits to design around (Supabase Free plan at time of writing; see
the [Realtime limits docs](https://supabase.com/docs/guides/realtime/limits)):

| Limit                    | Free   | Pro      |
| ------------------------ | ------ | -------- |
| Simultaneous connections | 200    | 500      |
| Messages per second      | 100    | 500      |
| Channels per connection  | 100    | 100      |
| Max broadcast payload    | 256 KB | 3,000 KB |

Consequences: views are sent as diffs or small snapshots, not re-sent wholesale
on every tick; timers run locally on each device from a deadline timestamp
rather than ticking over the network; audience inputs (votes) are batched or
sampled for large audiences.

#### Channel layout and trust

Channels are **private** (Realtime Authorization). RLS policies on
`realtime.messages` decide who can receive (`select`) and send (`insert`) on
each topic; see the
[authorization docs](https://supabase.com/docs/guides/realtime/authorization).

| Topic                | Host    | Player _u_         | Screen / audience |
| -------------------- | ------- | ------------------ | ----------------- |
| `room:{id}:public`   | send    | receive            | receive           |
| `room:{id}:to:{u}`   | send    | receive (only _u_) | —                 |
| `room:{id}:from:{u}` | receive | send (only _u_)    | —                 |
| `room:{id}:audience` | receive | —                  | send              |

A broadcast payload doesn't carry an authenticated sender, so **sender identity
comes from the topic**, enforced by RLS: only player _u_ can send on
`from:{u}`. Nobody can impersonate the host or another player.

Open question for the networking milestone: per-player topics cost the host
two channels per player against the 100-channels-per-connection limit, capping
a room at ~45 players. That's plenty for a game, but if it ever isn't, the
alternative is players inserting input rows into a table (RLS: `user_id =
auth.uid()`) with a trigger broadcasting them to the host. Decide with a spike,
not up front.

#### Transport interface

The engine and UI talk to a `Transport` interface, not to Supabase directly.
Implementations:

- `SupabaseTransport`: production.
- `MemoryTransport`: in-process, for engine/integration tests and for running
  several roles in one browser during development.

Every inbound message is validated with a Zod schema at the transport
boundary. Messages from other devices are untrusted input.

### Access and moderation

The site is public, so access control lives in the database (Postgres
Row-Level Security, "RLS") rather than in the app. The Supabase anon key in the
client only identifies the project; with RLS on, a request can do only what a
policy explicitly allows.

**Identity**

- **Players** sign in anonymously: the device gets a stable user id with no
  sign-up. A player can do nothing until a host admits them to a room.
- **Hosts** sign in with Discord or Twitch (Supabase OAuth). Creating parties
  and rooms requires a non-anonymous user who is on the **host allow-list**
  (`allowed_hosts`, managed in the Supabase dashboard). Hosting is invite-only
  until there's a reason to open it.
- Anonymous sign-ins are protected by CAPTCHA to stop bots creating users
  in bulk.

**Authorization**

- Every room-scoped table has a `room_id`; policies check membership in
  `room_members` (`status = 'approved'`). Joining inserts a pending membership;
  the host approves it, or the room is set to auto-approve.
- Realtime topic policies use the same membership rows (see _Channel layout
  and trust_).
- Tables are not exposed to the API by default: each migration explicitly
  grants what clients need, and RLS is enabled on every table.

**Abuse limits.** Because persistence is reachable from a public client:

- Every user-writable column has a size limit (check constraints), and
  per-room row counts are capped.
- No file uploads until a feature needs them; avatars start as generated
  images or emoji, not uploads.
- Data is short-lived. Rooms, their state snapshots and stale anonymous users
  are deleted after a retention period (scheduled cleanup in Postgres).
  Saved programmes belong to hosts and are the only long-lived data.

**Moderation.** Groups are self-moderating, with the host as moderator of
their room:

- Kick or ban a player (removes or blocks their membership; RLS then refuses
  their channel joins), rename them, and hide or clear their submitted text.
- Public-facing inputs (audience votes, free text shown on a screen) are off by
  default and must be enabled per room.

**Legal.** Before the app is used by anyone beyond friends, it needs a short
terms-of-use and privacy page: what's stored (device id, display name, game
data), how long it's kept, that content is user-generated and moderated by
hosts, and how to get data removed. This needs checking against whatever
applies (for example, Australia's Privacy Act) at that point; nothing here is
legal advice.

### Buzzers and timing

Phones' system clocks are usually NTP-synced, but accuracy isn't guaranteed
(automatic time can be off, and drift varies), and arrival order over the
internet is skewed by each player's latency. So:

1. **Clock offset calibration.** On join (and periodically), each device pings
   the host several times. Each sample estimates the offset as the host's
   timestamp minus the midpoint of the ping's send and receive times. Keep the
   sample with the lowest round-trip time, whose error is bounded by half that
   RTT. Timestamps use
   `performance.timeOrigin + performance.now()` so a system clock adjustment
   mid-game doesn't cause jumps.
2. **Press timestamps in host time.** A buzz carries the device's estimate of
   host time at the moment of the press.
3. **Judging window.** The host waits a short window (configurable, default
   ~250 ms) after the first buzz arrives, then awards the earliest timestamp
   received. A fair press that travelled further still wins.
4. **Trust setting.** Client timestamps can be faked. Per game:
   `trusted` (friends: use timestamps) or `untrusted` (public/Twitch: arrival
   order only).

### Programmes

- A programme is JSON validated by a Zod schema, versioned (`schemaVersion`)
  with migrations, so saved and shared programmes keep working.
- Built via **presets** and **wizards**: a wizard is a form that produces
  segment config for a segment type. The host can also edit programmes
  directly.
- **All edits are commands.** Wizards, the manual editor and the AI assistant
  all produce the same `ProgrammeEdit` operations (add segment, update segment
  config, reorder, set scoring, …). This gives one validation path, undo, and
  reviewable diffs ("the assistant wants to make these 3 changes").
- The `manual` segment type is the improvisation toolkit: the host pushes any
  widget to any set of devices and scores freely. Every automated segment type
  also allows manual override.
- Programmes can be exported as a file and shared via link (stored in
  Supabase).

## AI-assisted authoring

An in-app assistant (Claude) helps hosts build programmes and custom screens.

**Programme editing.** The assistant gets tools whose inputs are the
programme's own Zod schemas exported as JSON Schema, and it produces
`ProgrammeEdit` commands. Every proposed change goes through the same
validation as a hand-made edit, then the host previews the diff and accepts or
rejects it. The assistant can't produce a programme the engine can't run.

**Custom widgets and screens**, in two tiers:

1. **Declarative layouts.** A constrained component tree (stack, grid, text,
   image, scoreboard, timer, player list, …) with bindings into the device's
   view data, e.g. `{ "type": "text", "bind": "round.title" }`. Safe, portable
   and shareable; covers most custom audience screens. Built first.
2. **Sandboxed code**, as an escape hatch. Generated HTML/JS runs in an
   `<iframe sandbox="allow-scripts">` without `allow-same-origin`, so it has no
   access to the app's storage, cookies or Supabase session. A `postMessage`
   bridge gives it only that device's view and passes back inputs, validated
   with the same schemas as network input. This is what keeps a shared
   programme from doing anything on another person's device except draw.

**Connecting to Claude.** The static site can't hold an API key, so:

- **Bring your own key (chosen).** The host enters their own Anthropic API
  key. It is stored only on that device and the browser calls the API directly
  (the API supports browser requests when explicitly opted in). The host pays
  for their own usage; there's no infrastructure. The key is never included in
  programmes, exports, snapshots or anything sent over Realtime, and the app
  ships a strict Content Security Policy limiting where scripts can load from
  and where requests can go.
- **Copy/paste fallback.** "Copy prompt and schema" for use in any chat app,
  then paste the result back; it's validated like any other edit.
- **Later, if needed:** a Supabase Edge Function proxy holding a server-side
  key, with per-user rate limits, available only to allow-listed hosts.

All of these sit behind an `AiProvider` interface so the editor doesn't care
which is used.

## Client roles

- **Host:** control panel. Room setup and QR code, roster, programme
  navigation, a "next" button for the happy path, manual widget pushes,
  score adjustments, undo.
- **Player:** full-screen widget renderer. Requests a screen wake lock.
  Reconnects automatically and restores its seat (identity is the anonymous
  user id, so rejoining just works).
- **Screen:** optional big display (TV, laptop, OBS browser source for Twitch).
- **Audience:** spectator view, optionally with voting.
- **Moderator:** later, for formats that need a second trusted person.

## Code organisation

Single package: there is one deployable app. Revisit if a second deployable
appears (e.g. a Discord bot or Twitch extension sharing the engine).

```
src/
  engine/       pure game logic. No React, DOM, network, Date.now or Math.random.
    segments/   one folder per segment type
  protocol/     message and view types + Zod schemas shared by all roles
  transport/    Transport interface, Supabase and memory implementations
  widgets/      React components rendering widget view nodes
  roles/        host/, player/, screen/, audience/ — UI per role
  ai/           (later) AiProvider implementations and assistant tools
  app/          routing, providers, shell
  lib/          small framework-free utilities
supabase/
  migrations/   SQL: tables, RLS, realtime policies
```

Dependency rules (enforced by lint):

- `engine` imports only from `engine`, `protocol`, `lib`.
- `protocol` imports only from `protocol`, `lib`.
- `transport` doesn't import from `engine`, `widgets` or `roles`.
- `widgets` doesn't import from `roles` or `engine`.

## Stack

- Vite, React, TypeScript (strict)
- TanStack Router (hash history, for GitHub Pages; route params parsed with
  protocol schemas, so URLs are validated like any other untrusted input)
- Zod for schemas
- Supabase JS client
- Vitest for unit tests; Playwright later for multi-device end-to-end tests
  (several browser contexts as host + players)
- ESLint + Prettier
- GitHub Actions: CI on PRs, deploy to GitHub Pages from `main`

## Milestones

1. **Skeleton:** tooling, CI, Pages deploy, role routes, design doc.
2. **Networking + lobby:** anonymous auth for players, Discord/Twitch sign-in
   and allow-list for hosts, profiles, parties/rooms/membership tables with
   RLS and size limits, private channels, transport implementations, QR join
   with host approval, roster, kick, reconnect, wake lock, clock calibration,
   retention cleanup.
3. **Manual mode:** widget set, host pushes widgets, scoreboard, undo. First
   playable game night.
4. **Engine + first preset:** the category board ("Old West for $200").
5. **Presets and wizards:** buzzer quiz, Noise Boys, prompt-and-vote;
   programme save/share; screen and audience roles; host handover.
6. **AI-assisted authoring:** bring-your-own-key assistant for programme
   editing, then declarative custom screens, then the sandboxed code tier.

## Decision log

| Date       | Decision                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 2026-11-11 | Supabase Realtime from the start instead of PeerJS, for remote play and audiences.                                 |
| 2026-11-11 | Host-authoritative engine in the browser, with state persisted to Supabase (host lease) for recovery and handover. |
| 2026-11-11 | Shared screen is optional by default.                                                                              |
| 2026-11-11 | Buzzers use calibrated host-time timestamps plus a judging window, with an arrival-order mode for untrusted games. |
| 2026-11-11 | Single package; folder boundaries enforced by lint.                                                                |
| 2026-11-12 | TanStack Router instead of React Router, for schema-validated, type-safe route params.                             |
| 2026-11-12 | Players anonymous; hosts sign in with Discord/Twitch; hosting invite-only via an allow-list.                       |
| 2026-11-12 | Host moderates their room; public-facing inputs are opt-in; user data is size-limited and short-lived.             |
| 2026-11-12 | In-app AI assistant using the host's own API key; edits are validated `ProgrammeEdit` commands.                    |
| 2026-11-12 | User/AI-written rendering code only ever runs in a sandboxed iframe.                                               |
