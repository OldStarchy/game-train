import { useEffect, useState } from 'react';

export type WakeLockStatus = 'unsupported' | 'inactive' | 'active' | 'denied';

/**
 * Keep the screen on while `enabled`. Browsers release the lock when the page
 * is hidden, so it's re-requested whenever the page becomes visible again.
 * Requires HTTPS.
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
	const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
	const [status, setStatus] = useState<WakeLockStatus>(supported ? 'inactive' : 'unsupported');

	useEffect(() => {
		if (!enabled || !supported) return;
		let sentinel: WakeLockSentinel | undefined;
		let cancelled = false;

		const acquire = async () => {
			if (document.visibilityState !== 'visible' || sentinel?.released === false) return;
			try {
				sentinel = await navigator.wakeLock.request('screen');
				if (cancelled) {
					await sentinel.release();
					return;
				}
				setStatus('active');
				sentinel.addEventListener('release', () => {
					if (!cancelled) setStatus('inactive');
				});
			} catch {
				if (!cancelled) setStatus('denied');
			}
		};

		const onVisibility = () => {
			void acquire();
		};
		void acquire();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			cancelled = true;
			document.removeEventListener('visibilitychange', onVisibility);
			void sentinel?.release();
		};
	}, [enabled, supported]);

	return status;
}
