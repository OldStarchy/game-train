import { getRouteApi } from '@tanstack/react-router';

const route = getRouteApi('/screen/$code');

export function ScreenRoute() {
	const { code } = route.useParams();
	return (
		<main className="page">
			<h1>Screen</h1>
			<p>Room {code}. Coming in a later milestone.</p>
		</main>
	);
}
