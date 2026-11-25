import { useState, type SubmitEvent } from 'react';
import type { ManualAction, ManualState, Prompt } from '../../engine/segments/manual';
import { assertNever } from '../../lib/assertNever';
import { COLORS, type Color, type WidgetKind, type WidgetSpec } from '../../protocol/widgetSchemas';

export interface PanelPlayer {
	userId: string;
	name: string;
	avatar: string | null;
}

const KIND_LABELS: Record<WidgetKind, string> = {
	buzzer: 'Buzzer',
	'text-input': 'Answer',
	choice: 'Choice',
	text: 'Message',
	flash: 'Colour',
};

/** The host's improvisation toolkit: show anything on players' screens and score it. */
export function ManualPanel({
	state,
	dispatch,
	players,
}: {
	state: ManualState;
	dispatch: (action: ManualAction) => void;
	players: readonly PanelPlayer[];
}) {
	const lastUndo = state.undo.at(-1);
	return (
		<section className="stack-lg panel">
			<div className="row">
				<h2>Game</h2>
				<button
					type="button"
					className="secondary small"
					disabled={!lastUndo}
					onClick={() => {
						dispatch({ type: 'undo' });
					}}
				>
					{lastUndo ? `Undo ${lastUndo.label}` : 'Undo'}
				</button>
			</div>
			{state.prompt && <NowShowing prompt={state.prompt} players={players} dispatch={dispatch} />}
			<Composer players={players} dispatch={dispatch} />
		</section>
	);
}

// ---------------------------------------------------------------------------
// Now showing
// ---------------------------------------------------------------------------

function NowShowing({
	prompt,
	players,
	dispatch,
}: {
	prompt: Prompt;
	players: readonly PanelPlayer[];
	dispatch: (action: ManualAction) => void;
}) {
	const nameOf = (id: string) => players.find((p) => p.userId === id)?.name ?? 'Someone';
	const targeted =
		prompt.targets === 'all' ? players : players.filter((p) => prompt.targets.includes(p.userId));
	const award = (userId: string, points = 1) => {
		dispatch({
			type: 'award',
			userId,
			points,
			label: `${points > 0 ? '+' : ''}${points} ${nameOf(userId)}`,
		});
	};
	const { widget } = prompt;

	return (
		<div className="card stack">
			<div className="row">
				<p>
					<span className="muted">Showing </span>
					<strong>{describe(widget)}</strong>
					<span className="muted">
						{' '}
						to {prompt.targets === 'all' ? 'everyone' : targeted.map((p) => p.name).join(', ')}
					</span>
				</p>
			</div>

			{widget.kind === 'buzzer' && (
				<BuzzResults prompt={prompt} nameOf={nameOf} award={award} dispatch={dispatch} />
			)}

			{widget.kind === 'text-input' && (
				<ul className="results">
					{targeted.map((p) => {
						const r = prompt.responses[p.userId];
						return (
							<li key={p.userId}>
								<span className="name">{p.name}</span>
								<span className={r ? 'answer' : 'muted'}>
									{r?.kind === 'text' ? r.value : 'No answer yet'}
								</span>
								<button
									type="button"
									className="secondary small"
									onClick={() => {
										award(p.userId);
									}}
								>
									+1
								</button>
							</li>
						);
					})}
				</ul>
			)}

			{widget.kind === 'choice' && (
				<ul className="results">
					{widget.options.map((option, index) => {
						const pickers = targeted.filter((p) => {
							const r = prompt.responses[p.userId];
							return r?.kind === 'choice' && r.index === index;
						});
						return (
							// Options are positional; the index is their identity.
							<li key={index}>
								<span className="name">
									{option} <span className="muted">({pickers.length})</span>
								</span>
								<span className="answer">{pickers.map((p) => p.name).join(', ')}</span>
								<button
									type="button"
									className="secondary small"
									disabled={pickers.length === 0}
									onClick={() => {
										for (const p of pickers) award(p.userId);
									}}
								>
									+1 each
								</button>
							</li>
						);
					})}
				</ul>
			)}

			<div className="actions">
				{(widget.kind === 'text-input' || widget.kind === 'choice' || widget.kind === 'buzzer') && (
					<button
						type="button"
						className="secondary"
						disabled={prompt.locked}
						onClick={() => {
							dispatch({ type: 'lock' });
						}}
					>
						{prompt.locked ? 'Locked' : 'Lock answers'}
					</button>
				)}
				<button
					type="button"
					className="secondary"
					onClick={() => {
						dispatch({ type: 'clear' });
					}}
				>
					Clear screens
				</button>
			</div>
		</div>
	);
}

