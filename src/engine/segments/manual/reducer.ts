import { assertNever } from '../../../lib/assertNever';
import type { UserId } from '../../../protocol/topics';
import type { WidgetInput, WidgetSpec } from '../../../protocol/widgetSchemas';
import type { ReducerContext, ReducerResult } from '../../context';
import {
	emptyBuzz,
	isTargeted,
	type BuzzPress,
	MAX_UNDO,
	type ManualSettings,
	type ManualState,
	type Prompt,
	type UndoEntry,
} from './state';

export type ManualAction =
	// Host actions
	| { type: 'push'; widget: WidgetSpec; targets: 'all' | readonly UserId[] }
	| { type: 'clear' }
	| { type: 'lock' }
	/** Clear buzzes and re-open; the current winner (if any) is kept out. */
	| { type: 'rearm' }
	| { type: 'award'; userId: UserId; points: number; label?: string }
	| { type: 'set-score'; userId: UserId; score: number }
	| { type: 'settings'; settings: Partial<ManualSettings> }
	| { type: 'undo' }
	// From devices and the clock
	| { type: 'input'; from: UserId; promptId: number; input: WidgetInput; receivedAt: number }
	| { type: 'tick' };

export function reduceManual(
	state: ManualState,
	action: ManualAction,
	ctx: ReducerContext,
): ReducerResult<ManualState> {
	switch (action.type) {
		case 'push': {
			const prompt: Prompt = {
				id: state.nextPromptId,
				widget: action.widget,
				targets: action.targets,
				openedAt: ctx.now,
				locked: false,
				responses: {},
				buzz: emptyBuzz(),
			};
			return {
				state: {
					...withUndo(state, {
						label: `show ${action.widget.kind}`,
						restore: 'prompt',
						prompt: state.prompt,
					}),
					nextPromptId: state.nextPromptId + 1,
					prompt,
				},
			};
		}

		case 'clear':
			if (!state.prompt) return { state };
			return {
				state: {
					...withUndo(state, { label: 'clear screen', restore: 'prompt', prompt: state.prompt }),
					prompt: null,
				},
			};

		case 'lock':
			if (!state.prompt || state.prompt.locked) return { state };
			return {
				state: {
					...withUndo(state, { label: 'lock answers', restore: 'prompt', prompt: state.prompt }),
					prompt: { ...state.prompt, locked: true },
				},
			};

		case 'rearm': {
			const prompt = state.prompt;
			if (prompt?.widget.kind !== 'buzzer') return { state };
			const excluded = prompt.buzz.winner
				? [...prompt.buzz.excluded, prompt.buzz.winner]
				: prompt.buzz.excluded;
			return {
				state: {
					...withUndo(state, { label: 're-arm buzzers', restore: 'prompt', prompt }),
					prompt: { ...prompt, locked: false, buzz: emptyBuzz(excluded) },
				},
			};
		}

		case 'award': {
			if (action.points === 0) return { state };
			const sign = action.points > 0 ? '+' : '';
			return {
				state: {
					...withUndo(state, {
						label: action.label ?? `${sign}${action.points}`,
						restore: 'scores',
						scores: state.scores,
					}),
					scores: {
						...state.scores,
						[action.userId]: (state.scores[action.userId] ?? 0) + action.points,
					},
				},
			};
		}

		case 'set-score':
			return {
				state: {
					...withUndo(state, { label: 'set score', restore: 'scores', scores: state.scores }),
					scores: { ...state.scores, [action.userId]: action.score },
				},
			};

		case 'settings':
			return { state: { ...state, settings: { ...state.settings, ...action.settings } } };

		case 'undo': {
			const entry = state.undo.at(-1);
			if (!entry) return { state };
			const undo = state.undo.slice(0, -1);
			switch (entry.restore) {
				case 'scores':
					return { state: { ...state, undo, scores: entry.scores } };
				case 'prompt':
					return { state: { ...state, undo, prompt: entry.prompt } };
				default:
					return assertNever(entry);
			}
		}

		case 'input':
			return applyInput(state, action, ctx);

		case 'tick':
			return judge(state, ctx);

		default:
			return assertNever(action);
	}
}

