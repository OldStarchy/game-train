import { z } from 'zod';

/**
 * Realtime topic names for a room. Must match the topic parser in
 * supabase/migrations/*_realtime_policies.sql, which authorizes them.
 *
 *   room:{roomId}:public      host → everyone in the room
 *   room:{roomId}:to:{uid}    host → one member
 *   room:{roomId}:from:{uid}  one member → host (sender identity = topic)
 */
export const UserIdSchema = z.uuid();
export type UserId = z.infer<typeof UserIdSchema>;

export const RoomIdSchema = z.uuid();
export type RoomId = z.infer<typeof RoomIdSchema>;

export const topics = {
	public: (roomId: RoomId) => `room:${roomId}:public`,
	to: (roomId: RoomId, userId: UserId) => `room:${roomId}:to:${userId}`,
	from: (roomId: RoomId, userId: UserId) => `room:${roomId}:from:${userId}`,
} as const;

/** The broadcast event name all game messages are sent under. */
export const MESSAGE_EVENT = 'm';
