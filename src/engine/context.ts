/**
 * Everything a reducer may know about the outside world. Passing time in
 * keeps reducers pure and deterministic (docs/design.md, "Host-authoritative
 * engine").
 */
export interface ReducerContext {
	/** Host monotonic clock, ms. */
	now: number;
}

/** A reducer's result. `wakeAt` asks the host to dispatch a `tick` at that time. */
export interface ReducerResult<State> {
	state: State;
	wakeAt?: number;
}
