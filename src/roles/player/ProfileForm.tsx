import { useState, type SubmitEvent } from 'react';
import type { Profile } from '../../backend/rooms';
import { AVATARS } from '../shared/avatars';

const NAME_KEY = 'game-train:last-name';

function lastName(): string {
	try {
		return localStorage.getItem(NAME_KEY) ?? '';
	} catch {
		return '';
	}
}

export function ProfileForm({
	userId,
	initial,
	busy,
	onSubmit,
}: {
	userId: string;
	initial: Profile | null;
	busy: boolean;
	onSubmit: (profile: Profile) => void;
}) {
	const [name, setName] = useState(initial?.name ?? lastName());
	const [avatar, setAvatar] = useState<string | null>(initial?.avatar ?? null);
	const trimmed = name.trim();
	const valid = trimmed.length >= 1 && trimmed.length <= 32;

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!valid || busy) return;
		try {
			localStorage.setItem(NAME_KEY, trimmed);
		} catch {
			// Not essential.
		}
		onSubmit({ userId, name: trimmed, avatar });
	}

	return (
		<form className="stack" onSubmit={submit}>
			<label htmlFor="name">Your name</label>
			<input
				id="name"
				value={name}
				maxLength={32}
				autoComplete="nickname"
				onChange={(e) => {
					setName(e.target.value);
				}}
			/>
			<fieldset className="avatars">
				<legend>Pick an avatar (optional)</legend>
				{AVATARS.map((a) => (
					<button
						key={a}
						type="button"
						className="avatar"
						aria-pressed={avatar === a}
						onClick={() => {
							setAvatar(avatar === a ? null : a);
						}}
					>
						{a}
					</button>
				))}
			</fieldset>
			<button type="submit" disabled={!valid || busy}>
				{busy ? 'Joining…' : 'Join'}
			</button>
		</form>
	);
}
