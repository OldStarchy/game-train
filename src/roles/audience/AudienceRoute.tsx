import { getRouteApi } from '@tanstack/react-router';

const route = getRouteApi('/audience/$code');

export function AudienceRoute() {
	const { code } = route.useParams();
	return (
		<main className="page">
			<h1>Audience</h1>
			<p>Room {code}. Coming in a later milestone.</p>
		</main>
	);
}
