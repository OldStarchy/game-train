import { useState, type SubmitEvent } from 'react';
import { assertNever } from '../lib/assertNever';
import type { View } from '../protocol/messages';
import type { WidgetInput } from '../protocol/widgetSchemas';

type WidgetScreen = Extract<View, { screen: 'widget' }>;

/** What a widget can send back. Buzz timestamps are added by the session. */
export type WidgetEmit = (input: Exclude<WidgetInput, { kind: 'buzz' }> | { kind: 'buzz' }) => void;

/**
 * Renders one widget view on a player's device. Holds no game logic: it shows
 * the state the host sent and reports the player's input.
 */
export function WidgetView({ view, emit }: { view: WidgetScreen; emit: WidgetEmit }) {
	const { widget, state } = view;
	switch (widget.kind) {
		case 'text':
			return (
				<div className="widget widget-text">
					{widget.title && <h1>{widget.title}</h1>}
					<p className="widget-body">{widget.body}</p>
				</div>
			);
		case 'flash':
			return (
				<div
					className={`widget widget-flash flash-${widget.color} pattern-${widget.pattern}`}
					role="img"
					aria-label={widget.label ?? `${widget.color} screen`}
				>
					{widget.label && <p className="flash-label">{widget.label}</p>}
				</div>
			);
		case 'buzzer':
			return (
				<Buzzer
					// Remount per prompt so a new buzzer starts fresh.
					key={view.promptId}
					label={widget.label}
					status={state.kind === 'buzzer' ? state.status : 'locked'}
					onBuzz={() => {
						emit({ kind: 'buzz' });
					}}
				/>
			);
		case 'text-input':
			return (
				<TextAnswer
					key={view.promptId}
					prompt={widget.prompt}
					maxLength={widget.maxLength}
					submitted={state.kind === 'text-input' ? state.submitted : null}
					locked={state.kind === 'text-input' ? state.locked : true}
					onSubmit={(value) => {
						emit({ kind: 'text', value });
					}}
				/>
			);
		case 'choice': {
			const selected = state.kind === 'choice' ? state.selected : null;
			const locked = state.kind === 'choice' ? state.locked : true;
			return (
				<div className="widget widget-choice">
					<p className="widget-prompt">{widget.prompt}</p>
					<div className="choices">
						{widget.options.map((option, index) => (
							<button
								// Options are positional; the index is their identity.
								key={index}
								type="button"
								className="choice"
								aria-pressed={selected === index}
								disabled={locked}
								onClick={() => {
									emit({ kind: 'choice', index });
								}}
							>
								{option}
							</button>
						))}
					</div>
					{locked && <p className="muted">Answers are locked.</p>}
				</div>
			);
		}
		default:
			return assertNever(widget);
	}
}

const BUZZER_TEXT = {
	armed: 'BUZZ',
	pressed: 'Buzzed!',
	won: "You're first!",
	lost: 'Too slow',
	locked: 'Locked',
} as const;

function Buzzer({
	label,
	status,
	onBuzz,
}: {
	label: string | undefined;
	status: keyof typeof BUZZER_TEXT;
	onBuzz: () => void;
}) {
	// Show the press immediately rather than waiting for the host's reply.
	const [pressedLocally, setPressedLocally] = useState(false);
	const shown = status === 'armed' && pressedLocally ? 'pressed' : status;
	return (
		<div className="widget widget-buzzer">
			{label && <p className="widget-prompt">{label}</p>}
			<button
				type="button"
				className={`buzzer buzzer-${shown}`}
				disabled={shown !== 'armed'}
				// pointerdown fires sooner than click, which matters for a buzzer.
				onPointerDown={() => {
					if (shown !== 'armed') return;
					setPressedLocally(true);
					// Typed as always present, but iOS Safari doesn't have it.
					if ('vibrate' in navigator) navigator.vibrate(60);
					onBuzz();
				}}
			>
				{BUZZER_TEXT[shown]}
			</button>
		</div>
	);
}

function TextAnswer({
	prompt,
	maxLength,
	submitted,
	locked,
	onSubmit,
}: {
	prompt: string;
	maxLength: number;
	submitted: string | null;
	locked: boolean;
	onSubmit: (value: string) => void;
}) {
	const [value, setValue] = useState(submitted ?? '');
	const trimmed = value.trim();

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (trimmed && !locked) onSubmit(trimmed);
	}

	return (
		<form className="widget widget-text-input stack" onSubmit={submit}>
			<label className="widget-prompt" htmlFor="answer">
				{prompt}
			</label>
			<textarea
				id="answer"
				value={value}
				maxLength={maxLength}
				rows={3}
				disabled={locked}
				onChange={(e) => {
					setValue(e.target.value);
				}}
			/>
			<button type="submit" disabled={locked || !trimmed || trimmed === submitted}>
				{submitted === null ? 'Send' : 'Change answer'}
			</button>
			{submitted !== null && <p className="muted">Sent: “{submitted}”</p>}
			{locked && <p className="muted">Answers are locked.</p>}
		</form>
	);
}
