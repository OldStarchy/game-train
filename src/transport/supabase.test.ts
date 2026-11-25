import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseTransport } from './supabase';

const ROOM = '00000000-0000-4000-8000-000000000001';
const ALICE = '00000000-0000-4000-8000-0000000000a1';

/** Just enough of RealtimeChannel for the transport. */
class FakeChannel {
	sent: unknown[] = [];
	private handler: ((message: { payload?: unknown }) => void) | undefined;
	private status: ((status: string) => void) | undefined;

	constructor(
		readonly topic: string,
		readonly options: unknown,
	) {}

	on(_type: string, _filter: unknown, handler: (message: { payload?: unknown }) => void) {
		this.handler = handler;
		return this;
	}

	subscribe(callback: (status: string) => void) {
		this.status = callback;
		return this;
	}

	send(args: { payload: unknown }) {
		this.sent.push(args.payload);
		return Promise.resolve('ok');
	}

	// Test controls
	setStatus(status: string) {
		this.status?.(status);
	}
	receive(payload: unknown) {
		this.handler?.({ payload });
	}
}

function fakeClient() {
	const channels = new Map<string, FakeChannel>();
	const client = {
		channel: (topic: string, options: unknown) => {
			const channel = new FakeChannel(topic, options);
			channels.set(topic, channel);
			return channel;
		},
		removeChannel: (channel: FakeChannel) => {
			channels.delete(channel.topic);
			return Promise.resolve('ok');
		},
	};
	return { client: client as unknown as SupabaseClient, channels };
}

const get = (channels: Map<string, FakeChannel>, topic: string) => {
	const channel = channels.get(topic);
	if (!channel) throw new Error(`no channel ${topic}`);
	return channel;
};

describe('SupabaseTransport', () => {
	it('opens private channels on the documented topics', () => {
		const { client, channels } = fakeClient();
		new SupabaseTransport(client).device(ROOM, ALICE);
		expect([...channels.keys()].sort()).toEqual([
			`room:${ROOM}:from:${ALICE}`,
			`room:${ROOM}:public`,
			`room:${ROOM}:to:${ALICE}`,
		]);
		for (const channel of channels.values()) {
			expect(channel.options).toMatchObject({ config: { private: true } });
		}
	});

	it('waits for the join before sending, and reports connection state', async () => {
		const { client, channels } = fakeClient();
		const link = new SupabaseTransport(client).device(ROOM, ALICE);
		const states: string[] = [];
		link.onStateChange((s) => states.push(s));

		const sending = link.send({ type: 'bye' });
		const from = get(channels, `room:${ROOM}:from:${ALICE}`);
		await Promise.resolve();
		expect(from.sent).toEqual([]);

		for (const channel of channels.values()) channel.setStatus('SUBSCRIBED');
		await sending;
		expect(from.sent).toEqual([{ type: 'bye' }]);

		from.setStatus('CHANNEL_ERROR');
		expect(states).toEqual(['connected', 'reconnecting']);
	});

	it('passes valid messages on and drops invalid ones', () => {
		const { client, channels } = fakeClient();
		const onInvalid = vi.fn();
		const link = new SupabaseTransport(client, onInvalid).device(ROOM, ALICE);
		const received = vi.fn();
		link.onMessage(received);

		const to = get(channels, `room:${ROOM}:to:${ALICE}`);
		to.receive({ type: 'pong', id: 1, hostTime: 5 });
		to.receive({ type: 'pong', id: 'x' });
		// A broadcast-only message type arriving on the direct topic is invalid there.
		to.receive({ type: 'roster', players: [] });

		expect(received).toHaveBeenCalledOnce();
		expect(received).toHaveBeenCalledWith({ type: 'pong', id: 1, hostTime: 5 });
		expect(onInvalid).toHaveBeenCalledTimes(2);
	});

	it('attributes member messages to the topic, not the payload', () => {
		const { client, channels } = fakeClient();
		const host = new SupabaseTransport(client).host(ROOM);
		host.setMembers([ALICE]);
		const received = vi.fn();
		host.onMessage(received);
		get(channels, `room:${ROOM}:from:${ALICE}`).receive({ type: 'hello', protocol: 1 });
		expect(received).toHaveBeenCalledWith(ALICE, { type: 'hello', protocol: 1 });
	});

	it('closes channels for members that are removed', () => {
		const { client, channels } = fakeClient();
		const host = new SupabaseTransport(client).host(ROOM);
		host.setMembers([ALICE]);
		expect(channels.size).toBe(3);
		host.setMembers([]);
		expect([...channels.keys()]).toEqual([`room:${ROOM}:public`]);
	});
});
