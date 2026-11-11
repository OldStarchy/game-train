import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const supabaseDir = join(import.meta.dirname, '..');

export interface TestUser {
	id: string;
	anonymous: boolean;
}

/**
 * An embedded Postgres with the Supabase shim and every migration applied.
 * Queries run either as the superuser (`admin`) or as an API user (`as`), with
 * the user's JWT claims set the way PostgREST/Realtime set them.
 */
export class TestDb {
	private constructor(private readonly pg: PGlite) {}

	static async create(): Promise<TestDb> {
		const pg = new PGlite();
		await pg.exec(await readFile(join(supabaseDir, 'tests', 'supabase-shim.sql'), 'utf8'));
		const migrationsDir = join(supabaseDir, 'migrations');
		const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
		for (const file of files) {
			await pg.exec(await readFile(join(migrationsDir, file), 'utf8'));
		}
		return new TestDb(pg);
	}

	async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
		return (await this.pg.query<T>(sql, params)).rows;
	}

	async createUser(anonymous: boolean): Promise<TestUser> {
		const [row] = await this.admin<{ id: string }>(
			'insert into auth.users (is_anonymous) values ($1) returning id',
			[anonymous],
		);
		if (!row) throw new Error('user insert failed');
		return { id: row.id, anonymous };
	}

	/** Run one statement as an authenticated API user, optionally joining a realtime topic. */
	async as<T = Record<string, unknown>>(
		user: TestUser,
		sql: string,
		params: unknown[] = [],
		topic?: string,
	): Promise<T[]> {
		return this.pg.transaction(async (tx) => {
			const claims = JSON.stringify({
				sub: user.id,
				role: 'authenticated',
				is_anonymous: user.anonymous,
			});
			await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
			await tx.query(`select set_config('realtime.topic', $1, true)`, [topic ?? '']);
			await tx.exec('set local role authenticated');
			return (await tx.query<T>(sql, params)).rows;
		});
	}

	/** Whether `user` may receive broadcasts on `topic` (the realtime select policy). */
	async canReceive(user: TestUser, topic: string): Promise<boolean> {
		await this.admin(
			`insert into realtime.messages (topic, extension, payload) values ($1, 'broadcast', '{}')`,
			[topic],
		);
		const rows = await this.as(
			user,
			'select 1 from realtime.messages where topic = $1',
			[topic],
			topic,
		);
		await this.admin('delete from realtime.messages where topic = $1', [topic]);
		return rows.length > 0;
	}

	/** Whether `user` may send broadcasts on `topic` (the realtime insert policy). */
	async canSend(user: TestUser, topic: string): Promise<boolean> {
		try {
			await this.as(
				user,
				`insert into realtime.messages (topic, extension, payload) values ($1, 'broadcast', '{}')`,
				[topic],
				topic,
			);
			return true;
		} catch (e) {
			if (e instanceof Error && /row-level security/.test(e.message)) return false;
			throw e;
		}
	}

	async close(): Promise<void> {
		await this.pg.close();
	}
}
