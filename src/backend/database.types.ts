/**
 * Types for the tables and functions in supabase/migrations, in the shape
 * `supabase gen types typescript` produces. Hand-maintained until type
 * generation runs in CI (it needs a Supabase access token); keep in sync with
 * the migrations.
 */
export interface Database {
	__InternalSupabase: { PostgrestVersion: '13' };
	public: {
		Tables: {
			profiles: {
				Row: {
					user_id: string;
					display_name: string;
					avatar: string | null;
					updated_at: string;
				};
				Insert: { user_id: string; display_name: string; avatar?: string | null };
				Update: { display_name?: string; avatar?: string | null };
				Relationships: [];
			};
			rooms: {
				Row: {
					id: string;
					code: string;
					host_id: string;
					name: string;
					status: 'lobby' | 'playing' | 'ended';
					auto_approve: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: { name?: string; auto_approve?: boolean };
				Update: {
					name?: string;
					status?: 'lobby' | 'playing' | 'ended';
					auto_approve?: boolean;
				};
				Relationships: [];
			};
			room_members: {
				Row: {
					room_id: string;
					user_id: string;
					role: MemberRole;
					status: MemberStatus;
					joined_at: string;
					updated_at: string;
				};
				Insert: never;
				Update: { role?: MemberRole; status?: MemberStatus };
				Relationships: [];
			};
		};
		Views: { [_ in never]: never };
		Functions: {
			can_host: { Args: { [_ in never]: never }; Returns: boolean };
			request_join: {
				Args: { p_code: string; p_role?: 'player' | 'screen' | 'audience' };
				Returns: { room_id: string; status: MemberStatus }[];
			};
		};
		Enums: { [_ in never]: never };
		CompositeTypes: { [_ in never]: never };
	};
}

export type MemberRole = 'player' | 'screen' | 'audience' | 'moderator';
export type MemberStatus = 'pending' | 'approved' | 'kicked' | 'banned';

export type RoomRow = Database['public']['Tables']['rooms']['Row'];
export type MemberRow = Database['public']['Tables']['room_members']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
