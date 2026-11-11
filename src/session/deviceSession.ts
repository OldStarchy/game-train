import { estimateClockOffset, type ClockEstimate, type ClockSample } from '../lib/clock';
import {
	PROTOCOL_VERSION,
	type HostMessage,
	type RosterEntry,
	type View,
} from '../protocol/messages';
import type { DeviceLink, LinkState, Unsubscribe } from '../transport/types';
import { Listeners } from '../lib/listeners';

export interface DeviceSnapshot {
	link: LinkState;
	room: { name: string; status: 'lobby' | 'playing' | 'ended' } | undefined;
	roster: readonly RosterEntry[];
	view: View | undefined;
	kicked: { banned: boolean } | undefined;
	clock: ClockEstimate | undefined;
}

export interface DeviceSessionOptions {
	/** Monotonic clock in ms. */
	now: () => number;
	heartbeatMs?: number;
	calibrationPings?: number;
	calibrationGapMs?: number;
}

const MAX_SAMPLES = 20;

/**
 * A member device's protocol behaviour on top of a DeviceLink: announces
 * itself on every (re)connect, calibrates its clock against the host's, sends
 * heartbeats, and keeps the latest room state for the UI.
 */
export class DeviceSession {
	private snapshot: DeviceSnapshot;
	private readonly changes = new Listeners<[]>();
	private readonly cleanup: Unsubscribe[] = [];
	private readonly timers: ReturnType<typeof setTimeout>[] = [];
	private heartbeat: ReturnType<typeof setInterval> | undefined;
	private nextPingId = 0;
	private readonly pending = new Map<number, number>();
	private samples: ClockSample[] = [];
	private lastViewSeq = -1;
	private stopped = false;

	private readonly heartbeatMs: number;
	private readonly calibrationPings: number;
	private readonly calibrationGapMs: number;

	constructor(
		private readonly link: DeviceLink,
		private readonly options: DeviceSessionOptions,
	) {
		this.heartbeatMs = options.heartbeatMs ?? 5000;
		this.calibrationPings = options.calibrationPings ?? 5;
		this.calibrationGapMs = options.calibrationGapMs ?? 150;
		this.snapshot = {
			link: link.state,
			room: undefined,
			roster: [],
			view: undefined,
			kicked: undefined,
			clock: undefined,
		};
	}

	start(): void {
		this.cleanup.push(
			this.link.onMessage((message) => {
				this.handle(message);
			}),
			this.link.onStateChange((state) => {
				this.update({ link: state });
				if (state === 'connected') this.onConnected();
				else this.stopTimers();
			}),
		);
		if (this.link.state === 'connected') this.onConnected();
	}

	/** Current state, for the UI. Replaced (never mutated) on every change. */
	getSnapshot = (): DeviceSnapshot => this.snapshot;

	subscribe = (listener: () => void): Unsubscribe => this.changes.add(listener);

	/** The host's clock now, as best this device can tell. */
	hostNow(): number {
		return this.options.now() + (this.snapshot.clock?.offset ?? 0);
	}

	async stop(): Promise<void> {
		if (this.stopped) return;
		this.stopped = true;
		this.stopTimers();
		for (const fn of this.cleanup) fn();
		if (this.link.state === 'connected') {
			await this.link.send({ type: 'bye' }).catch(() => undefined);
		}
		await this.link.close();
		this.update({ link: 'closed' });
	}

	private onConnected(): void {
		if (this.stopped) return;
		this.stopTimers();
		void this.link.send({ type: 'hello', protocol: PROTOCOL_VERSION }).catch(() => undefined);
		for (let i = 0; i < this.calibrationPings; i++) {
			this.timers.push(
				setTimeout(() => {
					this.ping();
				}, i * this.calibrationGapMs),
			);
		}
		this.heartbeat = setInterval(() => {
			this.ping();
		}, this.heartbeatMs);
	}

	private stopTimers(): void {
		for (const t of this.timers) clearTimeout(t);
		this.timers.length = 0;
		if (this.heartbeat !== undefined) clearInterval(this.heartbeat);
		this.heartbeat = undefined;
		this.pending.clear();
	}

	private ping(): void {
		const id = this.nextPingId++;
		const sentAt = this.options.now();
		this.pending.set(id, sentAt);
		void this.link.send({ type: 'ping', id, sentAt }).catch(() => {
			this.pending.delete(id);
		});
	}

	private handle(message: HostMessage): void {
		switch (message.type) {
			case 'pong': {
				const sentAt = this.pending.get(message.id);
				if (sentAt === undefined) return;
				this.pending.delete(message.id);
				this.samples = [
					...this.samples,
					{ sentAt, hostTime: message.hostTime, receivedAt: this.options.now() },
				].slice(-MAX_SAMPLES);
				this.update({ clock: estimateClockOffset(this.samples) });
				return;
			}
			case 'view':
				if (message.seq <= this.lastViewSeq) return;
				this.lastViewSeq = message.seq;
				this.update({ view: message.view });
				return;
			case 'roster':
				this.update({ roster: message.players });
				return;
			case 'room':
				this.update({ room: { name: message.name, status: message.status } });
				return;
			case 'kicked':
				this.update({ kicked: { banned: message.banned } });
				void this.stop();
				return;
		}
	}

	private update(patch: Partial<DeviceSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.changes.emit();
	}
}
