import { describe, expect, it } from 'vitest';
import type { WidgetInput, WidgetSpec } from '../../../protocol/widgetSchemas';
import {
	initialManualState,
	manualViewFor,
	reduceManual,
	type ManualAction,
	type ManualState,
} from './index';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';

/** Apply actions in order, each at the given host time. */
function run(state: ManualState, ...steps: [number, ManualAction][]) {
	let wakeAt: number | undefined;
	for (const [now, action] of steps) {
		const result = reduceManual(state, action, { now });
		state = result.state;
		wakeAt = result.wakeAt;
	}
	return { state, wakeAt };
}

const push = (widget: WidgetSpec, targets: 'all' | string[] = 'all'): ManualAction => ({
	type: 'push',
	widget,
	targets,
});

const input = (from: string, i: WidgetInput, receivedAt: number, promptId = 1): ManualAction => ({
	type: 'input',
	from,
	promptId,
	input: i,
	receivedAt,
});

const buzz = (from: string, at: number, receivedAt: number) =>
	input(from, { kind: 'buzz', at }, receivedAt);

const buzzerState = (state: ManualState, userId: string) => {
	const view = manualViewFor(state, userId);
	return view.screen === 'widget' && view.state.kind === 'buzzer' ? view.state.status : null;
};

describe('buzzer', () => {
	const start = () => run(initialManualState(), [0, push({ kind: 'buzzer' })]).state;

	it('awards the earliest press, not the first to arrive', () => {
		// B pressed first (t=120) but had a slow connection; A's press arrived first.
		const { state, wakeAt } = run(start(), [150, buzz(A, 140, 150)], [200, buzz(B, 120, 200)]);
		expect(wakeAt).toBe(450); // first arrival + 300 ms window
		expect(state.prompt?.buzz.winner).toBeNull();

		const judged = run(state, [450, { type: 'tick' }]).state;
		expect(judged.prompt?.buzz.winner).toBe(B);
		expect(buzzerState(judged, B)).toBe('won');
		expect(buzzerState(judged, A)).toBe('lost');
		expect(buzzerState(judged, C)).toBe('lost');
	});

	it('does not judge before the window closes', () => {
		const { state } = run(start(), [150, buzz(A, 140, 150)], [300, { type: 'tick' }]);
		expect(state.prompt?.buzz.winner).toBeNull();
		expect(buzzerState(state, A)).toBe('pressed');
		expect(buzzerState(state, B)).toBe('armed');
	});

	it('presses arriving after the window cannot win, however early they claim to be', () => {
		const { state } = run(
			start(),
			[150, buzz(A, 140, 150)],
			[460, buzz(B, 10, 460)],
			[460, { type: 'tick' }],
		);
		expect(state.prompt?.buzz.winner).toBe(A);
	});

	it('clamps claimed times to when the buzzer opened and when the press arrived', () => {
		// B claims to have pressed before the buzzer even opened (t=100).
		const s = run(initialManualState(), [100, push({ kind: 'buzzer' })]).state;
		const { state } = run(
			s,
			[150, buzz(A, 110, 150)],
			[160, buzz(B, 0, 160)],
			[460, { type: 'tick' }],
		);
		// B is clamped to 100 (the opening time), so still wins: they did press first possible.
		expect(state.prompt?.buzz.presses.find((p) => p.userId === B)?.at).toBe(100);
		// Claims from the future are clamped to arrival time.
		const future = run(s, [150, buzz(A, 99999, 150)]).state;
		expect(future.prompt?.buzz.presses[0]?.at).toBe(150);
	});

	it('uses arrival order when timestamps are not trusted', () => {
		const s = run(initialManualState({ trustTimestamps: false }), [
			0,
			push({ kind: 'buzzer' }),
		]).state;
		const { state } = run(
			s,
			[150, buzz(A, 140, 150)],
			[200, buzz(B, 120, 200)],
			[450, { type: 'tick' }],
		);
		expect(state.prompt?.buzz.winner).toBe(A);
	});

	it('ignores duplicate presses, stale prompts and players not targeted', () => {
		const s = run(initialManualState(), [0, push({ kind: 'buzzer' }, [A])]).state;
		const { state } = run(
			s,
			[10, buzz(A, 10, 10)],
			[20, buzz(A, 5, 20)],
			[20, buzz(B, 5, 20)],
			[20, input(A, { kind: 'buzz', at: 1 }, 20, 99)],
		);
		expect(state.prompt?.buzz.presses).toHaveLength(1);
		expect(manualViewFor(state, B)).toEqual({ screen: 'lobby', message: 'Waiting for the host…' });
	});

	it('re-arm keeps the previous winner out and opens it for everyone else', () => {
		const judged = run(start(), [10, buzz(A, 10, 10)], [310, { type: 'tick' }]).state;
		const rearmed = run(judged, [400, { type: 'rearm' }]).state;
		expect(buzzerState(rearmed, A)).toBe('lost');
		expect(buzzerState(rearmed, B)).toBe('armed');

		const { state } = run(
			rearmed,
			[410, buzz(A, 410, 410)],
			[420, buzz(B, 420, 420)],
			[720, { type: 'tick' }],
		);
		expect(state.prompt?.buzz.winner).toBe(B);
	});

	it('locking stops new presses', () => {
		const { state } = run(start(), [10, { type: 'lock' }], [20, buzz(A, 20, 20)]);
		expect(state.prompt?.buzz.presses).toHaveLength(0);
		expect(buzzerState(state, A)).toBe('locked');
	});
});

