import { describe, expect, it } from 'vitest';
import { ConnectionTracker } from './connectionTracker';

describe('ConnectionTracker', () => {
	it('treats unseen and quiet devices as disconnected', () => {
		const t = new ConnectionTracker<string>(1000);
		expect(t.isConnected('a', 0)).toBe(false);
		t.seen('a', 0);
		expect(t.isConnected('a', 1000)).toBe(true);
		expect(t.isConnected('a', 1001)).toBe(false);
	});

	it('forgets devices that leave', () => {
		const t = new ConnectionTracker<string>(1000);
		t.seen('a', 0);
		t.forget('a');
		expect(t.isConnected('a', 1)).toBe(false);
	});

	it('reports devices whose state changed', () => {
		const t = new ConnectionTracker<string>(1000);
		t.seen('a', 0);
		t.seen('b', 900);
		expect(t.changedBetween(['a', 'b', 'c'], 500, 1500)).toEqual(['a']);
	});
});
