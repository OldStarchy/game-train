import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestDb, type TestUser } from './db';

let db: TestDb;

beforeAll(async () => {
	db = await TestDb.create();
});

afterAll(async () => {
	await db.close();
});

/** Error message for a statement that is expected to fail. */
async function failure(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
	throw new Error('expected the statement to fail');
}

async function allowHost(user: TestUser) {
	await db.admin('insert into public.allowed_hosts (user_id) values ($1)', [user.id]);
}

async function createRoom(host: TestUser, autoApprove = false) {
	const [room] = await db.as<{ id: string; code: string }>(
		host,
		'insert into public.rooms (name, auto_approve) values ($1, $2) returning id, code',
		['Test night', autoApprove],
	);
	if (!room) throw new Error('room insert returned nothing');
	return room;
}

async function join(user: TestUser, code: string, role = 'player') {
	const [row] = await db.as<{ room_id: string; status: string }>(
		user,
		'select * from public.request_join($1, $2)',
		[code, role],
	);
	if (!row) throw new Error('request_join returned nothing');
	return row;
}

async function setStatus(host: TestUser, roomId: string, user: TestUser, status: string) {
	return db.as(
		host,
		'update public.room_members set status = $3 where room_id = $1 and user_id = $2 returning *',
		[roomId, user.id, status],
	);
}

