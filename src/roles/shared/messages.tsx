import type { LinkState } from '../../transport/types';

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Something went wrong.';
}

/** A small banner when the realtime connection isn't healthy. */
export function ConnectionBanner({ state }: { state: LinkState }) {
	if (state === 'connected' || state === 'closed') return null;
	return (
		<p className="banner" role="status">
			{state === 'connecting' ? 'Connecting…' : 'Connection lost. Reconnecting…'}
		</p>
	);
}
