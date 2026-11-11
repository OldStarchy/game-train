import { describe, expect, it } from 'vitest';
import { JoinCodeSchema } from '../protocol/role';
import { joinUrl } from './joinUrl';

describe('joinUrl', () => {
	it('builds a hash-routed link under the base path', () => {
		expect(joinUrl(JoinCodeSchema.parse('AB3CD'), 'https://x.github.io', '/game-train/')).toBe(
			'https://x.github.io/game-train/#/join/AB3CD',
		);
	});
});