describe('hosting', () => {
	it('lets allow-listed, non-anonymous users create rooms with a valid code', async () => {
		const host = await db.createUser(false);
		await allowHost(host);
		const room = await createRoom(host);
		expect(room.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
		const [canHost] = await db.as<{ can_host: boolean }>(host, 'select public.can_host()');
		expect(canHost?.can_host).toBe(true);
	});

	it('refuses users who are not on the allow-list', async () => {
		const user = await db.createUser(false);
		expect(await failure(createRoom(user))).toMatch(/row-level security/);
	});

	it('refuses anonymous users even if allow-listed', async () => {
		const user = await db.createUser(true);
		await allowHost(user);
		expect(await failure(createRoom(user))).toMatch(/row-level security/);
	});

	it('limits open rooms per host', async () => {
		const host = await db.createUser(false);
		await allowHost(host);
		for (let i = 0; i < 5; i++) await createRoom(host);
		expect(await failure(createRoom(host))).toMatch(/Too many open rooms/);
	});

	it('does not let clients read or write the allow-list', async () => {
		const user = await db.createUser(false);
		expect(await failure(db.as(user, 'select * from public.allowed_hosts'))).toMatch(
			/permission denied/,
		);
		expect(
			await failure(
				db.as(user, 'insert into public.allowed_hosts (user_id) values ($1)', [user.id]),
			),
		).toMatch(/permission denied/);
	});

	it('does not let a client choose the host or code of a room', async () => {
		const host = await db.createUser(false);
		await allowHost(host);
		expect(await failure(db.as(host, `insert into public.rooms (code) values ('AAAAA')`))).toMatch(
			/permission denied/,
		);
	});
});

describe('joining', () => {
	let host: TestUser;
	let room: { id: string; code: string };

	beforeEach(async () => {
		host = await db.createUser(false);
		await allowHost(host);
		room = await createRoom(host);
	});

	it('creates a pending membership, case-insensitively by code', async () => {
		const player = await db.createUser(true);
		const result = await join(player, ` ${room.code.toLowerCase()} `);
		expect(result).toEqual({ room_id: room.id, status: 'pending' });
	});

	it('auto-approves when the room allows it', async () => {
		const autoRoom = await createRoom(host, true);
		const player = await db.createUser(true);
		expect((await join(player, autoRoom.code)).status).toBe('approved');
	});

	it('is idempotent', async () => {
		const player = await db.createUser(true);
		await join(player, room.code);
		await setStatus(host, room.id, player, 'approved');
		expect((await join(player, room.code)).status).toBe('approved');
	});

	it('rejects unknown and ended rooms', async () => {
		const player = await db.createUser(true);
		expect(await failure(join(player, 'ZZZZZ'))).toMatch(/Room not found/);
		await db.as(host, `update public.rooms set status = 'ended' where id = $1`, [room.id]);
		expect(await failure(join(player, room.code))).toMatch(/Room not found/);
	});

	it('does not let players insert memberships directly', async () => {
		const player = await db.createUser(true);
		expect(
			await failure(
				db.as(
					player,
					`insert into public.room_members (room_id, user_id, status) values ($1, $2, 'approved')`,
					[room.id, player.id],
				),
			),
		).toMatch(/permission denied/);
	});

	it('does not accept the moderator role from players', async () => {
		const player = await db.createUser(true);
		expect(await failure(join(player, room.code, 'moderator'))).toMatch(/Invalid role/);
	});

	it('lets kicked players ask again but not banned ones, even after leaving', async () => {
		const kicked = await db.createUser(true);
		await join(kicked, room.code);
		await setStatus(host, room.id, kicked, 'kicked');
		expect((await join(kicked, room.code)).status).toBe('pending');

		const banned = await db.createUser(true);
		await join(banned, room.code);
		await setStatus(host, room.id, banned, 'banned');
		expect(await failure(join(banned, room.code))).toMatch(/Banned/);

		// Leaving must not erase the ban.
		const deleted = await db.as(
			banned,
			'delete from public.room_members where room_id = $1 and user_id = $2 returning *',
			[room.id, banned.id],
		);
		expect(deleted).toHaveLength(0);
		expect(await failure(join(banned, room.code))).toMatch(/Banned/);
	});

	it('caps room size', async () => {
		const bigRoom = await createRoom(host, true);
		for (let i = 0; i < 40; i++) await join(await db.createUser(true), bigRoom.code);
		expect(await failure(join(await db.createUser(true), bigRoom.code))).toMatch(/Room is full/);
	});
});

describe('visibility', () => {
	let host: TestUser;
	let room: { id: string; code: string };
	let alice: TestUser;
	let bob: TestUser;
	let pending: TestUser;
	let outsider: TestUser;

	beforeEach(async () => {
		host = await db.createUser(false);
		await allowHost(host);
		room = await createRoom(host);
		[alice, bob, pending, outsider] = await Promise.all([
			db.createUser(true),
			db.createUser(true),
			db.createUser(true),
			db.createUser(true),
		]);
		for (const [user, name] of [
			[host, 'Host'],
			[alice, 'Alice'],
			[bob, 'Bob'],
			[pending, 'Pending'],
			[outsider, 'Outsider'],
		] as const) {
			await db.as(user, 'insert into public.profiles (user_id, display_name) values ($1, $2)', [
				user.id,
				name,
			]);
		}
		for (const user of [alice, bob, pending]) await join(user, room.code);
		await setStatus(host, room.id, alice, 'approved');
		await setStatus(host, room.id, bob, 'approved');
	});

	const names = async (user: TestUser) =>
		(await db.as<{ display_name: string }>(user, 'select display_name from public.profiles'))
			.map((r) => r.display_name)
			.sort();

	it('host sees every requester, pending included', async () => {
		expect(await names(host)).toEqual(['Alice', 'Bob', 'Host', 'Pending']);
	});

	it('approved members see the host and other approved members', async () => {
		expect(await names(alice)).toEqual(['Alice', 'Bob', 'Host']);
	});

	it('pending members and outsiders see only themselves', async () => {
		expect(await names(pending)).toEqual(['Pending']);
		expect(await names(outsider)).toEqual(['Outsider']);
	});

	it('outsiders cannot see the room; members can', async () => {
		const sql = 'select id from public.rooms where id = $1';
		expect(await db.as(outsider, sql, [room.id])).toHaveLength(0);
		expect(await db.as(pending, sql, [room.id])).toHaveLength(1);
	});

	it('only the host can approve or kick', async () => {
		expect(await setStatus(alice, room.id, pending, 'approved')).toHaveLength(0);
		expect(await setStatus(host, room.id, pending, 'approved')).toHaveLength(1);
	});

	it('users cannot edit other profiles', async () => {
		const updated = await db.as(
			alice,
			`update public.profiles set display_name = 'pwned' where user_id = $1 returning *`,
			[bob.id],
		);
		expect(updated).toHaveLength(0);
	});

	it('rejects oversized or control-character names', async () => {
		const user = await db.createUser(true);
		const insert = (name: string) =>
			db.as(user, 'insert into public.profiles (user_id, display_name) values ($1, $2)', [
				user.id,
				name,
			]);
		expect(await failure(insert('x'.repeat(33)))).toMatch(/display_name_length/);
		expect(await failure(insert('bad\nname'))).toMatch(/display_name_printable/);
	});

	describe('realtime topics', () => {
		const t = (kind: string, uid?: string) =>
			`room:${room.id}:${kind}${uid === undefined ? '' : `:${uid}`}`;

		it('public: host sends, approved members receive', async () => {
			expect(await db.canSend(host, t('public'))).toBe(true);
			expect(await db.canSend(alice, t('public'))).toBe(false);
			expect(await db.canReceive(alice, t('public'))).toBe(true);
			expect(await db.canReceive(pending, t('public'))).toBe(false);
			expect(await db.canReceive(outsider, t('public'))).toBe(false);
		});

		it('to:{uid}: only the host sends and only that member receives', async () => {
			expect(await db.canSend(host, t('to', alice.id))).toBe(true);
			expect(await db.canSend(bob, t('to', alice.id))).toBe(false);
			expect(await db.canReceive(alice, t('to', alice.id))).toBe(true);
			expect(await db.canReceive(bob, t('to', alice.id))).toBe(false);
		});

		it('from:{uid}: only that member sends and only the host receives', async () => {
			expect(await db.canSend(alice, t('from', alice.id))).toBe(true);
			expect(await db.canSend(bob, t('from', alice.id))).toBe(false);
			expect(await db.canSend(pending, t('from', pending.id))).toBe(false);
			expect(await db.canReceive(host, t('from', alice.id))).toBe(true);
			expect(await db.canReceive(bob, t('from', alice.id))).toBe(false);
		});

		it('kicked members lose access', async () => {
			await setStatus(host, room.id, alice, 'kicked');
			expect(await db.canReceive(alice, t('public'))).toBe(false);
			expect(await db.canSend(alice, t('from', alice.id))).toBe(false);
		});

		it('rejects malformed and foreign topics', async () => {
			for (const topic of [
				'room',
				`room:${room.id}`,
				`room:${room.id}:public:extra`,
				`room:not-a-uuid:public`,
				`room:${room.id}:to`,
				`room:${room.id}:nope`,
				`other:${room.id}:public`,
			]) {
				expect(await db.canReceive(host, topic), topic).toBe(false);
				expect(await db.canSend(host, topic), topic).toBe(false);
			}
		});

		it('allows only broadcast, not presence', async () => {
			const topic = t('public');
			expect(
				await failure(
					db.as(
						host,
						`insert into realtime.messages (topic, extension) values ($1, 'presence')`,
						[topic],
						topic,
					),
				),
			).toMatch(/row-level security/);
		});
	});
});

describe('retention', () => {
	it('purges idle rooms and stale anonymous users, keeping active ones', async () => {
		const host = await db.createUser(false);
		await allowHost(host);
		const idle = await createRoom(host);
		const active = await createRoom(host);

		const staleIdle = await db.createUser(true);
		const staleActive = await db.createUser(true);
		const fresh = await db.createUser(true);
		await join(staleIdle, idle.code);
		await join(staleActive, active.code);

		await db.admin(
			`update public.rooms set updated_at = now() - interval '25 hours' where id = $1`,
			[idle.id],
		);
		await db.admin(
			`update auth.users set created_at = now() - interval '31 days' where id = any($1)`,
			[[staleIdle.id, staleActive.id]],
		);

		await db.admin('select private.purge_expired()');

		const rooms = await db.admin<{ id: string }>('select id from public.rooms where id = any($1)', [
			[idle.id, active.id],
		]);
		expect(rooms.map((r) => r.id)).toEqual([active.id]);

		const users = await db.admin<{ id: string }>('select id from auth.users where id = any($1)', [
			[staleIdle.id, staleActive.id, fresh.id],
		]);
		expect(users.map((u) => u.id).sort()).toEqual([staleActive.id, fresh.id].sort());
	});

	it('cannot be run by clients', async () => {
		const user = await db.createUser(false);
		expect(await failure(db.as(user, 'select private.purge_expired()'))).toMatch(
			/permission denied/,
		);
	});
});
