import { useParams } from 'react-router';

export function HostRoute() {
	const { code } = useParams();
	return (
		<main className="page">
			<h1>Host</h1>
			<p>{code ? `Room ${code}` : 'No room yet.'} Coming in a later milestone.</p>
		</main>
	);
}
