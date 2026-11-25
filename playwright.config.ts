import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

/**
 * End-to-end tests, written as Gherkin scenarios in e2e/features and run by
 * Playwright (via playwright-bdd) against a local Supabase stack and the
 * built app. See e2e/README.md.
 */
const testDir = defineBddConfig({
	features: 'e2e/features/*.feature',
	steps: 'e2e/steps/*.ts',
	outputDir: '.features-gen',
});

export default defineConfig({
	testDir,
	timeout: 120_000,
	expect: { timeout: 20_000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	webServer: {
		command: 'npx vite preview --port 4173 --strictPort',
		url: 'http://localhost:4173/game-train/',
		reuseExistingServer: !process.env.CI,
	},
});
