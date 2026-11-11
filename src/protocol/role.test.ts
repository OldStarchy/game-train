import { describe, expect, it } from 'vitest';
import { JoinCodeSchema, RoleSchema } from './role';

describe('JoinCodeSchema', () => {
	it('normalises case and whitespace', () => {
		expect(JoinCodeSchema.parse(' ab3cd ')).toBe('AB3CD');
	});

	it.each(['ABCD', 'ABCDEF', 'AB0CD', 'ABICD', ''])('rejects %j', (code) => {
		expect(JoinCodeSchema.safeParse(code).success).toBe(false);
	});
});

describe('RoleSchema', () => {
	it('rejects unknown roles', () => {
		expect(RoleSchema.safeParse('admin').success).toBe(false);
	});
});
