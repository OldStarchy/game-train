import { createBdd, test as base } from 'playwright-bdd';
import { GameNight } from './gameNight';

export const test = base.extend<{ game: GameNight }>({
	game: async ({ browser }, use) => {
		const game = new GameNight(browser);
		await use(game);
		await game.close();
	},
});

export const { Given, When, Then } = createBdd(test);
