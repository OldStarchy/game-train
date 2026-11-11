import { useCallback, useEffect, useState } from 'react';
import { listMembers, watchMembers, type MemberWithProfile } from '../../backend/rooms';
import { useServices } from '../../app/services';

const POLL_MS = 10_000;

/** A room's memberships, refreshed on database changes (and polled as a fallback). */
export function useRoomMembers(roomId: string) {
	const { client } = useServices();
	const [members, setMembers] = useState<MemberWithProfile[] | undefined>(undefined);
	const [version, setVersion] = useState(0);

	const refresh = useCallback(() => {
		setVersion((v) => v + 1);
	}, []);

	useEffect(() => {
		const stop = watchMembers(client, roomId, refresh);
		const poll = setInterval(refresh, POLL_MS);
		return () => {
			clearInterval(poll);
			void stop();
		};
	}, [client, roomId, refresh]);

	useEffect(() => {
		const effect = { cancelled: false };
		listMembers(client, roomId)
			.then((m) => {
				if (!effect.cancelled) setMembers(m);
			})
			.catch(() => undefined);
		return () => {
			effect.cancelled = true;
		};
	}, [client, roomId, version]);

	return { members, refresh };
}
