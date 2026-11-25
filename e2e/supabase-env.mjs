// Prints the local Supabase stack's settings as KEY=value lines, for
// $GITHUB_ENV or `export`. Key names differ between CLI versions, so several
// spellings are accepted.
import { execFileSync } from 'node:child_process';

const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
const status = JSON.parse(raw.slice(raw.indexOf('{')));

function pick(...names) {
	for (const n of names) if (typeof status[n] === 'string' && status[n]) return status[n];
	throw new Error(
		`None of ${names.join(', ')} in supabase status. Keys: ${Object.keys(status).join(', ')}`,
	);
}

const out = {
	VITE_SUPABASE_URL: pick('API_URL', 'api_url'),
	VITE_SUPABASE_ANON_KEY: pick('ANON_KEY', 'PUBLISHABLE_KEY', 'anon_key', 'publishable_key'),
	E2E_SERVICE_ROLE_KEY: pick('SERVICE_ROLE_KEY', 'SECRET_KEY', 'service_role_key', 'secret_key'),
};
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
