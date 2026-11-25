import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type Client = SupabaseClient<Database>;

export interface BackendConfig {
	url: string;
	anonKey: string;
}

/** Supabase settings from the build environment, if present. */
export function configFromEnv(
	env: Record<string, unknown> = import.meta.env,
): BackendConfig | null {
	const url = env.VITE_SUPABASE_URL;
	const anonKey = env.VITE_SUPABASE_ANON_KEY;
	if (typeof url !== 'string' || typeof anonKey !== 'string' || !url || !anonKey) return null;
	return { url, anonKey };
}

export function createBackendClient(config: BackendConfig): Client {
	return createClient<Database>(config.url, config.anonKey, {
		auth: {
			// PKCE puts the sign-in result in the query string (`?code=`), which
			// doesn't collide with hash routing the way the implicit flow's
			// `#access_token=` fragment would.
			flowType: 'pkce',
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true,
		},
	});
}
