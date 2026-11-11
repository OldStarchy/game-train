import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { JoinCodeSchema } from '../protocol/role';

export function Home() {
	const navigate = useNavigate();
	const [code, setCode] = useState('');
	const parsed = JoinCodeSchema.safeParse(code);

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (parsed.success) void navigate({ to: '/join/$code', params: { code: parsed.data } });
	}

	return (
		<main className="page">
			<h1>game-train</h1>
			<form onSubmit={onSubmit} className="stack">
				<label htmlFor="code">Join a game</label>
				<input
					id="code"
					value={code}
					onChange={(e) => {
						setCode(e.target.value);
					}}
					placeholder="CODE"
					autoCapitalize="characters"
					autoComplete="off"
					spellCheck={false}
				/>
				<button type="submit" disabled={!parsed.success}>
					Join
				</button>
			</form>
			<Link to="/host">Host a game</Link>
		</main>
	);
}