function withUndo(state: ManualState, entry: UndoEntry): ManualState {
	return { ...state, undo: [...state.undo, entry].slice(-MAX_UNDO) };
}

function applyInput(
	state: ManualState,
	action: Extract<ManualAction, { type: 'input' }>,
	ctx: ReducerContext,
): ReducerResult<ManualState> {
	const prompt = state.prompt;
	// Stale prompts, locked prompts and players who weren't asked are ignored.
	if (!prompt || prompt.id !== action.promptId || prompt.locked) return { state };
	if (!isTargeted(prompt, action.from)) return { state };

	const { input } = action;
	switch (input.kind) {
		case 'buzz': {
			if (prompt.widget.kind !== 'buzzer') return { state };
			const buzz = prompt.buzz;
			if (buzz.excluded.includes(action.from)) return { state };
			if (buzz.presses.some((p) => p.userId === action.from)) return { state };
			// Arrived after judging started or finished: recorded, but can't win.
			const late =
				buzz.winner !== null || (buzz.judgeAt !== null && action.receivedAt > buzz.judgeAt);
			// A claimed time can't be before the buzzer opened or after it arrived,
			// so a tampered device can't buzz "in the past".
			const at = state.settings.trustTimestamps
				? clamp(input.at, prompt.openedAt, action.receivedAt)
				: action.receivedAt;
			const press: BuzzPress = {
				userId: action.from,
				at,
				receivedAt: action.receivedAt,
				late,
			};
			const judgeAt = buzz.judgeAt ?? action.receivedAt + state.settings.buzzWindowMs;
			const next: ManualState = {
				...state,
				prompt: { ...prompt, buzz: { ...buzz, presses: [...buzz.presses, press], judgeAt } },
			};
			// Judge immediately if the window has somehow already passed.
			if (buzz.winner === null && ctx.now >= judgeAt) return judge(next, ctx);
			return buzz.winner === null ? { state: next, wakeAt: judgeAt } : { state: next };
		}
		case 'text':
			if (prompt.widget.kind !== 'text-input') return { state };
			return withResponse(state, prompt, action.from, {
				kind: 'text',
				value: input.value.slice(0, prompt.widget.maxLength),
			});
		case 'choice':
			if (prompt.widget.kind !== 'choice' || input.index >= prompt.widget.options.length) {
				return { state };
			}
			return withResponse(state, prompt, action.from, { kind: 'choice', index: input.index });
		default:
			return assertNever(input);
	}
}

function withResponse(
	state: ManualState,
	prompt: Prompt,
	from: UserId,
	response: Prompt['responses'][string],
): ReducerResult<ManualState> {
	return {
		state: {
			...state,
			prompt: { ...prompt, responses: { ...prompt.responses, [from]: response } },
		},
	};
}

/** Award the buzz to the earliest press once the judging window has passed. */
function judge(state: ManualState, ctx: ReducerContext): ReducerResult<ManualState> {
	const prompt = state.prompt;
	if (!prompt || prompt.widget.kind !== 'buzzer') return { state };
	const { buzz } = prompt;
	if (buzz.winner !== null || buzz.judgeAt === null) return { state };
	if (ctx.now < buzz.judgeAt) return { state, wakeAt: buzz.judgeAt };

	let best: BuzzPress | undefined;
	for (const p of buzz.presses) {
		if (p.late) continue;
		if (
			best === undefined ||
			p.at < best.at ||
			(p.at === best.at && p.receivedAt < best.receivedAt)
		) {
			best = p;
		}
	}
	if (best === undefined) return { state };
	return { state: { ...state, prompt: { ...prompt, buzz: { ...buzz, winner: best.userId } } } };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
