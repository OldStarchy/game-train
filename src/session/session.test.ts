import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryNetwork } from '../transport/memory';
import { DeviceSession } from './deviceSession';
import { HostSession, type Member } from './hostSession';

const ROOM = '00000000-0000-4000-8000-000000000001';
const HOST = '00000000-0000-4000-8000-0000000000aa';
const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b0';

const member = (userId: string, name: string): Member => ({ userId, name, avatar: null });

/** Device clocks run 1000 ms behind the host's. */
const DEVICE_SKEW = -1000;

function setup() {
	const network = new MemoryNetwork();
	const now = () => Date.now();
	const host = new HostSession(network.transportFor(HOST).host(ROOM), { now });
	const device = (userId: string) =>
		new DeviceSession(network.transportFor(userId).device(ROOM, userId), {
			now: () => Date.now() + DEVICE_SKEW,
		});
	return { network, host, device };
}

/** Let queued deliveries and timers run. */
async function advance(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
}

describe('host and device sessions', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('connects, calibrates the clock and shows the roster', async () => {
		const { host, device } = setup();
		host.start();
		host.setRoom({ name: 'Test night', status: 'lobby' });
		host.setMembers([member(ALICE, 'Alice'), member(BOB, 'Bob')]);

		const alice = device(ALICE);
		alice.start();
		await advance(1000);

		const snap = alice.getSnapshot();
		expect(snap.room).toEqual({ name: 'Test night', status: 'lobby' });
		// In-memory delivery is instant, so the estimate is exact.
		expect(snap.clock).toEqual({ offset: -DEVICE_SKEW, rtt: 0 });
		expect(alice.hostNow()).toBe(Date.now());

		const connected = host.getSnapshot().roster.map((r) => [r.name, r.connected]);
		expect(connected).toEqual([
			['Alice', true],
			['Bob', false],
		]);
		expect(snap.roster.find((r) => r.userId === ALICE)?.connected).toBe(true);
	});

	it('marks silent devices disconnected and recovers on reconnect', async () => {
		const { network, host, device } = setup();
		host.start();
		host.setMembers([member(ALICE, 'Alice')]);
		const alice = device(ALICE);
		alice.start();
		await advance(1000);
		expect(host.getSnapshot().roster[0]?.connected).toBe(true);

		network.setOnline(ALICE, false);
		expect(alice.getSnapshot().link).toBe('reconnecting');
		await advance(20_000);
		expect(host.getSnapshot().roster[0]?.connected).toBe(false);

		network.setOnline(ALICE, true);
		await advance(100);
		expect(alice.getSnapshot().link).toBe('connected');
		expect(host.getSnapshot().roster[0]?.connected).toBe(true);
	});

	it('delivers views in order and re-sends the current view on reconnect', async () => {
		const { network, host, device } = setup();
		host.start();
		host.setMembers([member(ALICE, 'Alice')]);
		const alice = device(ALICE);
		alice.start();
		await advance(100);

		host.setView(ALICE, { screen: 'lobby', message: 'first' });
		host.setView(ALICE, { screen: 'lobby', message: 'second' });
		await advance(10);
		expect(alice.getSnapshot().view).toEqual({ screen: 'lobby', message: 'second' });

		network.setOnline(ALICE, false);
		host.setView(ALICE, { screen: 'lobby', message: 'missed' });
		await advance(10);
		expect(alice.getSnapshot().view?.message).toBe('second');

		network.setOnline(ALICE, true);
		await advance(100);
		expect(alice.getSnapshot().view?.message).toBe('missed');
	});

	it('ignores messages from devices that are not members', async () => {
		const { host, device } = setup();
		host.start();
		host.setMembers([member(ALICE, 'Alice')]);
		const bob = device(BOB);
		bob.start();
		await advance(1000);
		expect(bob.getSnapshot().clock).toBeUndefined();
		expect(host.getSnapshot().roster.map((r) => r.userId)).toEqual([ALICE]);
	});

	it('tells kicked devices to leave', async () => {
		const { host, device } = setup();
		host.start();
		host.setMembers([member(ALICE, 'Alice')]);
		const alice = device(ALICE);
		alice.start();
		await advance(100);

		host.notifyKicked(ALICE, true);
		host.setMembers([]);
		await advance(100);
		expect(alice.getSnapshot().kicked).toEqual({ banned: true });
		expect(alice.getSnapshot().link).toBe('closed');
	});

	it('forgets devices that say goodbye', async () => {
		const { host, device } = setup();
		host.start();
		host.setMembers([member(ALICE, 'Alice')]);
		const alice = device(ALICE);
		alice.start();
		await advance(100);
		await alice.stop();
		await advance(10);
		expect(host.getSnapshot().roster[0]?.connected).toBe(false);
	});
});
