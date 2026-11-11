import { z } from 'zod';

/** What a connected device is within a room. See docs/design.md ("Concepts"). */
export const RoleSchema = z.enum(['host', 'player', 'screen', 'audience', 'moderator']);
export type Role = z.infer<typeof RoleSchema>;

/** Join codes: short, uppercase, no easily-confused characters (0/O, 1/I/L). */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 5;

export const JoinCodeSchema = z
	.string()
	.transform((s) => s.trim().toUpperCase())
	.pipe(
		z
			.string()
			.length(JOIN_CODE_LENGTH)
			.regex(new RegExp(`^[${JOIN_CODE_ALPHABET}]+$`), 'Invalid join code'),
	);
export type JoinCode = z.infer<typeof JoinCodeSchema>;
