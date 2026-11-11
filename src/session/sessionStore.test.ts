import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Listeners } from '../lib/listeners';
import { SessionStore, type StartableSession } from './sessionStore';

class FakeSession implements StartableSession<string> {
	started = 0;
	stopped = 0;
	snapshot = 'running';
	private readonly listeners = new Listeners<[]>();
	start() {
		this.started++;
	}
	stop() {
		this.stopped++;
		return Promise.resolve();
	}
	subscribe(listener: () => void) {
		return this.listeners.add(listener);
	}
	getSnapshot() {
		return this.snapshot;
	}
	change(value: string) {
		this.snapshot = value;
		this.listeners.emit();
	}
}

describe('SessionStore', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts on first subscribe and forwards changes', () => {
		const sessions: FakeSession[] = [];
		const store = new SessionStore(() => {
			const s = new FakeSession();
			sessions.push(s);
			return s;
		}, 'idle');
		expect(store.getSnapshot()).toBe('idle');
		const listener = vi.fn();
		store.subscribe(listener);
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.started).toBe(1);
		sessions[0]?.change('updated');
		expect(listener).toHaveBeenCalled();
		expect(store.getSnapshot()).toBe('updated');
	});

	it('survives an immediate unsubscribe/resubscribe', () => {
		const create = vi.fn(() => new FakeSession());
		const store = new SessionStore(create, 'idle');
		const unsubscribe = store.subscribe(() => undefined);
		unsubscribe();
		store.subscribe(() => undefined);
		vi.runAllTimers();
		expect(create).toHaveBeenCalledOnce();
		expect(store.current?.stopped).toBe(0);
	});

	it('stops after the last subscriber leaves', () => {
		const session = new FakeSession();
		const store = new SessionStore(() => session, 'idle');
		store.subscribe(() => undefined)();
		vi.runAllTimers();
		expect(session.stopped).toBe(1);
		expect(store.getSnapshot()).toBe('idle');
	});
});
