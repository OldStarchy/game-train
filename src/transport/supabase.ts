import {
	REALTIME_SUBSCRIBE_STATES,
	type RealtimeChannel,
	type SupabaseClient,
} from '@supabase/supabase-js';
import {
	DeviceMessageSchema,
	HostBroadcastMessageSchema,
	HostDirectMessageSchema,
	type DeviceMessage,
	type HostBroadcastMessage,
	type HostDirectMessage,
	type HostMessage,
} from '../protocol/messages';
import { MESSAGE_EVENT, topics, type RoomId, type UserId } from '../protocol/topics';
import { Listeners } from '../lib/listeners';
import type {
	DeviceLink,
	HostLink,
	InvalidMessageHandler,
	LinkState,
	Transport,
	Unsubscribe,
} from './types';

const SEND_TIMEOUT_MS = 10_000;

type ChannelState = 'connecting' | 'connected' | 'reconnecting' | 'closed';

/**
 * One private Realtime channel. Waits for the join before sending, and
 * reports join state so links can aggregate it. realtime-js rejoins dropped
 * channels itself; this only observes.
 */
class ManagedChannel {
	readonly states = new Listeners<[ChannelState]>();
	state: ChannelState = 'connecting';
	private readonly channel: RealtimeChannel;
	private joined: Promise<void>;
	private resolveJoined: () => void = () => undefined;

	constructor(
		private readonly client: SupabaseClient,
		readonly topic: string,
		onPayload?: (payload: unknown) => void,
	) {
		this.joined = this.newJoinPromise();
		this.channel = client.channel(topic, {
			config: { private: true, broadcast: { self: false, ack: false } },
		});
		if (onPayload) {
			this.channel.on('broadcast', { event: MESSAGE_EVENT }, (message: { payload?: unknown }) => {
				onPayload(message.payload);
			});
		}
		this.channel.subscribe((status) => {
			if (this.state === 'closed') return;
			if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
				this.setState('connected');
				this.resolveJoined();
			} else if (this.state === 'connected') {
				this.joined = this.newJoinPromise();
				this.setState('reconnecting');
			}
		});
	}

	private newJoinPromise(): Promise<void> {
		return new Promise((resolve) => {
			this.resolveJoined = resolve;
		});
	}

	private setState(state: ChannelState) {
		if (state === this.state) return;
		this.state = state;
		this.states.emit(state);
	}

	async send(payload: unknown): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				reject(new Error(`Timed out sending on ${this.topic}`));
			}, SEND_TIMEOUT_MS);
		});
		try {
			await Promise.race([this.joined, timeout]);
			const result = await this.channel.send({
				type: 'broadcast',
				event: MESSAGE_EVENT,
				payload,
			});
			if (result !== 'ok') throw new Error(`Send on ${this.topic} failed: ${result}`);
		} finally {
			clearTimeout(timer);
		}
	}

	async close(): Promise<void> {
		this.setState('closed');
		this.states.clear();
		await this.client.removeChannel(this.channel);
	}
}

/** Combine channel states: connected only when every channel is. */
function aggregate(channels: Iterable<ManagedChannel>, everConnected: boolean): LinkState {
	let all = true;
	for (const c of channels) if (c.state !== 'connected') all = false;
	if (all) return 'connected';
	return everConnected ? 'reconnecting' : 'connecting';
}

function parseWith<T>(
	schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
	topic: string,
	onInvalid: InvalidMessageHandler | undefined,
	handler: (message: T) => void,
) {
	return (payload: unknown) => {
		const parsed = schema.safeParse(payload);
		if (parsed.success) handler(parsed.data);
		else onInvalid?.(topic, payload);
	};
}

abstract class LinkBase {
	state: LinkState = 'connecting';
	protected everConnected = false;
	protected readonly states = new Listeners<[LinkState]>();

	protected abstract channels(): Iterable<ManagedChannel>;

	protected watch(channel: ManagedChannel): ManagedChannel {
		channel.states.add(() => {
			this.refreshState();
		});
		return channel;
	}

	protected refreshState(): void {
		if (this.state === 'closed') return;
		const next = aggregate(this.channels(), this.everConnected);
		if (next === 'connected') this.everConnected = true;
		if (next !== this.state) {
			this.state = next;
			this.states.emit(next);
		}
	}

	onStateChange(handler: (state: LinkState) => void): Unsubscribe {
		return this.states.add(handler);
	}

	protected markClosed(): void {
		this.state = 'closed';
		this.states.emit('closed');
		this.states.clear();
	}
}

