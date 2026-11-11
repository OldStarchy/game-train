import { useParams } from 'react-router';

export function ScreenRoute() {
	const { code } = useParams();
	return (
		<main className="page">
			<h1>Screen</h1>
			<p>{code ? `Room ${code}` : 'No room yet.'} Coming in a later milestone.</p>
		</main>
	);
}
