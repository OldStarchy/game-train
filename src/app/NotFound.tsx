import { Link } from '@tanstack/react-router';

export function NotFound() {
	return (
		<main className="page">
			<h1>Not found</h1>
			<p>That game link isn't valid. Check the code and try again.</p>
			<Link to="/">Back to start</Link>
		</main>
	);
}
