import { getRouteApi, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { RoomRow } from '../../backend/database.types';
import { getRoom, setMemberStatus, updateRoom, type MemberWithProfile } from '../../backend/rooms';
import { monotonicNow } from '../../lib/clock';
import { JoinCodeSchema } from '../../protocol/role';
import { HostSession, type HostSnapshot } from '../../session/hostSession';
import { SessionStore } from '../../session/sessionStore';
import { QrCode } from '../../app/components/QrCode';
import { useAuthUser } from '../../app/hooks/useAuthUser';
import { joinUrl } from '../../app/joinUrl';
import { useServices } from '../../app/services';
import { ConnectionBanner, errorMessage } from '../shared/messages';
import { useRoomMembers } from './useRoomMembers';

const route = getRouteApi('/host/room/$roomId');

const IDLE: HostSnapshot = { link: 'connecting', roster: [] };
const LOBBY_VIEW = { screen: 'lobby', message: 'Waiting for the host to start…' } as const;

export function HostRoomRoute() {
	const { roomId } = route.useParams();
	const { client } = useServices();
	const auth = useAuthUser();
	const [room, setRoom] = useState<RoomRow | null | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		const effect = { cancelled: false };
		getRoom(client, roomId)
			.then((r) => {
				if (!effect.cancelled) setRoom(r);
			})
			.catch((e: unknown) => {
				if (!effect.cancelled) setError(errorMessage(e));
			});
		return () => {
			effect.cancelled = true;
		};
	}, [client, roomId]);

	if (error) {
		return (
			<main className="page">
				<p className="error" role="alert">
					{error}
				</p>
			</main>
		);
	}
	if (auth.status === 'loading' || room === undefined) {
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);
	}
	if (room === null || !auth.user || auth.user.id !== room.host_id) {
		return (
			<main className="page">
				<h1>Game not found</h1>
				<p className="lead">It may have ended, or you're signed in as someone else.</p>
				<Link to="/host">Back to hosting</Link>
			</main>
		);
	}
	return (
		<RoomControl
			room={room}
			onRoomChange={(patch) => {
				setRoom({ ...room, ...patch });
			}}
		/>
	);
}

