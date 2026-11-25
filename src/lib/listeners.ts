/** Removes a previously added handler. */
export type Unsubscribe = () => void;

/** A minimal typed listener set. */
export class Listeners<Args extends unknown[]> {
	private readonly handlers = new Set<(...args: Args) => void>();

	add(handler: (...args: Args) => void): Unsubscribe {
		this.handlers.add(handler);
		return () => {
			this.handlers.delete(handler);
		};
	}

	emit(...args: Args): void {
		for (const handler of [...this.handlers]) handler(...args);
	}

	get size(): number {
		return this.handlers.size;
	}

	clear(): void {
		this.handlers.clear();
	}
}
