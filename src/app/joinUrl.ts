import type { JoinCode } from '../protocol/role';

/** The link players open (or scan) to join a room. */
export function joinUrl(code: JoinCode, origin: string, baseUrl: string): string {
	return `${origin}${baseUrl}#/join/${code}`;
}
