import type { Session } from '@supabase/supabase-js';
import type { Client } from './client';
import { BackendError, toBackendError } from './errors';

export interface AuthUser {
	id: string;
	anonymous: boolean;
	email: string | undefined;
}

export function userFromSession(session: Session | null): AuthUser | null {
	if (!session) return null;
	return {
		id: session.user.id,
		anonymous: session.user.is_anonymous ?? false,
		email: session.user.email,
	};
}

/** Sign in anonymously unless some session already exists. */
export async function ensureSignedIn(client: Client): Promise<AuthUser> {
	const { data } = await client.auth.getSession();
	const existing = userFromSession(data.session);
	if (existing) return existing;
	const { data: signedIn, error } = await client.auth.signInAnonymously();
	if (error) throw toBackendError(error);
	const user = userFromSession(signedIn.session);
	if (!user) throw new BackendError('Could not start a session.', 'unknown');
	return user;
}

/**
 * Where to send the browser after an OAuth or email sign-in. It must be in
 * the project's allowed redirect URLs. No hash: the sign-in result arrives as
 * `?code=`, and the route to return to is remembered separately.
 */
export function signInRedirectUrl(location: Pick<Location, 'origin'>, baseUrl: string): string {
	return `${location.origin}${baseUrl}`;
}

const RETURN_KEY = 'game-train:return-to';

export function rememberReturnRoute(path: string, storage: Storage = sessionStorage): void {
	try {
		storage.setItem(RETURN_KEY, path);
	} catch {
		// Storage can be unavailable (private mode); the user lands on the home page.
	}
}

export function takeReturnRoute(storage: Storage = sessionStorage): string | null {
	try {
		const path = storage.getItem(RETURN_KEY);
		storage.removeItem(RETURN_KEY);
		return path?.startsWith('/') ? path : null;
	} catch {
		return null;
	}
}

export async function signInWithDiscord(client: Client, redirectTo: string): Promise<void> {
	const { error } = await client.auth.signInWithOAuth({
		provider: 'discord',
		options: { redirectTo },
	});
	if (error) throw toBackendError(error);
}

export async function sendEmailSignInLink(
	client: Client,
	email: string,
	redirectTo: string,
): Promise<void> {
	const { error } = await client.auth.signInWithOtp({
		email,
		options: { emailRedirectTo: redirectTo },
	});
	if (error) throw toBackendError(error);
}

export async function signOut(client: Client): Promise<void> {
	const { error } = await client.auth.signOut();
	if (error) throw toBackendError(error);
}
