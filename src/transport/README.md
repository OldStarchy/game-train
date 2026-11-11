# transport

`types.ts` defines the `Transport` interface: a `HostLink` for the host's side
of a room and a `DeviceLink` for a member's.

- `supabase.ts`: private Realtime channels on the topics in
  `protocol/topics.ts`, which the database policies authorize.
- `memory.ts`: in-process network for tests and local multi-role
  development; can simulate devices going offline.

Every inbound payload is parsed with its schema from `protocol/messages.ts`
here, before anything else sees it. Invalid payloads are dropped.
