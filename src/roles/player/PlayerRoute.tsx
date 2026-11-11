import { getRouteApi, Link } from '@tanstack/react-router';
import { assertNever } from '../../lib/assertNever';
import { PlayerLobby } from './PlayerLobby';
import { ProfileForm } from './ProfileForm';
import { usePlayerFlow } from './usePlayerFlow';

const route = getRouteApi('/join/$code');

export function PlayerRoute() {
	const { code } = route.useParams();
	const { phase, join, removed, askAgain } = usePlayerFlow(code);

	switch (phase.kind) {
		case 'starting':
			return (
				<main className="page">
					<p className="muted">Getting ready…</p>
				</main>
			);
		case 'profile':
			return (
				<main className="page">
					<header>
						<p className="muted">Joining game {code}</p>
						<h1>Who's playing?</h1>
					</header>
					{phase.error && (
						<p className="error" role="alert">
							{phase.error}
						</p>
					)}
					<ProfileForm
						userId={phase.userId}
						initial={phase.initial}
						busy={phase.busy}
						onSubmit={(profile) => void join(profile)}
					/>
				</main>
			);
		case 'pending':
			return (
				<main className="page">
					<h1>Waiting for the host</h1>
					<p className="lead">The host will let you in shortly.</p>
				</main>
			);
		case 'in':
			return <PlayerLobby roomId={phase.roomId} userId={phase.userId} onRemoved={removed} />;
		case 'removed':
			return (
				<main className="page">
					<h1>You've been removed</h1>
					<p className="lead">
						{phase.banned
							? "The host has removed you from this game, and you can't rejoin."
							: 'The host removed you from this game.'}
					</p>
					{!phase.banned && (
						<button type="button" onClick={() => void askAgain()}>
							Ask to join again
						</button>
					)}
					<Link to="/">Back to start</Link>
				</main>
			);
		case 'error':
			return (
				<main className="page">
					<h1>Couldn't join</h1>
					<p className="error" role="alert">
						{phase.message}
					</p>
					<Link to="/">Back to start</Link>
				</main>
			);
		default:
			return assertNever(phase);
	}
}
