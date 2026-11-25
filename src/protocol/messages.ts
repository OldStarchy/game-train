import { z } from 'zod';
import { UserIdSchema } from './topics';

/**
 * Messages exchanged over realtime topics. Every inbound message is parsed
 * with these schemas before use; anything that doesn't parse is dropped.
 * Limits on strings and arrays bound the work a malicious peer can cause.
 */

export const PROTOCOL_VERSION = 1;

const timestamp = z.number().nonnegative();
const shortText = (max: number) => z.string().max(max);

// ---------------------------------------------------------------------------
// Device → host (room:{id}:from:{uid})
// ---------------------------------------------------------------------------

/** Sent whenever a device (re)connects; the host replies with current state. */
export const HelloSchema = z.object({
	type: z.literal('hello'),
	protocol: z.number().int(),
});

/** Clock calibration and heartbeat. `sentAt` is the device's monotonic clock. */
export const PingSchema = z.object({
	type: z.literal('ping'),
	id: z.number().int().nonnegative(),
	sentAt: timestamp,
});

/** The device is leaving deliberately (tab closed, left the room). */
export const ByeSchema = z.object({ type: z.literal('bye') });

export const DeviceMessageSchema = z.discriminatedUnion('type', [
	HelloSchema,
	PingSchema,
	ByeSchema,
]);
export type DeviceMessage = z.infer<typeof DeviceMessageSchema>;

// ---------------------------------------------------------------------------
// Host → one device (room:{id}:to:{uid})
// ---------------------------------------------------------------------------

export const PongSchema = z.object({
	type: z.literal('pong'),
	id: z.number().int().nonnegative(),
	/** Host's monotonic clock when the ping was handled. */
	hostTime: timestamp,
});

export const KickedSchema = z.object({
	type: z.literal('kicked'),
	banned: z.boolean(),
});

/**
 * What the device should show. Milestone 2 has only lobby screens; the widget
 * view tree (docs/design.md, "Concepts") extends this in milestone 3.
 */
export const ViewSchema = z.discriminatedUnion('screen', [
	z.object({ screen: z.literal('lobby'), message: shortText(200).optional() }),
]);
export type View = z.infer<typeof ViewSchema>;

export const ViewMessageSchema = z.object({
	type: z.literal('view'),
	/** Increases with every view sent to this device; stale views are ignored. */
	seq: z.number().int().nonnegative(),
	view: ViewSchema,
});

export const HostDirectMessageSchema = z.discriminatedUnion('type', [
	PongSchema,
	KickedSchema,
	ViewMessageSchema,
]);
export type HostDirectMessage = z.infer<typeof HostDirectMessageSchema>;

// ---------------------------------------------------------------------------
// Host → everyone (room:{id}:public)
// ---------------------------------------------------------------------------

export const RosterEntrySchema = z.object({
	userId: UserIdSchema,
	name: shortText(32),
	avatar: shortText(16).nullable(),
	connected: z.boolean(),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

export const RosterSchema = z.object({
	type: z.literal('roster'),
	players: z.array(RosterEntrySchema).max(40),
});

export const RoomStateSchema = z.object({
	type: z.literal('room'),
	name: shortText(60),
	status: z.enum(['lobby', 'playing', 'ended']),
});

export const HostBroadcastMessageSchema = z.discriminatedUnion('type', [
	RosterSchema,
	RoomStateSchema,
]);
export type HostBroadcastMessage = z.infer<typeof HostBroadcastMessageSchema>;

/** Anything a device can receive, from either of its host topics. */
export type HostMessage = HostDirectMessage | HostBroadcastMessage;
