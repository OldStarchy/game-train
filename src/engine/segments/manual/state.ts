import type { UserId } from '../../../protocol/topics';
import type { WidgetSpec } from '../../../protocol/widgetSchemas';

/**
 * Manual mode: the host's improvisation toolkit. The host pushes any widget
 * to everyone or chosen players, collects their responses, judges buzzers
 * and keeps score. Every automated segment type builds on these pieces.
 */

export interface ManualSettings {
	/** After the first buzz, wait this long for earlier-stamped presses still in flight. */
	buzzWindowMs: number;
	/**
	 * Judge buzzes by the devices' calibrated timestamps (fair across network
	 * delay; fine among friends). If false, by arrival order only (for
	 * audiences who might fake timestamps).
	 */
	trustTimestamps: boolean;
}

export const DEFAULT_SETTINGS: ManualSettings = { buzzWindowMs: 300, trustTimestamps: true };

export interface BuzzPress {
	userId: UserId;
	/** Host time the press is judged by. */
	at: number;
	receivedAt: number;
	/** Arrived after judging began; recorded but can't win. */
	late: boolean;
}

export interface BuzzState {
	presses: readonly BuzzPress[];
	/** Judge once the host clock reaches this; null until the first press. */
	judgeAt: number | null;
	winner: UserId | null;
	/** Players who already won and answered wrong, kept out after a re-arm. */
	excluded: readonly UserId[];
}

export type Response = { kind: 'text'; value: string } | { kind: 'choice'; index: number };

export interface Prompt {
	id: number;
	widget: WidgetSpec;
	/** Who sees it. */
	targets: 'all' | readonly UserId[];
	openedAt: number;
	/** No more responses accepted. */
	locked: boolean;
	responses: Readonly<Record<UserId, Response>>;
	buzz: BuzzState;
}

/** What one undo step restores. Undo reverts host actions, never players' answers. */
export type UndoEntry =
	| { label: string; restore: 'scores'; scores: Readonly<Record<UserId, number>> }
	| { label: string; restore: 'prompt'; prompt: Prompt | null };

export interface ManualState {
	settings: ManualSettings;
	nextPromptId: number;
	prompt: Prompt | null;
	scores: Readonly<Record<UserId, number>>;
	undo: readonly UndoEntry[];
}

export const MAX_UNDO = 50;

export function initialManualState(settings: Partial<ManualSettings> = {}): ManualState {
	return {
		settings: { ...DEFAULT_SETTINGS, ...settings },
		nextPromptId: 1,
		prompt: null,
		scores: {},
		undo: [],
	};
}

export function emptyBuzz(excluded: readonly UserId[] = []): BuzzState {
	return { presses: [], judgeAt: null, winner: null, excluded };
}

export function isTargeted(prompt: Prompt, userId: UserId): boolean {
	return prompt.targets === 'all' || prompt.targets.includes(userId);
}
