import { useEffect, useState } from 'react';
import { userFromSession, type AuthUser } from '../../backend/auth';
import { useServices } from '../services';

export type AuthState = { status: 'loading' } | { status: 'ready'; user: AuthUser | null };

/** The signed-in user, kept current as sessions start, refresh and end. */
export function useAuthUser(): AuthState {
	const { client } = useServices();
	const [state, setState] = useState<AuthState>({ status: 'loading' });

	useEffect(() => {
		const { data } = client.auth.onAuthStateChange((_event, session) => {
			setState({ status: 'ready', user: userFromSession(session) });
		});
		return () => {
			data.subscription.unsubscribe();
		};
	}, [client]);

	return state;
}
