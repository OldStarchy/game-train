import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { leaveRoom } from '../../backend/rooms';
import { monotonicNow } from '../../lib/clock';
import { DeviceSession, type DeviceSnapshot } from '../../session/deviceSession';
import { SessionStore } from '../../session/sessionStore';
import { useServices } from '../../app/services';
import { useWakeLock } from '../../app/hooks/useWakeLock';
import { Roster } from '../shared/Roster';
import { ConnectionBanner } from '../shared/messages';

const IDLE: DeviceSnapshot = {
	link: 'connecting',
	room: undefined,
	roster: [],
	view: undefined,
	kicked: undefined,
	clock: undefined,
};

export function PlayerLobby({
	roomId,
	userId,
	onRemoved,
}: {
	roomId: string;
	userId: string;
	onRemoved: (banned: boolean) => void;
}) {
	const { client, transport } = useServices();
	const navigate = useNavigate();
	const [store] = useState(
		() =>
			new SessionStore(
				() => new DeviceSession(transport.device(roomId, userId), { now: monotonicNow }),
				IDLE,
			),
	);
	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const wakeLock = useWakeLock(snap.link === 'connected');

	useEffect(() => {
		if (snap.kicked) onRemoved(snap.kicked.banned);
	}, [snap.kicked, onRemoved]);

	async function leave() {
		await store.current?.stop();
		await leaveRoom(client, roomId, userId).catch(() => undefined);
		await navigate({ to: '/' });
	}

	const ended = snap.room?.status === 'ended';

	return (
		<main className="page">
			<ConnectionBanner state={snap.link} />
			<header>
				<p className="muted">{snap.room?.name ?? 'Game'}</p>
				<h1>{ended ? 'Game over' : "You're in!"}</h1>
			</header>
			<p className="lead">
				{ended
					? 'The host has ended this game.'
					: (snap.view?.message ?? 'Waiting for the host to start…')}
			</p>
			<section className="stack">
				<h2>Players</h2>
				<Roster players={snap.roster} highlight={userId} />
			</section>
			{wakeLock === 'denied' && (
				<p className="muted">Your screen may turn off. Tap the page to keep it awake.</p>
			)}
			<button type="button" className="secondary" onClick={() => void leave()}>
				Leave game
			</button>
		</main>
	);
}
