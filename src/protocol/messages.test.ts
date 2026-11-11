import { describe, expect, it } from 'vitest';
import {
	DeviceMessageSchema,
	HostBroadcastMessageSchema,
	HostDirectMessageSchema,
} from './messages';

const uid = '6f1c1c3e-2b7a-4d5e-9b8a-1f2e3d4c5b6a';

describe('message schemas', () => {
	it('accepts well-formed messages', () => {
		expect(DeviceMessageSchema.parse({ type: 'ping', id: 1, sentAt: 12.5 })).toEqual({
			type: 'ping',
			id: 1,
			sentAt: 12.5,
		});
		expect(
			HostDirectMessageSchema.parse({ type: 'view', seq: 3, view: { screen: 'lobby' } }).type,
		).toBe('view');
		expect(
			HostBroadcastMessageSchema.parse({
				type: 'roster',
				players: [{ userId: uid, name: 'Al', avatar: null, connected: true }],
			}).type,
		).toBe('roster');
	});

	it.each([
		['unknown type', { type: 'nope' }],
		['wrong field type', { type: 'ping', id: 'one', sentAt: 1 }],
		['negative timestamp', { type: 'ping', id: 1, sentAt: -5 }],
		['non-finite timestamp', { type: 'ping', id: 1, sentAt: Infinity }],
		['not an object', 'hello'],
	])('rejects device message: %s', (_, value) => {
		expect(DeviceMessageSchema.safeParse(value).success).toBe(false);
	});

	it('rejects oversized broadcast content', () => {
		const player = { userId: uid, name: 'x'.repeat(33), avatar: null, connected: true };
		expect(
			HostBroadcastMessageSchema.safeParse({ type: 'roster', players: [player] }).success,
		).toBe(false);
		const many = Array.from({ length: 41 }, () => ({ ...player, name: 'ok' }));
		expect(HostBroadcastMessageSchema.safeParse({ type: 'roster', players: many }).success).toBe(
			false,
		);
	});
});
