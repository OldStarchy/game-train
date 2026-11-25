import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type SubmitEvent } from 'react';
import { signOut, type AuthUser } from '../../backend/auth';
import type { RoomRow } from '../../backend/database.types';
import { canHost, createRoom, listOpenRooms } from '../../backend/rooms';
import { useAuthUser } from '../../app/hooks/useAuthUser';
import { useServices } from '../../app/services';
import { errorMessage } from '../shared/messages';
import { SignInPanel } from './SignInPanel';

export function HostRoute() {
	const auth = useAuthUser();

	let content;
	if (auth.status === 'loading') content = <p className="muted">Loading…</p>;
	else if (!auth.user || auth.user.anonymous) content = <SignInPanel />;
	else content = <HostGate user={auth.user} />;

	return (
		<main className="page">
			<header>
				<h1>Host a game</h1>
			</header>
			{content}
		</main>
	);
}

function SignOutButton() {
	const { client } = useServices();
	return (
		<button type="button" className="link" onClick={() => void signOut(client)}>
			Sign out
		</button>
	);
}

/** Checks the allow-list before showing the dashboard. */
function HostGate({ user }: { user: AuthUser }) {
	const { client } = useServices();
	const [allowed, setAllowed] = useState<boolean | 'error' | undefined>(undefined);

	useEffect(() => {
		const effect = { cancelled: false };
		canHost(client)
			.then((ok) => {
				if (!effect.cancelled) setAllowed(ok);
			})
			.catch(() => {
				if (!effect.cancelled) setAllowed('error');
			});
		return () => {
			effect.cancelled = true;
		};
	}, [client, user.id]);

	if (allowed === undefined) return <p className="muted">Checking access…</p>;
	if (allowed === 'error') {
		return (
			<p className="error" role="alert">
				Couldn't check hosting access. Try reloading.
			</p>
		);
	}
	if (!allowed) {
		return (
			<div className="stack">
				<p className="lead">
					You're signed in{user.email ? ` as ${user.email}` : ''}, but not on the hosts list yet.
				</p>
				<p>Send this id to whoever runs this site so they can add you:</p>
				<code className="copyable">{user.id}</code>
				<button
					type="button"
					className="secondary"
					onClick={() => void navigator.clipboard.writeText(user.id)}
				>
					Copy id
				</button>
				<SignOutButton />
			</div>
		);
	}
	return <HostDashboard user={user} />;
}

function HostDashboard({ user }: { user: AuthUser }) {
	const { client } = useServices();
	const navigate = useNavigate();
	const [rooms, setRooms] = useState<RoomRow[] | undefined>(undefined);
	const [name, setName] = useState('Game night');
	const [autoApprove, setAutoApprove] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		const effect = { cancelled: false };
		listOpenRooms(client, user.id)
			.then((r) => {
				if (!effect.cancelled) setRooms(r);
			})
			.catch((e: unknown) => {
				if (!effect.cancelled) setError(errorMessage(e));
			});
		return () => {
			effect.cancelled = true;
		};
	}, [client, user.id]);

	async function create(e: SubmitEvent) {
		e.preventDefault();
		setBusy(true);
		setError(undefined);
		try {
			const room = await createRoom(client, { name: name.trim(), autoApprove });
			await navigate({ to: '/host/room/$roomId', params: { roomId: room.id } });
		} catch (err) {
			setError(errorMessage(err));
			setBusy(false);
		}
	}

	return (
		<div className="stack-lg">
			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			<form className="stack" onSubmit={(e) => void create(e)}>
				<label htmlFor="room-name">Game name</label>
				<input
					id="room-name"
					value={name}
					maxLength={60}
					onChange={(e) => {
						setName(e.target.value);
					}}
				/>
				<label className="check">
					<input
						type="checkbox"
						checked={autoApprove}
						onChange={(e) => {
							setAutoApprove(e.target.checked);
						}}
					/>
					Let players in without approval
				</label>
				<button type="submit" disabled={busy || !name.trim()}>
					{busy ? 'Creating…' : 'Create game'}
				</button>
			</form>
			{rooms && rooms.length > 0 && (
				<section className="stack">
					<h2>Your open games</h2>
					<ul className="list">
						{rooms.map((r) => (
							<li key={r.id}>
								<Link to="/host/room/$roomId" params={{ roomId: r.id }}>
									{r.name} <span className="muted">({r.code})</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
			<SignOutButton />
		</div>
	);
}
