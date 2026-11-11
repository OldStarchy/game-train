# transport

The `Transport` interface and its implementations:

- `SupabaseTransport`: private Realtime channels (topic layout in
  `docs/design.md`, "Channel layout and trust").
- `MemoryTransport`: in-process, for tests and local multi-role development.

Every inbound message is parsed with its Zod schema from `protocol/` here,
before anything else sees it.

Built in milestone 2.
