import type { RosterEntry } from '../../protocol/messages';

export function Roster({
	players,
	highlight,
	scores,
}: {
	players: readonly RosterEntry[];
	highlight?: string;
	/** Shown when any player has a score. */
	scores?: ReadonlyMap<string, number>;
}) {
	if (players.length === 0) return <p className="muted">No players yet.</p>;
	const showScores = scores !== undefined && scores.size > 0;
	const ordered = showScores
		? [...players].sort((a, b) => (scores.get(b.userId) ?? 0) - (scores.get(a.userId) ?? 0))
		: players;
	return (
		<ul className="roster">
			{ordered.map((p) => (
				<li key={p.userId} className={p.userId === highlight ? 'me' : undefined}>
					<span className="avatar-badge" aria-hidden>
						{p.avatar ?? p.name.slice(0, 1).toUpperCase()}
					</span>
					<span className="name">{p.name}</span>
					{showScores && <span className="score">{scores.get(p.userId) ?? 0}</span>}
					<span
						className={`dot ${p.connected ? 'online' : 'offline'}`}
						title={p.connected ? 'Connected' : 'Not connected'}
					/>
				</li>
			))}
		</ul>
	);
}