function BuzzResults({
	prompt,
	nameOf,
	award,
	dispatch,
}: {
	prompt: Prompt;
	nameOf: (id: string) => string;
	award: (userId: string, points?: number) => void;
	dispatch: (action: ManualAction) => void;
}) {
	const { buzz } = prompt;
	const presses = [...buzz.presses].sort((a, b) =>
		a.late === b.late ? a.at - b.at : a.late ? 1 : -1,
	);
	const first = presses[0]?.at ?? 0;
	return (
		<div className="stack">
			{presses.length === 0 && <p className="muted">Waiting for someone to buzz…</p>}
			{presses.length > 0 && (
				<ol className="results">
					{presses.map((p) => (
						<li key={p.userId} className={p.userId === buzz.winner ? 'winner' : undefined}>
							<span className="name">{nameOf(p.userId)}</span>
							<span className="muted">
								{p.late
									? 'too late'
									: p.userId === buzz.winner
										? 'first'
										: `+${Math.round(p.at - first)} ms`}
							</span>
						</li>
					))}
				</ol>
			)}
			{buzz.judgeAt !== null && buzz.winner === null && <p className="muted">Judging…</p>}
			{buzz.winner !== null && (
				<div className="actions">
					<button
						type="button"
						onClick={() => {
							if (buzz.winner) award(buzz.winner);
						}}
					>
						Correct: +1 {nameOf(buzz.winner)}
					</button>
					<button
						type="button"
						className="secondary"
						onClick={() => {
							dispatch({ type: 'rearm' });
						}}
					>
						Wrong: let others buzz
					</button>
				</div>
			)}
			{buzz.excluded.length > 0 && (
				<p className="muted">Locked out: {buzz.excluded.map(nameOf).join(', ')}</p>
			)}
		</div>
	);
}

