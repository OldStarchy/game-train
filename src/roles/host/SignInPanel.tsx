import { useState, type SubmitEvent } from 'react';
import {
	rememberReturnRoute,
	sendEmailSignInLink,
	signInRedirectUrl,
	signInWithDiscord,
} from '../../backend/auth';
import { useServices } from '../../app/services';
import { errorMessage } from '../shared/messages';

export function SignInPanel() {
	const { client } = useServices();
	const [email, setEmail] = useState('');
	const [state, setState] = useState<
		{ kind: 'idle' } | { kind: 'busy' } | { kind: 'sent' } | { kind: 'error'; message: string }
	>({ kind: 'idle' });
	const redirectTo = signInRedirectUrl(window.location, import.meta.env.BASE_URL);

	async function discord() {
		setState({ kind: 'busy' });
		rememberReturnRoute('/host');
		try {
			await signInWithDiscord(client, redirectTo);
		} catch (e) {
			setState({ kind: 'error', message: errorMessage(e) });
		}
	}

	async function sendLink(e: SubmitEvent) {
		e.preventDefault();
		setState({ kind: 'busy' });
		rememberReturnRoute('/host');
		try {
			await sendEmailSignInLink(client, email.trim(), redirectTo);
			setState({ kind: 'sent' });
		} catch (err) {
			setState({ kind: 'error', message: errorMessage(err) });
		}
	}

	if (state.kind === 'sent') {
		return <p className="lead">Check your email for a sign-in link. Open it on this device.</p>;
	}

	const busy = state.kind === 'busy';
	return (
		<div className="stack-lg">
			<p className="lead">Hosting is invite-only. Sign in to continue.</p>
			{state.kind === 'error' && (
				<p className="error" role="alert">
					{state.message}
				</p>
			)}
			<button type="button" disabled={busy} onClick={() => void discord()}>
				Sign in with Discord
			</button>
			<form className="stack" onSubmit={(e) => void sendLink(e)}>
				<label htmlFor="email">Or get a sign-in link by email</label>
				<input
					id="email"
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(e) => {
						setEmail(e.target.value);
					}}
				/>
				<button type="submit" className="secondary" disabled={busy || !email.trim()}>
					Email me a link
				</button>
			</form>
		</div>
	);
}