class SupabaseHostLink extends LinkBase implements HostLink {
	private readonly publicChannel: ManagedChannel;
	private readonly members = new Map<UserId, { to: ManagedChannel; from: ManagedChannel }>();
	private readonly messages = new Listeners<[UserId, DeviceMessage]>();

	constructor(
		private readonly client: SupabaseClient,
		readonly roomId: RoomId,
		private readonly onInvalid: InvalidMessageHandler | undefined,
	) {
		super();
		this.publicChannel = this.watch(new ManagedChannel(client, topics.public(roomId)));
	}

	protected *channels(): Iterable<ManagedChannel> {
		yield this.publicChannel;
		for (const { to, from } of this.members.values()) {
			yield to;
			yield from;
		}
	}

	setMembers(userIds: Iterable<UserId>): void {
		const wanted = new Set(userIds);
		for (const [id, pair] of this.members) {
			if (wanted.has(id)) continue;
			this.members.delete(id);
			void pair.to.close();
			void pair.from.close();
		}
		for (const id of wanted) {
			if (this.members.has(id)) continue;
			const fromTopic = topics.from(this.roomId, id);
			this.members.set(id, {
				to: this.watch(new ManagedChannel(this.client, topics.to(this.roomId, id))),
				from: this.watch(
					new ManagedChannel(
						this.client,
						fromTopic,
						parseWith(DeviceMessageSchema, fromTopic, this.onInvalid, (message) => {
							this.messages.emit(id, message);
						}),
					),
				),
			});
		}
		this.refreshState();
	}

	broadcast(message: HostBroadcastMessage): Promise<void> {
		return this.publicChannel.send(message);
	}

	sendTo(userId: UserId, message: HostDirectMessage): Promise<void> {
		const pair = this.members.get(userId);
		if (!pair) return Promise.reject(new Error(`Not connected to member ${userId}`));
		return pair.to.send(message);
	}

	onMessage(handler: (from: UserId, message: DeviceMessage) => void): Unsubscribe {
		return this.messages.add(handler);
	}

	async close(): Promise<void> {
		this.markClosed();
		this.messages.clear();
		const all = [...this.channels()];
		this.members.clear();
		await Promise.all(all.map((c) => c.close()));
	}
}

class SupabaseDeviceLink extends LinkBase implements DeviceLink {
	private readonly publicChannel: ManagedChannel;
	private readonly toChannel: ManagedChannel;
	private readonly fromChannel: ManagedChannel;
	private readonly messages = new Listeners<[HostMessage]>();

	constructor(
		client: SupabaseClient,
		readonly roomId: RoomId,
		readonly userId: UserId,
		onInvalid: InvalidMessageHandler | undefined,
	) {
		super();
		const emit = (message: HostMessage) => {
			this.messages.emit(message);
		};
		const publicTopic = topics.public(roomId);
		const toTopic = topics.to(roomId, userId);
		this.publicChannel = this.watch(
			new ManagedChannel(
				client,
				publicTopic,
				parseWith(HostBroadcastMessageSchema, publicTopic, onInvalid, emit),
			),
		);
		this.toChannel = this.watch(
			new ManagedChannel(
				client,
				toTopic,
				parseWith(HostDirectMessageSchema, toTopic, onInvalid, emit),
			),
		);
		this.fromChannel = this.watch(new ManagedChannel(client, topics.from(roomId, userId)));
	}

	protected *channels(): Iterable<ManagedChannel> {
		yield this.publicChannel;
		yield this.toChannel;
		yield this.fromChannel;
	}

	send(message: DeviceMessage): Promise<void> {
		return this.fromChannel.send(message);
	}

	onMessage(handler: (message: HostMessage) => void): Unsubscribe {
		return this.messages.add(handler);
	}

	async close(): Promise<void> {
		this.markClosed();
		this.messages.clear();
		await Promise.all([...this.channels()].map((c) => c.close()));
	}
}

/** Production transport over Supabase Realtime private channels. */
export class SupabaseTransport implements Transport {
	constructor(
		private readonly client: SupabaseClient,
		private readonly onInvalid?: InvalidMessageHandler,
	) {}

	host(roomId: RoomId): HostLink {
		return new SupabaseHostLink(this.client, roomId, this.onInvalid);
	}

	device(roomId: RoomId, userId: UserId): DeviceLink {
		return new SupabaseDeviceLink(this.client, roomId, userId, this.onInvalid);
	}
}