function describe(widget: WidgetSpec): string {
	switch (widget.kind) {
		case 'buzzer':
			return widget.label ? `buzzer: “${widget.label}”` : 'buzzer';
		case 'text-input':
			return `question: “${widget.prompt}”`;
		case 'choice':
			return `choice: “${widget.prompt}”`;
		case 'text':
			return widget.title ? `message: “${widget.title}”` : 'message';
		case 'flash':
			return `${widget.color} ${widget.pattern === 'solid' ? 'screen' : widget.pattern}`;
		default:
			return assertNever(widget);
	}
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({
	players,
	dispatch,
}: {
	players: readonly PanelPlayer[];
	dispatch: (action: ManualAction) => void;
}) {
	const [kind, setKind] = useState<WidgetKind>('buzzer');
	const [prompt, setPrompt] = useState('');
	const [body, setBody] = useState('');
	const [options, setOptions] = useState('');
	const [color, setColor] = useState<Color>('blue');
	const [pattern, setPattern] = useState<'solid' | 'pulse' | 'strobe'>('solid');
	const [everyone, setEveryone] = useState(true);
	const [chosen, setChosen] = useState<readonly string[]>([]);

	const optionList = options
		.split('\n')
		.map((o) => o.trim())
		.filter(Boolean)
		.slice(0, 8);

	const widget = ((): WidgetSpec | null => {
		const label = prompt.trim() || undefined;
		switch (kind) {
			case 'buzzer':
				return { kind, ...(label && { label }) };
			case 'text-input':
				return label ? { kind, prompt: label, maxLength: 140 } : null;
			case 'choice':
				return label && optionList.length >= 2
					? { kind, prompt: label, options: optionList }
					: null;
			case 'text':
				return body.trim() ? { kind, body: body.trim(), ...(label && { title: label }) } : null;
			case 'flash':
				return { kind, color, pattern, ...(label && { label }) };
			default:
				return assertNever(kind);
		}
	})();

	const targets = everyone ? ('all' as const) : chosen;
	const canSend = widget !== null && (everyone || chosen.length > 0);

	function send(e: SubmitEvent) {
		e.preventDefault();
		if (!widget || !canSend) return;
		dispatch({ type: 'push', widget, targets });
	}

	const promptLabel: Record<WidgetKind, string> = {
		buzzer: 'Label (optional)',
		'text-input': 'Question',
		choice: 'Question',
		text: 'Title (optional)',
		flash: 'Label (optional)',
	};

	return (
		<form className="card stack" onSubmit={send}>
			<div className="tabs" role="tablist">
				{(Object.keys(KIND_LABELS) as WidgetKind[]).map((k) => (
					<button
						key={k}
						type="button"
						role="tab"
						aria-selected={kind === k}
						className="tab"
						onClick={() => {
							setKind(k);
						}}
					>
						{KIND_LABELS[k]}
					</button>
				))}
			</div>

			<label htmlFor="composer-prompt">{promptLabel[kind]}</label>
			<input
				id="composer-prompt"
				value={prompt}
				maxLength={kind === 'text-input' || kind === 'choice' ? 300 : 80}
				onChange={(e) => {
					setPrompt(e.target.value);
				}}
			/>

			{kind === 'text' && (
				<>
					<label htmlFor="composer-body">Message</label>
					<textarea
						id="composer-body"
						rows={3}
						maxLength={500}
						value={body}
						onChange={(e) => {
							setBody(e.target.value);
						}}
					/>
				</>
			)}

			{kind === 'choice' && (
				<>
					<label htmlFor="composer-options">Options, one per line (2–8)</label>
					<textarea
						id="composer-options"
						rows={4}
						value={options}
						onChange={(e) => {
							setOptions(e.target.value);
						}}
					/>
				</>
			)}

			{kind === 'flash' && (
				<>
					<div className="swatches" role="radiogroup" aria-label="Colour">
						{COLORS.map((c) => (
							<button
								key={c}
								type="button"
								role="radio"
								aria-checked={color === c}
								aria-label={c}
								className={`swatch flash-${c}`}
								onClick={() => {
									setColor(c);
								}}
							/>
						))}
					</div>
					<div className="tabs" role="radiogroup" aria-label="Pattern">
						{(['solid', 'pulse', 'strobe'] as const).map((p) => (
							<button
								key={p}
								type="button"
								role="radio"
								aria-checked={pattern === p}
								className="tab"
								onClick={() => {
									setPattern(p);
								}}
							>
								{p}
							</button>
						))}
					</div>
				</>
			)}

			<fieldset className="targets">
				<legend>Show to</legend>
				<label className="check">
					<input
						type="checkbox"
						checked={everyone}
						onChange={(e) => {
							setEveryone(e.target.checked);
						}}
					/>
					Everyone
				</label>
				{!everyone && (
					<div className="chips">
						{players.map((p) => (
							<button
								key={p.userId}
								type="button"
								className="chip"
								aria-pressed={chosen.includes(p.userId)}
								onClick={() => {
									setChosen(
										chosen.includes(p.userId)
											? chosen.filter((id) => id !== p.userId)
											: [...chosen, p.userId],
									);
								}}
							>
								{p.avatar ? `${p.avatar} ` : ''}
								{p.name}
							</button>
						))}
					</div>
				)}
			</fieldset>

			<button type="submit" disabled={!canSend}>
				Show {KIND_LABELS[kind].toLowerCase()}
			</button>
		</form>
	);
}
