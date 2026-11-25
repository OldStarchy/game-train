import { useEffect, useRef, useState } from 'react';
import {
	initialManualState,
	manualViewFor,
	reduceManual,
	type ManualAction,
	type ManualState,
} from '../../engine/segments/manual';
import { monotonicNow } from '../../lib/clock';
import type { HostSession, HostSnapshot } from '../../session/hostSession';
import type { SessionStore } from '../../session/sessionStore';

const STORAGE_VERSION = 1;
const storageKey = (roomId: string) => `game-train:manual:${roomId}`;

/**
 * The game state lives on the host device. It's saved locally so reloading
 * the host page doesn't lose scores; persisting it to Supabase (for handing
 * hosting to another device) is a later milestone.
 */
function load(roomId: string): ManualState | null {
	try {
		const raw = localStorage.getItem(storageKey(roomId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { v?: number; state?: ManualState };
		return parsed.v === STORAGE_VERSION && parsed.state ? parsed.state : null;
	} catch {
		return null;
	}
}

function save(roomId: string, state: ManualState): void {
	try {
		localStorage.setItem(storageKey(roomId), JSON.stringify({ v: STORAGE_VERSION, state }));
	} catch {
		// Storage full or unavailable: the game continues, it just won't survive a reload.
	}
}

/**
 * Runs manual mode on the host: dispatches host actions and player inputs to
 * the engine, judges buzzers on time, and sends every member their own view
 * and everyone the scores.
 */
export function useManualGame(
	roomId: string,
	store: SessionStore<HostSnapshot, HostSession>,
	memberIds: readonly string[],
) {
	const [state, setState] = useState<ManualState>(() => load(roomId) ?? initialManualState());
	const stateRef = useRef(state);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	// A stable dispatcher; ticks for buzzer judging re-enter it from a timer.
	const [dispatch] = useState(() => {
		const run = (action: ManualAction) => {
			const result = reduceManual(stateRef.current, action, { now: monotonicNow() });
			stateRef.current = result.state;
			setState(result.state);
			if (result.wakeAt !== undefined) {
				clearTimeout(timer.current);
				timer.current = setTimeout(
					() => {
						run({ type: 'tick' });
					},
					Math.max(0, result.wakeAt - monotonicNow()) + 5,
				);
			}
		};
		return run;
	});

	useEffect(
		() => () => {
			clearTimeout(timer.current);
		},
		[],
	);

	// Player inputs.
	useEffect(() => {
		const session = store.current;
		if (!session) return;
		return session.onInput((i) => {
			dispatch({ type: 'input', ...i });
		});
	}, [store, dispatch]);

	// Persist.
	useEffect(() => {
		save(roomId, state);
	}, [roomId, state]);

	// Send each member their view, only when it changed.
	const sent = useRef(new Map<string, string>());
	useEffect(() => {
		const session = store.current;
		if (!session) return;
		for (const id of memberIds) {
			const view = manualViewFor(state, id);
			const key = JSON.stringify(view);
			if (sent.current.get(id) === key) continue;
			sent.current.set(id, key);
			session.setView(id, view);
		}
		for (const id of sent.current.keys()) {
			if (!memberIds.includes(id)) sent.current.delete(id);
		}
	}, [store, state, memberIds]);

	// Broadcast scores when they change.
	const sentScores = useRef('');
	useEffect(() => {
		const session = store.current;
		if (!session) return;
		const scores = memberIds.map((userId) => ({ userId, score: state.scores[userId] ?? 0 }));
		const key = JSON.stringify(scores);
		if (key === sentScores.current) return;
		sentScores.current = key;
		session.setScores(scores);
	}, [store, state.scores, memberIds]);

	return { state, dispatch };
}
