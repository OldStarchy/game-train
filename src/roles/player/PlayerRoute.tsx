import { getRouteApi } from '@tanstack/react-router';

const route = getRouteApi('/join/$code');

export function PlayerRoute() {
	const { code } = route.useParams();
	return (
		<main className="page">
			<h1>Player</h1>
			<p>Room {code}. Coming in a later milestone.</p>
		</main>
	);
}
