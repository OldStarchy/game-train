import { createClient } from '@supabase/supabase-js';
import { devices, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * The people at a game night, each in their own browser context (separate
 * storage, so separate identities), on an emulated phone, against the local
 * Supabase stack.
 */

function env(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set; see e2e/README.md`);
	return value;
}

const BASE_URL = 'http://localhost:4173/game-train/';

export class GameNight {
	private readonly contexts: BrowserContext[] = [];
	private hostPage: Page | undefined;
	private readonly playerPages = new Map<string, Page>();
	code = '';

	constructor(private readonly browser: Browser) {}

	get host(): Page {
		if (!this.hostPage) throw new Error('No host yet');
		return this.hostPage;
	}

	player(name: string): Page {
		const page = this.playerPages.get(name);
		if (!page) throw new Error(`No player called ${name}`);
		return page;
	}

	get players(): Page[] {
		return [...this.playerPages.values()];
	}

	async openHost(): Promise<Page> {
		const session = await createHostSession();
		const url = env('VITE_SUPABASE_URL');
		// supabase-js's default session storage key for this URL.
		const key = `sb-${new URL(url).hostname.split('.')[0] ?? ''}-auth-token`;
		this.hostPage = await this.newPage('host', async (page) => {
			await page.addInitScript(
				([k, v]) => {
					localStorage.setItem(k, v);
				},
				[key, session] as const,
			);
		});
		return this.hostPage;
	}

	async openPlayer(name: string): Promise<Page> {
		const page = await this.newPage(name);
		this.playerPages.set(name, page);
		return page;
	}

	async close(): Promise<void> {
		await Promise.all(this.contexts.map((c) => c.close()));
	}

	private async newPage(label: string, init?: (page: Page) => Promise<void>): Promise<Page> {
		const context = await this.browser.newContext({ ...devices['Pixel 7'], baseURL: BASE_URL });
		this.contexts.push(context);
		const page = await context.newPage();
		// Surfaced in the test output, which helps when a run fails in CI.
		page.on('console', (m) => {
			if (m.type() === 'error' || m.type() === 'warning') {
				console.log(`[${label}] ${m.type()}: ${m.text()}`);
			}
		});
		page.on('pageerror', (e) => {
			console.log(`[${label}] page error: ${e.message}`);
		});
		if (init) await init(page);
		return page;
	}
}

/** Create an allow-listed host user and return a signed-in session, as JSON. */
async function createHostSession(): Promise<string> {
	const url = env('VITE_SUPABASE_URL');
	const admin = createClient(url, env('E2E_SERVICE_ROLE_KEY'), {
		auth: { persistSession: false },
	});
	const email = `host-${crypto.randomUUID()}@example.test`;
	const password = `pw-${crypto.randomUUID()}`;
	const { data: created, error: createError } = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
	});
	if (createError) throw createError;
	const { error: allowError } = await admin
		.from('allowed_hosts')
		.insert({ user_id: created.user.id, note: 'e2e' });
	if (allowError) throw allowError;

	const anon = createClient(url, env('VITE_SUPABASE_ANON_KEY'), {
		auth: { persistSession: false },
	});
	const { data, error } = await anon.auth.signInWithPassword({ email, password });
	if (error) throw error;
	return JSON.stringify(data.session);
}

/** The "Connecting…" / "Reconnecting…" banner is gone. */
export async function expectConnected(page: Page): Promise<void> {
	await expect(page.locator('.banner')).toHaveCount(0);
}
