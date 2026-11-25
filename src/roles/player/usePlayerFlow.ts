import { useCallback, useEffect, useState } from 'react';
import { ensureSignedIn } from '../../backend/auth';
import { BackendError } from '../../backend/errors';
import {
	getOwnMembership,
	getProfile,
	requestJoin,
	saveProfile,
	watchMembers,
	type Profile,
} from '../../backend/rooms';
import type { JoinCode } from '../../protocol/role';
import { useServices } from '../../app/services';
import { errorMessage } from '../shared/messages';

export type PlayerPhase =
	| { kind: 'starting' }
	| { kind: 'profile'; userId: string; initial: Profile | null; busy: boolean; error?: string }
	| { kind: 'pending'; userId: string; roomId: string }
	| { kind: 'in'; userId: string; roomId: string }
	| { kind: 'removed'; userId: string; banned: boolean }
	| { kind: 'error'; message: string };

const POLL_MS = 5000;

/**
 * The player's path into a room: anonymous sign-in, name, join request,
 * waiting for approval, then in. Membership is watched throughout so a kick
 * or ban is noticed even if the realtime message was missed.
 */
export function usePlayerFlow(code: JoinCode) {
	const { client } = useServices();
	const [phase, setPhase] = useState<PlayerPhase>({ kind: 'starting' });

	// Sign in and load any existing profile.
	useEffect(() => {
		const effect = { cancelled: false };
		(async () => {
			const user = await ensureSignedIn(client);
			const profile = await getProfile(client, user.id);
			if (!effect.cancelled) {
				setPhase({ kind: 'profile', userId: user.id, initial: profile, busy: false });
			}
		})().catch((e: unknown) => {
			if (!effect.cancelled) setPhase({ kind: 'error', message: errorMessage(e) });
		});
		return () => {
			effect.cancelled = true;
		};
	}, [client]);

	const join = useCallback(
		async (profile: Profile) => {
			setPhase({ kind: 'profile', userId: profile.userId, initial: profile, busy: true });
			try {
				await saveProfile(client, profile);
				const { roomId, status } = await requestJoin(client, code);
				setPhase(
					status === 'approved'
						? { kind: 'in', userId: profile.userId, roomId }
						: { kind: 'pending', userId: profile.userId, roomId },
				);
			} catch (e) {
				if (e instanceof BackendError && e.code === 'banned') {
					setPhase({ kind: 'removed', userId: profile.userId, banned: true });
				} else {
					setPhase({
						kind: 'profile',
						userId: profile.userId,
						initial: profile,
						busy: false,
						error: errorMessage(e),
					});
				}
			}
		},
		[client, code],
	);

	// While waiting or in the room, follow our own membership.
	const roomId = phase.kind === 'pending' || phase.kind === 'in' ? phase.roomId : undefined;
	const userId = phase.kind === 'pending' || phase.kind === 'in' ? phase.userId : undefined;
	useEffect(() => {
		if (roomId === undefined || userId === undefined) return;
		const effect = { cancelled: false };
		const check = async () => {
			const row = await getOwnMembership(client, roomId, userId);
			if (effect.cancelled) return;
			setPhase((current) => {
				if (current.kind !== 'pending' && current.kind !== 'in') return current;
				if (!row || row.status === 'kicked' || row.status === 'banned') {
					return { kind: 'removed', userId, banned: row?.status === 'banned' };
				}
				if (row.status === 'approved' && current.kind === 'pending') {
					return { kind: 'in', userId, roomId };
				}
				return current;
			});
		};
		const run = () => {
			check().catch(() => undefined);
		};
		const stopWatching = watchMembers(client, roomId, run);
		const poll = setInterval(run, POLL_MS);
		return () => {
			effect.cancelled = true;
			clearInterval(poll);
			void stopWatching();
		};
	}, [client, roomId, userId]);

	const removed = useCallback((banned: boolean) => {
		setPhase((current) =>
			current.kind === 'in' ? { kind: 'removed', userId: current.userId, banned } : current,
		);
	}, []);

	const askAgain = useCallback(async () => {
		if (phase.kind !== 'removed') return;
		const profile = await getProfile(client, phase.userId).catch(() => null);
		setPhase({ kind: 'profile', userId: phase.userId, initial: profile, busy: false });
	}, [client, phase]);

	return { phase, join, removed, askAgain };
}
