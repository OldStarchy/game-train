import { expect } from '@playwright/test';
import { expectConnected } from './gameNight';
import { Given, Then, When } from './fixtures';

// --- Setting up -------------------------------------------------------------

Given('a host has created a game called {string}', async ({ game }, name: string) => {
	const host = await game.openHost();
	await host.goto('#/host');
	await host.getByLabel('Game name').fill(name);
	await host.getByRole('button', { name: 'Create game' }).click();
	await expect(host.locator('.code')).toHaveText(/^[A-Z0-9]{5}$/);
	game.code = ((await host.locator('.code').textContent()) ?? '').trim();
});

Given('{string} and {string} have asked to join', async ({ game }, a: string, b: string) => {
	for (const name of [a, b]) {
		const page = await game.openPlayer(name);
		await page.goto(`#/join/${game.code}`);
		await page.getByLabel('Your name').fill(name);
		await page.getByRole('button', { name: 'Join' }).click();
		await expect(page.getByRole('heading', { name: 'Waiting for the host' })).toBeVisible();
	}
});

When('the host lets everyone in', async ({ game }) => {
	const { host } = game;
	const waiting = game.players.length;
	await expect(host.getByRole('heading', { name: `Waiting to join (${waiting})` })).toBeVisible();
	for (let left = waiting; left > 0; left--) {
		await host.getByRole('button', { name: 'Let in' }).first().click();
		await expect(host.getByRole('button', { name: 'Let in' })).toHaveCount(left - 1);
	}
});

Then('{string} and {string} are in the game', async ({ game }, a: string, b: string) => {
	for (const name of [a, b]) {
		await expect(game.player(name).getByRole('heading', { name: "You're in!" })).toBeVisible();
	}
});

Then('everyone is connected', async ({ game }) => {
	for (const page of [game.host, ...game.players]) await expectConnected(page);
	// The host hears from every player (heartbeats over their own topics)...
	await expect(game.host.locator('.members .dot.online')).toHaveCount(game.players.length);
	// ...and every player gets the roster the host broadcasts.
	for (const page of game.players) {
		await expect(page.locator('.roster li')).toHaveCount(game.players.length);
	}
});

// --- Buzzer -------------------------------------------------------------------

When('the host shows a buzzer', async ({ game }) => {
	await game.host.getByRole('tab', { name: 'Buzzer' }).click();
	await game.host.getByRole('button', { name: 'Show buzzer' }).click();
	for (const page of game.players) await expect(page.locator('.buzzer')).toHaveText('BUZZ');
});

When('{string} buzzes', async ({ game }, name: string) => {
	await game.player(name).locator('.buzzer').click();
	// Space the presses out well beyond clock calibration error.
	await game.player(name).waitForTimeout(150);
});

Then('the host sees that {string} buzzed first', async ({ game }, name: string) => {
	await expect(game.host.locator('.results li.winner')).toContainText(name);
});

Then("{string}'s buzzer says {string}", async ({ game }, name: string, text: string) => {
	await expect(game.player(name).locator('.buzzer')).toHaveText(text);
});

When('the host marks {string} correct', async ({ game }, name: string) => {
	await game.host.getByRole('button', { name: `Correct: +1 ${name}` }).click();
});

When('the host clears the screens', async ({ game }) => {
	await game.host.getByRole('button', { name: 'Clear screens' }).click();
});

Then(
	'every player sees that {string} has {int} point(s)',
	async ({ game }, name: string, points: number) => {
		for (const page of game.players) {
			await expect(page.getByRole('heading', { name: "You're in!" })).toBeVisible();
			await expect(page.locator('.roster li', { hasText: name }).locator('.score')).toHaveText(
				String(points),
			);
		}
	},
);

// --- Questions ---------------------------------------------------------------------

When('the host asks {string}', async ({ game }, question: string) => {
	await game.host.getByRole('tab', { name: 'Answer' }).click();
	await game.host.getByLabel('Question').fill(question);
	await game.host.getByRole('button', { name: 'Show answer' }).click();
	for (const page of game.players) await expect(page.getByText(question)).toBeVisible();
});

When('{string} answers {string}', async ({ game }, name: string, answer: string) => {
	const page = game.player(name);
	await page.locator('#answer').fill(answer);
	await page.getByRole('button', { name: 'Send' }).click();
	await expect(page.getByText(`Sent: “${answer}”`)).toBeVisible();
});

Then('the host sees the answer {string}', async ({ game }, answer: string) => {
	await expect(game.host.locator('.results')).toContainText(answer);
});

Then('{string} cannot see the answer {string}', async ({ game }, name: string, answer: string) => {
	await expect(game.player(name).getByText(answer)).toHaveCount(0);
});

// --- Moderation ----------------------------------------------------------------------

When('the host kicks {string}', async ({ game }, name: string) => {
	await game.host
		.locator('.members li', { hasText: name })
		.getByRole('button', { name: 'Kick' })
		.click();
});

Then('{string} is told they have been removed', async ({ game }, name: string) => {
	await expect(
		game.player(name).getByRole('heading', { name: "You've been removed" }),
	).toBeVisible();
});

Then("{string} is no longer in the host's player list", async ({ game }, name: string) => {
	await expect(game.host.locator('.members li', { hasText: name })).toHaveCount(0);
});
