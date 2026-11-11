/** A backend failure with a message fit to show the user. */
export class BackendError extends Error {
	constructor(
		message: string,
		readonly code: BackendErrorCode,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = 'BackendError';
	}
}

export type BackendErrorCode =
	'room-not-found' | 'banned' | 'room-full' | 'too-many-rooms' | 'not-allowed' | 'unknown';

interface PostgrestLikeError {
	message: string;
	code?: string | undefined;
}

/**
 * Map database errors raised by the migrations' functions and policies to
 * user-facing errors. Matches on the messages raised in the SQL.
 */
export function toBackendError(error: PostgrestLikeError): BackendError {
	const m = error.message;
	if (/Room not found/.test(m)) {
		return new BackendError('No game with that code is running.', 'room-not-found', {
			cause: error,
		});
	}
	if (/Banned/.test(m)) {
		return new BackendError('The host has removed you from this game.', 'banned', { cause: error });
	}
	if (/Room is full/.test(m)) {
		return new BackendError('This game is full.', 'room-full', { cause: error });
	}
	if (/Too many open rooms/.test(m)) {
		return new BackendError('You have too many open games. End one first.', 'too-many-rooms', {
			cause: error,
		});
	}
	if (/row-level security|permission denied/.test(m) || error.code === '42501') {
		return new BackendError("You're not allowed to do that.", 'not-allowed', { cause: error });
	}
	return new BackendError(m, 'unknown', { cause: error });
}
