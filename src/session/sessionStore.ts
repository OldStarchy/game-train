import { Listeners, type Unsubscribe } from '../lib/listeners';

export interface StartableSession<Snapshot> {
	start(): void;
	stop(): Promise<void>;
	subscribe(listener: () => void): Unsubscribe;
	getSnapshot(): Snapshot;
}

/**
 * Starts a session when the first subscriber arrives and stops it once the
 * last one leaves, for `useSyncExternalStore`. Teardown is deferred one tick
 * so an immediate resubscribe (React StrictMode, fast remounts) reuses the
 * running session instead of closing and reopening its channels.
 */
export class SessionStore<
	Snapshot,
	S extends StartableSession<Snapshot> = StartableSession<Snapshot>,
> {
	private session: S | undefined;
	private sessionUnsubscribe: Unsubscribe | undefined;
	private pendingStop: ReturnType<typeof setTimeout> | undefined;
	private readonly listeners = new Listeners<[]>();

	constructor(
		private readonly create: () => S,
		private readonly idle: Snapshot,
	) {}

	subscribe = (listener: () => void): Unsubscribe => {
		const remove = this.listeners.add(listener);
		if (this.pendingStop !== undefined) {
			clearTimeout(this.pendingStop);
			this.pendingStop = undefined;
		}
		if (!this.session) {
			const session = this.create();
			this.session = session;
			this.sessionUnsubscribe = session.subscribe(() => {
				this.listeners.emit();
			});
			session.start();
		}
		return () => {
			remove();
			if (this.listeners.size === 0 && this.pendingStop === undefined) {
				this.pendingStop = setTimeout(() => {
					this.pendingStop = undefined;
					this.stopSession();
				}, 0);
			}
		};
	};

	getSnapshot = (): Snapshot => this.session?.getSnapshot() ?? this.idle;

	/** The running session, for issuing commands. */
	get current(): S | undefined {
		return this.session;
	}

	private stopSession(): void {
		this.sessionUnsubscribe?.();
		this.sessionUnsubscribe = undefined;
		const session = this.session;
		this.session = undefined;
		void session?.stop();
	}
}
