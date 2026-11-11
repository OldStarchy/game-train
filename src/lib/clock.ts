/**
 * Monotonic wall-clock-ish milliseconds: unaffected by system clock changes
 * during a session. Comparable across devices only after offset calibration.
 */
export function monotonicNow(): number {
	return performance.timeOrigin + performance.now();
}

/** One ping/pong exchange, all in milliseconds. */
export interface ClockSample {
	/** Device clock when the ping was sent. */
	sentAt: number;
	/** Host clock when the host handled the ping. */
	hostTime: number;
	/** Device clock when the pong arrived. */
	receivedAt: number;
}

export interface ClockEstimate {
	/** Add to a device timestamp to get host time. */
	offset: number;
	/** Round-trip time of the sample used; the offset's error is at most rtt / 2. */
	rtt: number;
}

/**
 * Estimate the device→host clock offset, NTP-style: assume the host handled
 * the ping halfway through the round trip, and trust the fastest sample,
 * whose error bound is smallest.
 */
export function estimateClockOffset(samples: readonly ClockSample[]): ClockEstimate | undefined {
	let best: ClockEstimate | undefined;
	for (const s of samples) {
		const rtt = s.receivedAt - s.sentAt;
		if (rtt < 0) continue;
		if (best === undefined || rtt < best.rtt) {
			best = { offset: s.hostTime - (s.sentAt + s.receivedAt) / 2, rtt };
		}
	}
	return best;
}
