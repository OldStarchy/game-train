/**
 * Tracks which devices are connected, from the messages they send. Devices
 * heartbeat regularly; one that goes quiet for longer than `timeoutMs` is
 * considered disconnected. Pure: the caller supplies the time.
 */
export class ConnectionTracker<Id> {
	private readonly lastSeen = new Map<Id, number>();

	constructor(private readonly timeoutMs: number) {}

	seen(id: Id, now: number): void {
		this.lastSeen.set(id, now);
	}

	/** The device said goodbye or was removed. */
	forget(id: Id): void {
		this.lastSeen.delete(id);
	}

	isConnected(id: Id, now: number): boolean {
		const last = this.lastSeen.get(id);
		return last !== undefined && now - last <= this.timeoutMs;
	}

	/** Ids whose connected state differs between two points in time. */
	changedBetween(ids: Iterable<Id>, before: number, after: number): Id[] {
		const changed: Id[] = [];
		for (const id of ids) {
			if (this.isConnected(id, before) !== this.isConnected(id, after)) changed.push(id);
		}
		return changed;
	}
}
