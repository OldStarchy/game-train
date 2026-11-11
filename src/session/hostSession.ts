import { ConnectionTracker } from '../lib/connectionTracker';
import type { DeviceMessage, RosterEntry, View } from '../protocol/messages';
import type { UserId } from '../protocol/topics';
import { Listeners } from '../lib/listeners';
import type { HostLink, LinkState, Unsubscribe } from '../transport/types';

export interface Member {
	userId: UserId;
	name: string;
	avatar: string | null;
}

export interface RoomInfo {
	name: string;
	status: 'lobby' | 'playing' | 'ended';
}

export interface HostSnapshot {
	link: LinkState;
	roster: readonly RosterEntry[];
}

export interface HostSessionOptions {
	/** Monotonic clock in ms. */
	now: () => number;
	/** Silence after which a member counts as disconnected. Default: three heartbeats. */
	connectionTimeoutMs?: number;
	connectionCheckMs?: number;
}

/**
 * The host's protocol behaviour on top of a HostLink: answers pings, tracks
 * which members are connected, keeps the roster and each member's current
 * view, and re-sends state to devices when they (re)connect.
 */
export class HostSession {
	private readonly members = new Map<UserId, Member>();
	private readonly views = new Map<UserId, { seq: number; view: View }>();
	private readonly tracker: ConnectionTracker<UserId>;
	private readonly changes = new Listeners<[]>();
	private readonly cleanup: Unsubscribe[] = [];
	private check: ReturnType<typeof setInterval> | undefined;
	private lastCheck: number;
	private room: RoomInfo | undefined;
	private snapshot: HostSnapshot;

	constructor(
		private readonly link: HostLink,
		private readonly options: HostSessionOptions,
	) {
		this.tracker = new ConnectionTracker(options.connectionTimeoutMs ?? 15_000);
		this.lastCheck = options.now();
		this.snapshot = { link: link.state, roster: [] };
	}

	start(): void {
		this.cleanup.push(
			this.link.onMessage((from, message) => {
				this.handle(from, message);
			}),
			this.link.onStateChange((state) => {
				this.snapshot = { ...this.snapshot, link: state };
				this.changes.emit();
				if (state === 'connected') this.publishAll();
			}),
		);
		this.check = setInterval(() => {
			this.checkConnections();
		}, this.options.connectionCheckMs ?? 2000);
	}

	getSnapshot = (): HostSnapshot => this.snapshot;

	subscribe = (listener: () => void): Unsubscribe => this.changes.add(listener);

	/** Approved members, from the database. Opens and closes their channels. */
	setMembers(members: Iterable<Member>): void {
		const next = new Map([...members].map((m) => [m.userId, m]));
		for (const id of this.members.keys()) {
			if (!next.has(id)) {
				this.tracker.forget(id);
				this.views.delete(id);
			}
		}
		this.members.clear();
		for (const [id, member] of next) this.members.set(id, member);
		this.link.setMembers(next.keys());
		this.publishRoster();
	}

	setRoom(room: RoomInfo): void {
		this.room = room;
		this.publishRoom();
	}

	/** Show `view` on a member's device. */
	setView(userId: UserId, view: View): void {
		const seq = (this.views.get(userId)?.seq ?? -1) + 1;
		this.views.set(userId, { seq, view });
		this.send(userId, { type: 'view', seq, view });
	}

	/** Tell a removed member's device to leave. Call before removing them from the members. */
	notifyKicked(userId: UserId, banned: boolean): void {
		this.send(userId, { type: 'kicked', banned });
	}

	async stop(): Promise<void> {
		if (this.check !== undefined) clearInterval(this.check);
		for (const fn of this.cleanup) fn();
		await this.link.close();
	}

	private handle(from: UserId, message: DeviceMessage): void {
		if (!this.members.has(from)) return;
		const now = this.options.now();
		const wasConnected = this.tracker.isConnected(from, now);
		switch (message.type) {
			case 'hello': {
				this.tracker.seen(from, now);
				// The device may have missed anything sent while it was away.
				this.publishRoom();
				const current = this.views.get(from);
				if (current) this.send(from, { type: 'view', ...current });
				break;
			}
			case 'ping':
				this.tracker.seen(from, now);
				this.send(from, { type: 'pong', id: message.id, hostTime: now });
				break;
			case 'bye':
				this.tracker.forget(from);
				break;
		}
		if (wasConnected !== this.tracker.isConnected(from, now) || message.type === 'hello') {
			this.publishRoster();
		}
	}

	private checkConnections(): void {
		const now = this.options.now();
		const changed = this.tracker.changedBetween(this.members.keys(), this.lastCheck, now);
		this.lastCheck = now;
		if (changed.length > 0) this.publishRoster();
	}

	private publishAll(): void {
		this.publishRoom();
		this.publishRoster();
	}

	private publishRoom(): void {
		if (!this.room) return;
		void this.link.broadcast({ type: 'room', ...this.room }).catch(() => undefined);
	}

	private publishRoster(): void {
		const now = this.options.now();
		const roster: RosterEntry[] = [...this.members.values()].map((m) => ({
			userId: m.userId,
			name: m.name,
			avatar: m.avatar,
			connected: this.tracker.isConnected(m.userId, now),
		}));
		this.snapshot = { ...this.snapshot, roster };
		this.changes.emit();
		void this.link.broadcast({ type: 'roster', players: roster }).catch(() => undefined);
	}

	private send(userId: UserId, message: Parameters<HostLink['sendTo']>[1]): void {
		void this.link.sendTo(userId, message).catch(() => undefined);
	}
}