function RoomControl({
	room,
	onRoomChange,
}: {
	room: RoomRow;
	onRoomChange: (patch: Partial<RoomRow>) => void;
}) {
	const { client, transport } = useServices();
	const { members, refresh } = useRoomMembers(room.id);
	const [store] = useState(
		() =>
			new SessionStore(
				() =>
					new HostSession(transport.host(room.id), {
						now: monotonicNow,
						initialView: LOBBY_VIEW,
					}),
				IDLE,
			),
	);
	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const [actionError, setActionError] = useState<string | undefined>(undefined);
	const [confirmEnd, setConfirmEnd] = useState(false);
	// A ban can't be undone from here, so it takes a second tap.
	const [confirmBan, setConfirmBan] = useState<string | undefined>(undefined);

	const approved = useMemo(() => members?.filter((m) => m.status === 'approved') ?? [], [members]);
	const pending = useMemo(() => members?.filter((m) => m.status === 'pending') ?? [], [members]);

	// Keep the session's members and room state in step with the database.
	useEffect(() => {
		store.current?.setMembers(
			approved.map((m) => ({
				userId: m.userId,
				name: m.profile?.name ?? 'Player',
				avatar: m.profile?.avatar ?? null,
			})),
		);
	}, [store, approved]);

	useEffect(() => {
		store.current?.setRoom({ name: room.name, status: room.status });
	}, [store, room.name, room.status]);

	async function act(action: () => Promise<void>) {
		setActionError(undefined);
		try {
			await action();
		} catch (e) {
			setActionError(errorMessage(e));
		}
		refresh();
	}

	const setStatus = (m: MemberWithProfile, status: 'approved' | 'kicked' | 'banned') =>
		act(async () => {
			if (status !== 'approved') store.current?.notifyKicked(m.userId, status === 'banned');
			await setMemberStatus(client, room.id, m.userId, status);
		});

	const code = JoinCodeSchema.parse(room.code);
	const url = joinUrl(code, window.location.origin, import.meta.env.BASE_URL);
	const ended = room.status === 'ended';

	return (
		<main className="page wide">
			<ConnectionBanner state={snap.link} />
			<header className="row">
				<div>
					<p className="muted">Hosting</p>
					<h1>{room.name}</h1>
				</div>
				<Link to="/host" className="nowrap">
					All games
				</Link>
			</header>

			{actionError && (
				<p className="error" role="alert">
					{actionError}
				</p>
			)}

			{!ended && (
				<section className="join-card">
					<QrCode value={url} />
					<div className="stack">
						<p className="muted">Scan to join, or enter the code</p>
						<p className="code">{room.code}</p>
						<button
							type="button"
							className="secondary"
							onClick={() => void navigator.clipboard.writeText(url)}
						>
							Copy join link
						</button>
						<label className="check">
							<input
								type="checkbox"
								checked={room.auto_approve}
								onChange={(e) => {
									const autoApprove = e.target.checked;
									void act(async () => {
										await updateRoom(client, room.id, { autoApprove });
										onRoomChange({ auto_approve: autoApprove });
									});
								}}
							/>
							Let players in without approval
						</label>
					</div>
				</section>
			)}

			{pending.length > 0 && (
				<section className="stack">
					<h2>Waiting to join ({pending.length})</h2>
					<ul className="members">
						{pending.map((m) => (
							<li key={m.userId}>
								<MemberName member={m} />
								<button type="button" onClick={() => void setStatus(m, 'approved')}>
									Let in
								</button>
								<button
									type="button"
									className="secondary"
									onClick={() => void setStatus(m, 'kicked')}
								>
									Decline
								</button>
							</li>
						))}
					</ul>
				</section>
			)}

			<section className="stack">
				<h2>Players ({approved.length})</h2>
				{approved.length === 0 && <p className="muted">No one has joined yet.</p>}
				<ul className="members">
					{snap.roster.map((p) => {
						const m = approved.find((a) => a.userId === p.userId);
						if (!m) return null;
						return (
							<li key={p.userId}>
								<span
									className={`dot ${p.connected ? 'online' : 'offline'}`}
									title={p.connected ? 'Connected' : 'Not connected'}
								/>
								<MemberName member={m} />
								<button
									type="button"
									className="secondary"
									onClick={() => void setStatus(m, 'kicked')}
								>
									Kick
								</button>
								<button
									type="button"
									className="danger"
									onClick={() => {
										if (confirmBan !== m.userId) {
											setConfirmBan(m.userId);
											return;
										}
										setConfirmBan(undefined);
										void setStatus(m, 'banned');
									}}
								>
									{confirmBan === m.userId ? 'Confirm ban' : 'Ban'}
								</button>
							</li>
						);
					})}
				</ul>
			</section>

			{!ended && (
				<button
					type="button"
					className={confirmEnd ? 'danger' : 'secondary'}
					onClick={() => {
						if (!confirmEnd) {
							setConfirmEnd(true);
							return;
						}
						void act(async () => {
							await updateRoom(client, room.id, { status: 'ended' });
							onRoomChange({ status: 'ended' });
						});
					}}
				>
					{confirmEnd ? 'Tap again to end the game' : 'End game'}
				</button>
			)}
			{ended && <p className="lead">This game has ended.</p>}
		</main>
	);
}

function MemberName({ member }: { member: MemberWithProfile }) {
	return (
		<span className="name">
			<span className="avatar-badge" aria-hidden>
				{member.profile?.avatar ?? (member.profile?.name ?? '?').slice(0, 1).toUpperCase()}
			</span>
			{member.profile?.name ?? 'Unnamed player'}
		</span>
	);
}
