import { useParams } from 'react-router';

export function AudienceRoute() {
	const { code } = useParams();
	return (
		<main className="page">
			<h1>Audience</h1>
			<p>{code ? `Room ${code}` : 'No room yet.'} Coming in a later milestone.</p>
		</main>
	);
}
