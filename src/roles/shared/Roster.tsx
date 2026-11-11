import type { RosterEntry } from '../../protocol/messages';

export function Roster({
	players,
	highlight,
}: {
	players: readonly RosterEntry[];
	highlight?: string;
}) {
	if (players.length === 0) return <p className="muted">No players yet.</p>;
	return (
		<ul className="roster">
			{players.map((p) => (
				<li key={p.userId} className={p.userId === highlight ? 'me' : undefined}>
					<span className="avatar-badge" aria-hidden>
						{p.avatar ?? p.name.slice(0, 1).toUpperCase()}
					</span>
					<span className="name">{p.name}</span>
					<span
						className={`dot ${p.connected ? 'online' : 'offline'}`}
						title={p.connected ? 'Connected' : 'Not connected'}
					/>
				</li>
			))}
		</ul>
	);
}
