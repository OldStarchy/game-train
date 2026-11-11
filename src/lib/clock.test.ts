import { describe, expect, it } from 'vitest';
import { estimateClockOffset } from './clock';

describe('estimateClockOffset', () => {
	it('returns undefined without samples', () => {
		expect(estimateClockOffset([])).toBeUndefined();
	});

	it('recovers the offset for a symmetric round trip', () => {
		// Host is 1000 ms ahead; 40 ms each way.
		expect(estimateClockOffset([{ sentAt: 0, hostTime: 1040, receivedAt: 80 }])).toEqual({
			offset: 1000,
			rtt: 80,
		});
	});

	it('prefers the fastest sample, whose error bound is smallest', () => {
		const estimate = estimateClockOffset([
			// Slow and asymmetric: 300 ms out, 20 ms back. Naive offset is off by 140.
			{ sentAt: 0, hostTime: 1300, receivedAt: 320 },
			{ sentAt: 1000, hostTime: 2025, receivedAt: 1050 },
		]);
		expect(estimate).toEqual({ offset: 1000, rtt: 50 });
	});

	it('ignores samples with negative round trips', () => {
		expect(estimateClockOffset([{ sentAt: 10, hostTime: 0, receivedAt: 5 }])).toBeUndefined();
	});
});
