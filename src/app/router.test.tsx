// @vitest-environment jsdom
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { routeTree } from './router';

async function load(path: string) {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return router.state.matches.at(-1);
}

describe('room routes', () => {
	it('normalises a valid join code', async () => {
		const match = await load('/join/ab3cd');
		expect(match?.status).toBe('success');
		expect(match?.params).toEqual({ code: 'AB3CD' });
	});

	it.each(['/join/AB0CD', '/join/TOOLONG', '/screen/abc'])('rejects %s', async (path) => {
		const match = await load(path);
		expect(match?.status).toBe('error');
	});
});
