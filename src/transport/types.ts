import type {
	DeviceMessage,
	HostBroadcastMessage,
	HostDirectMessage,
	HostMessage,
} from '../protocol/messages';
import type { RoomId, UserId } from '../protocol/topics';

import type { Unsubscribe } from '../lib/listeners';

export type { Unsubscribe };

/**
 * - `connecting`: first connection attempt.
 * - `connected`: all channels joined.
 * - `reconnecting`: a channel dropped or errored; the client is retrying.
 * - `closed`: closed deliberately.
 */
export type LinkState = 'connecting' | 'connected' | 'reconnecting' | 'closed';

/** The host's side of a room: one public topic, plus a pair per member. */
export interface HostLink {
	readonly roomId: RoomId;
	readonly state: LinkState;

	/** Members to hold per-device channels for. Adds and removes channels to match. */
	setMembers(userIds: Iterable<UserId>): void;

	broadcast(message: HostBroadcastMessage): Promise<void>;
	sendTo(userId: UserId, message: HostDirectMessage): Promise<void>;

	/** `from` is the topic's user id, which the server authorizes: it can't be spoofed. */
	onMessage(handler: (from: UserId, message: DeviceMessage) => void): Unsubscribe;
	onStateChange(handler: (state: LinkState) => void): Unsubscribe;

	close(): Promise<void>;
}

/** A member device's side of a room. */
export interface DeviceLink {
	readonly roomId: RoomId;
	readonly userId: UserId;
	readonly state: LinkState;

	send(message: DeviceMessage): Promise<void>;

	onMessage(handler: (message: HostMessage) => void): Unsubscribe;
	onStateChange(handler: (state: LinkState) => void): Unsubscribe;

	close(): Promise<void>;
}

export interface Transport {
	host(roomId: RoomId): HostLink;
	device(roomId: RoomId, userId: UserId): DeviceLink;
}

/** Called with messages that failed validation; for logging in development. */
export type InvalidMessageHandler = (topic: string, payload: unknown) => void;
