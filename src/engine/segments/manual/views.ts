import { assertNever } from '../../../lib/assertNever';
import type { View } from '../../../protocol/messages';
import type { UserId } from '../../../protocol/topics';
import type { WidgetState } from '../../../protocol/widgetSchemas';
import { isTargeted, type ManualState, type Prompt } from './state';

const WAITING: View = { screen: 'lobby', message: 'Waiting for the host…' };

/**
 * What one device should show. Contains only that device's own response and
 * buzz result, never anyone else's.
 */
export function manualViewFor(state: ManualState, userId: UserId): View {
	const prompt = state.prompt;
	if (!prompt || !isTargeted(prompt, userId)) return WAITING;
	return {
		screen: 'widget',
		promptId: prompt.id,
		widget: prompt.widget,
		state: widgetStateFor(prompt, userId),
	};
}

function widgetStateFor(prompt: Prompt, userId: UserId): WidgetState {
	const { widget } = prompt;
	switch (widget.kind) {
		case 'text':
		case 'flash':
			return { kind: 'none' };
		case 'buzzer': {
			const { buzz } = prompt;
			let status: Extract<WidgetState, { kind: 'buzzer' }>['status'];
			if (buzz.winner === userId) status = 'won';
			else if (buzz.winner !== null || buzz.excluded.includes(userId)) status = 'lost';
			else if (buzz.presses.some((p) => p.userId === userId)) status = 'pressed';
			else if (prompt.locked) status = 'locked';
			else status = 'armed';
			return { kind: 'buzzer', status };
		}
		case 'text-input': {
			const r = prompt.responses[userId];
			return {
				kind: 'text-input',
				submitted: r?.kind === 'text' ? r.value : null,
				locked: prompt.locked,
			};
		}
		case 'choice': {
			const r = prompt.responses[userId];
			return {
				kind: 'choice',
				selected: r?.kind === 'choice' ? r.index : null,
				locked: prompt.locked,
			};
		}
		default:
			return assertNever(widget);
	}
}