describe('responses', () => {
	it("records each player's latest answer until locked, and shows only their own", () => {
		const s = run(initialManualState(), [
			0,
			push({ kind: 'text-input', prompt: 'Name a fruit', maxLength: 5 }),
		]).state;
		const { state } = run(
			s,
			[1, input(A, { kind: 'text', value: 'apple' }, 1)],
			[2, input(B, { kind: 'text', value: 'banana split' }, 2)],
			[3, input(A, { kind: 'text', value: 'pear' }, 3)],
			[4, { type: 'lock' }],
			[5, input(A, { kind: 'text', value: 'kiwi' }, 5)],
		);
		expect(state.prompt?.responses).toEqual({
			[A]: { kind: 'text', value: 'pear' },
			// Trimmed to the widget's limit.
			[B]: { kind: 'text', value: 'banan' },
		});
		expect(manualViewFor(state, A)).toMatchObject({
			state: { kind: 'text-input', submitted: 'pear', locked: true },
		});
		// A's view contains nothing about B's answer.
		expect(JSON.stringify(manualViewFor(state, A))).not.toContain('banan');
	});

	it('rejects choice indexes outside the options', () => {
		const s = run(initialManualState(), [
			0,
			push({ kind: 'choice', prompt: '?', options: ['x', 'y'] }),
		]).state;
		const { state } = run(
			s,
			[1, input(A, { kind: 'choice', index: 5 }, 1)],
			[2, input(B, { kind: 'choice', index: 1 }, 2)],
		);
		expect(state.prompt?.responses).toEqual({ [B]: { kind: 'choice', index: 1 } });
	});

	it('ignores input of the wrong kind for the widget', () => {
		const s = run(initialManualState(), [0, push({ kind: 'text', body: 'hi' })]).state;
		const { state } = run(s, [1, input(A, { kind: 'text', value: 'x' }, 1)], [2, buzz(A, 2, 2)]);
		expect(state.prompt?.responses).toEqual({});
		expect(state.prompt?.buzz.presses).toEqual([]);
	});
});

describe('scores and undo', () => {
	it('awards points and undoes them one step at a time', () => {
		const { state } = run(
			initialManualState(),
			[0, { type: 'award', userId: A, points: 2 }],
			[1, { type: 'award', userId: B, points: 1 }],
			[2, { type: 'award', userId: A, points: -1 }],
		);
		expect(state.scores).toEqual({ [A]: 1, [B]: 1 });
		expect(state.undo.map((u) => u.label)).toEqual(['+2', '+1', '-1']);

		const once = run(state, [3, { type: 'undo' }]).state;
		expect(once.scores).toEqual({ [A]: 2, [B]: 1 });
		const all = run(
			once,
			[4, { type: 'undo' }],
			[5, { type: 'undo' }],
			[6, { type: 'undo' }],
		).state;
		expect(all.scores).toEqual({});
	});

	it('undoing a score change keeps answers that arrived since', () => {
		const s = run(
			initialManualState(),
			[0, push({ kind: 'text-input', prompt: '?', maxLength: 140 })],
			[1, { type: 'award', userId: A, points: 1 }],
			[2, input(B, { kind: 'text', value: 'late answer' }, 2)],
			[3, { type: 'undo' }],
		).state;
		expect(s.scores).toEqual({});
		expect(s.prompt?.responses[B]).toEqual({ kind: 'text', value: 'late answer' });
	});

	it('undo restores the previous screen after a push or clear', () => {
		const first = run(initialManualState(), [0, push({ kind: 'text', body: 'one' })]).state;
		const second = run(first, [1, push({ kind: 'text', body: 'two' })]).state;
		expect(run(second, [2, { type: 'undo' }]).state.prompt?.widget).toEqual({
			kind: 'text',
			body: 'one',
		});
		const cleared = run(second, [2, { type: 'clear' }]).state;
		expect(cleared.prompt).toBeNull();
		expect(run(cleared, [3, { type: 'undo' }]).state.prompt?.widget).toEqual({
			kind: 'text',
			body: 'two',
		});
	});

	it('undo with nothing to undo changes nothing', () => {
		const s = initialManualState();
		expect(reduceManual(s, { type: 'undo' }, { now: 0 }).state).toBe(s);
	});
});
