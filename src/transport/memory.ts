import {
	DeviceMessageSchema,
	HostBroadcastMessageSchema,
	HostDirectMessageSchema,
	type DeviceMessage,
	type HostBroadcastMessage,
	type HostDirectMessage,
	type HostMessage,
} from '../protocol/messages';
import { topics, type RoomId, type UserId } from '../protocol/topics';
import { Listeners } from '../lib/listeners';
import type { DeviceLink, HostLink, LinkState, Transport, Unsubscribe } from './types';

/**
 * In-process stand-in for Supabase Realtime, for tests and for running
 * several roles in one browser. Messages are delivered asynchronously and
 * validated like real network input. Sender identity comes from the link,
 * as it comes from the topic in production. Access control is not
 * simulated; that's tested against the database policies.
 */
export class MemoryNetwork {
	private readonly subscribers = new Map<string, Set<(payload: unknown) => void>>();
	private readonly offline = new Set<UserId>();

	/** A transport acting as `userId`. */
	transportFor(userId: UserId): Transport {
		return {
			host: (roomId) => new MemoryHostLink(this, roomId),
			device: (roomId, deviceUserId) => {
				if (deviceUserId !== userId) throw new Error('A device can only act as its own user');
				return new MemoryDeviceLink(this, roomId, userId);
			},
		};
	}

	/** Simulate a device losing (or regaining) its connection. */
	setOnline(userId: UserId, online: boolean): void {
		if (online) this.offline.delete(userId);
		else this.offline.add(userId);
		this.connectivity.emit(userId, online);
	}

	isOnline(userId: UserId): boolean {
		return !this.offline.has(userId);
	}

	/** @internal */
	readonly connectivity = new Listeners<[UserId, boolean]>();

	/** @internal Deliver a JSON-cloned payload to a topic's subscribers, later. */
	publish(topic: string, payload: unknown): void {
		const copy: unknown = JSON.parse(JSON.stringify(payload));
		const handlers = this.subscribers.get(topic);
		if (!handlers) return;
		for (const handler of [...handlers]) {
			queueMicrotask(() => {
				handler(copy);
			});
		}
	}

	/** @internal */
	subscribe(topic: string, handler: (payload: unknown) => void): Unsubscribe {
		let set = this.subscribers.get(topic);
		if (!set) {
			set = new Set();
			this.subscribers.set(topic, set);
		}
		set.add(handler);
		return () => {
			set.delete(handler);
		};
	}
}

class MemoryHostLink implements HostLink {
	state: LinkState = 'connected';
	private readonly members = new Map<UserId, Unsubscribe>();
	private readonly messages = new Listeners<[UserId, DeviceMessage]>();
	private readonly states = new Listeners<[LinkState]>();

	constructor(
		private readonly network: MemoryNetwork,
		readonly roomId: RoomId,
	) {}

	setMembers(userIds: Iterable<UserId>): void {
		const wanted = new Set(userIds);
		for (const [id, unsubscribe] of this.members) {
			if (!wanted.has(id)) {
				unsubscribe();
				this.members.delete(id);
			}
		}
		for (const id of wanted) {
			if (this.members.has(id)) continue;
			this.members.set(
				id,
				this.network.subscribe(topics.from(this.roomId, id), (payload) => {
					const parsed = DeviceMessageSchema.safeParse(payload);
					if (parsed.success && this.state !== 'closed') this.messages.emit(id, parsed.data);
				}),
			);
		}
	}

	broadcast(message: HostBroadcastMessage): Promise<void> {
		this.network.publish(topics.public(this.roomId), message);
		return Promise.resolve();
	}

	sendTo(userId: UserId, message: HostDirectMessage): Promise<void> {
		this.network.publish(topics.to(this.roomId, userId), message);
		return Promise.resolve();
	}

	onMessage(handler: (from: UserId, message: DeviceMessage) => void): Unsubscribe {
		return this.messages.add(handler);
	}

	onStateChange(handler: (state: LinkState) => void): Unsubscribe {
		return this.states.add(handler);
	}

	close(): Promise<void> {
		this.setMembers([]);
		this.state = 'closed';
		this.states.emit('closed');
		this.messages.clear();
		return Promise.resolve();
	}
}

class MemoryDeviceLink implements DeviceLink {
	state: LinkState;
	private readonly messages = new Listeners<[HostMessage]>();
	private readonly states = new Listeners<[LinkState]>();
	private readonly cleanup: Unsubscribe[];

	constructor(
		private readonly network: MemoryNetwork,
		readonly roomId: RoomId,
		readonly userId: UserId,
	) {
		this.state = network.isOnline(userId) ? 'connected' : 'connecting';
		const receive =
			(schema: typeof HostBroadcastMessageSchema | typeof HostDirectMessageSchema) =>
			(payload: unknown) => {
				if (!this.network.isOnline(this.userId) || this.state === 'closed') return;
				const parsed = schema.safeParse(payload);
				if (parsed.success) this.messages.emit(parsed.data);
			};
		this.cleanup = [
			network.subscribe(topics.public(roomId), receive(HostBroadcastMessageSchema)),
			network.subscribe(topics.to(roomId, userId), receive(HostDirectMessageSchema)),
			network.connectivity.add((id, online) => {
				if (id !== userId || this.state === 'closed') return;
				this.setState(online ? 'connected' : 'reconnecting');
			}),
		];
	}

	private setState(state: LinkState) {
		if (state === this.state) return;
		this.state = state;
		this.states.emit(state);
	}

	send(message: DeviceMessage): Promise<void> {
		if (this.network.isOnline(this.userId) && this.state !== 'closed') {
			this.network.publish(topics.from(this.roomId, this.userId), message);
		}
		return Promise.resolve();
	}

	onMessage(handler: (message: HostMessage) => void): Unsubscribe {
		return this.messages.add(handler);
	}

	onStateChange(handler: (state: LinkState) => void): Unsubscribe {
		return this.states.add(handler);
	}

	close(): Promise<void> {
		for (const fn of this.cleanup) fn();
		this.setState('closed');
		this.messages.clear();
		return Promise.resolve();
	}
}
