import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Client } from './client';
import type { MemberRow, MemberStatus, ProfileRow, RoomRow } from './database.types';
import { toBackendError } from './errors';

export interface Profile {
	userId: string;
	name: string;
	avatar: string | null;
}

export interface MemberWithProfile {
	userId: string;
	role: MemberRow['role'];
	status: MemberStatus;
	joinedAt: string;
	profile: Profile | null;
}

function toProfile(row: ProfileRow): Profile {
	return { userId: row.user_id, name: row.display_name, avatar: row.avatar };
}

// --- Profiles ---------------------------------------------------------------

export async function getProfile(client: Client, userId: string): Promise<Profile | null> {
	const { data, error } = await client
		.from('profiles')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw toBackendError(error);
	return data ? toProfile(data) : null;
}

export async function saveProfile(client: Client, profile: Profile): Promise<void> {
	const { error } = await client
		.from('profiles')
		.upsert(
			{ user_id: profile.userId, display_name: profile.name, avatar: profile.avatar },
			{ onConflict: 'user_id' },
		);
	if (error) throw toBackendError(error);
}

// --- Hosting ----------------------------------------------------------------

export async function canHost(client: Client): Promise<boolean> {
	const { data, error } = await client.rpc('can_host');
	if (error) throw toBackendError(error);
	return data;
}

export async function createRoom(
	client: Client,
	options: { name: string; autoApprove: boolean },
): Promise<RoomRow> {
	const { data, error } = await client
		.from('rooms')
		.insert({ name: options.name, auto_approve: options.autoApprove })
		.select()
		.single();
	if (error) throw toBackendError(error);
	return data;
}

/** The host's unfinished rooms, newest first. */
export async function listOpenRooms(client: Client, hostId: string): Promise<RoomRow[]> {
	const { data, error } = await client
		.from('rooms')
		.select('*')
		.eq('host_id', hostId)
		.neq('status', 'ended')
		.order('created_at', { ascending: false });
	if (error) throw toBackendError(error);
	return data;
}

export async function getRoom(client: Client, roomId: string): Promise<RoomRow | null> {
	const { data, error } = await client.from('rooms').select('*').eq('id', roomId).maybeSingle();
	if (error) throw toBackendError(error);
	return data;
}

export async function updateRoom(
	client: Client,
	roomId: string,
	patch: { name?: string; status?: RoomRow['status']; autoApprove?: boolean },
): Promise<void> {
	const { error } = await client
		.from('rooms')
		.update({
			...(patch.name !== undefined && { name: patch.name }),
			...(patch.status !== undefined && { status: patch.status }),
			...(patch.autoApprove !== undefined && { auto_approve: patch.autoApprove }),
		})
		.eq('id', roomId);
	if (error) throw toBackendError(error);
}

// --- Membership ---------------------------------------------------------------

/** Every membership the caller can see in a room, with profiles. */
export async function listMembers(client: Client, roomId: string): Promise<MemberWithProfile[]> {
	const { data: members, error } = await client
		.from('room_members')
		.select('*')
		.eq('room_id', roomId)
		.order('joined_at');
	if (error) throw toBackendError(error);
	if (members.length === 0) return [];

	const { data: profiles, error: profileError } = await client
		.from('profiles')
		.select('*')
		.in(
			'user_id',
			members.map((m) => m.user_id),
		);
	if (profileError) throw toBackendError(profileError);
	const byId = new Map(profiles.map((p) => [p.user_id, toProfile(p)]));

	return members.map((m) => ({
		userId: m.user_id,
		role: m.role,
		status: m.status,
		joinedAt: m.joined_at,
		profile: byId.get(m.user_id) ?? null,
	}));
}

export async function getOwnMembership(
	client: Client,
	roomId: string,
	userId: string,
): Promise<MemberRow | null> {
	const { data, error } = await client
		.from('room_members')
		.select('*')
		.eq('room_id', roomId)
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw toBackendError(error);
	return data;
}

export async function requestJoin(
	client: Client,
	code: string,
): Promise<{ roomId: string; status: MemberStatus }> {
	const { data, error } = await client.rpc('request_join', { p_code: code, p_role: 'player' });
	if (error) throw toBackendError(error);
	const row = data[0];
	if (!row) throw toBackendError({ message: 'Room not found' });
	return { roomId: row.room_id, status: row.status };
}

export async function setMemberStatus(
	client: Client,
	roomId: string,
	userId: string,
	status: MemberStatus,
): Promise<void> {
	const { error } = await client
		.from('room_members')
		.update({ status })
		.eq('room_id', roomId)
		.eq('user_id', userId);
	if (error) throw toBackendError(error);
}

export async function leaveRoom(client: Client, roomId: string, userId: string): Promise<void> {
	const { error } = await client
		.from('room_members')
		.delete()
		.eq('room_id', roomId)
		.eq('user_id', userId);
	if (error) throw toBackendError(error);
}

/**
 * Call `onChange` whenever memberships visible to the caller change in a room.
 * Payloads are ignored: callers re-read, which keeps RLS in charge of what
 * they see. Returns an unsubscribe function.
 */
export function watchMembers(
	client: Client,
	roomId: string,
	onChange: () => void,
): () => Promise<void> {
	const channel: RealtimeChannel = client
		.channel(`members:${roomId}`)
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
			() => {
				onChange();
			},
		)
		.subscribe();
	return async () => {
		await client.removeChannel(channel);
	};
}
