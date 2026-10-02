/**
 * Behavioural proof for supabase/migrations/20270523101700_fn_revoke_user_sessions.sql
 * ("Sign out of all devices", admin side — Director ruling 1 Oct 2026).
 *
 * The migration is applied VERBATIM with psql onto a throwaway database that
 * carries minimal stand-ins for auth.sessions / auth.refresh_tokens and the
 * permission helpers. Every call is made as `authenticated` (or `anon`) with
 * the caller's super-admin flag and permissions set per session, and the suite
 * reads back which sessions PostgreSQL actually removed.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270523101700_fn_revoke_user_sessions.sql');
const PGHOST = process.env.REVOKE_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.REVOKE_TEST_PGPORT ?? '5432';
const PGUSER = process.env.REVOKE_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `revoke_sessions_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const CALLER = '00000000-0000-4000-8000-0000000000a1';
const TARGET = '00000000-0000-4000-8000-0000000000b2';
const SUPER_TARGET = '00000000-0000-4000-8000-0000000000c3';
const BYSTANDER = '00000000-0000-4000-8000-0000000000d4';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Supabase's default: anon gets EXECUTE on new functions in public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
CREATE TABLE auth.refresh_tokens (id bigserial PRIMARY KEY, user_id varchar(255), session_id uuid);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.super', true), '')::boolean $$;
-- Returns NULL (not false) when the caller has no permissions at all — the
-- null-role shape that a bare NOT(...) guard would wave through.
CREATE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN coalesce(current_setting('test.perms', true), '') = '' THEN NULL
              ELSE p = ANY (string_to_array(current_setting('test.perms', true), ',')) END $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_super_admin boolean);
INSERT INTO public.profiles VALUES
  ('${CALLER}', false), ('${TARGET}', false), ('${SUPER_TARGET}', true), ('${BYSTANDER}', null);
GRANT EXECUTE ON FUNCTION public.is_super_admin(), public.user_has_permission(text) TO anon, authenticated;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

async function revokeAs(
  who: { role?: string; uid?: string | null; super?: boolean | null; perms?: string[] },
  target: string | null
) {
  await client.query('BEGIN');
  try {
    await client.query(
      `SELECT set_config('test.uid', $1, true), set_config('test.super', $2, true), set_config('test.perms', $3, true)`,
      [
        who.uid === null ? '' : who.uid ?? CALLER,
        who.super === null || who.super === undefined ? '' : String(who.super),
        (who.perms ?? []).join(','),
      ]
    );
    await client.query(`SET LOCAL ROLE ${who.role ?? 'authenticated'}`);
    const r = await client.query(`SELECT public.fn_revoke_user_sessions($1::uuid) AS n`, [target]);
    await client.query('COMMIT');
    return { n: r.rows[0]?.n as number, error: null as string | null };
  } catch (e) {
    await client.query('ROLLBACK');
    return { n: null, error: (e as Error).message };
  }
}

async function sessionsOf(user: string) {
  const s = await client.query(`SELECT count(*)::int AS n FROM auth.sessions WHERE user_id = $1`, [user]);
  const t = await client.query(`SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE user_id = $1`, [user]);
  return { sessions: s.rows[0].n as number, tokens: t.rows[0].n as number };
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e) {
    throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`);
  }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
});

afterAll(async () => {
  await client?.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]);
  } catch {
    /* best effort */
  }
});

beforeEach(async () => {
  await client.query(`TRUNCATE auth.sessions, auth.refresh_tokens`);
  for (const u of [TARGET, TARGET, SUPER_TARGET, BYSTANDER]) {
    const s = await client.query(`INSERT INTO auth.sessions (user_id) VALUES ($1) RETURNING id`, [u]);
    await client.query(`INSERT INTO auth.refresh_tokens (user_id, session_id) VALUES ($1, $2)`, [u, s.rows[0].id]);
  }
});

describe('fn_revoke_user_sessions — who may sign someone out of every device', () => {
  it('a super admin ends every session and refresh token of the person, and nobody else', async () => {
    const r = await revokeAs({ super: true }, TARGET);
    expect(r.error).toBeNull();
    expect(r.n).toBe(2);
    expect(await sessionsOf(TARGET)).toEqual({ sessions: 0, tokens: 0 });
    expect(await sessionsOf(BYSTANDER)).toEqual({ sessions: 1, tokens: 1 });
    expect(await sessionsOf(SUPER_TARGET)).toEqual({ sessions: 1, tokens: 1 });
  });

  it('a role holding users.sessions.revoke may sign out an ordinary account', async () => {
    const r = await revokeAs({ super: false, perms: ['users.sessions.revoke'] }, TARGET);
    expect(r.error).toBeNull();
    expect(await sessionsOf(TARGET)).toEqual({ sessions: 0, tokens: 0 });
  });

  it('a signed-in person WITHOUT the key cannot sign out someone else', async () => {
    const r = await revokeAs({ super: false, perms: ['users.edit', 'users.view'] }, TARGET);
    expect(r.error).toMatch(/not_allowed/);
    expect(await sessionsOf(TARGET)).toEqual({ sessions: 2, tokens: 2 });
  });

  it('a caller with NO role at all (helpers return NULL) is refused, not waved through', async () => {
    const r = await revokeAs({ super: null, perms: [] }, TARGET);
    expect(r.error).toMatch(/not_allowed/);
    expect(await sessionsOf(TARGET)).toEqual({ sessions: 2, tokens: 2 });
  });

  it('a key holder who is not a super admin cannot sign out a super admin', async () => {
    const r = await revokeAs({ super: false, perms: ['users.sessions.revoke'] }, SUPER_TARGET);
    expect(r.error).toMatch(/cannot_revoke_super_admin/);
    expect(await sessionsOf(SUPER_TARGET)).toEqual({ sessions: 1, tokens: 1 });
  });

  it('a super admin can sign out another super admin', async () => {
    const r = await revokeAs({ super: true }, SUPER_TARGET);
    expect(r.error).toBeNull();
    expect(await sessionsOf(SUPER_TARGET)).toEqual({ sessions: 0, tokens: 0 });
  });

  it('an unknown person is reported, not silently treated as success', async () => {
    const r = await revokeAs({ super: true }, '00000000-0000-4000-8000-0000000000ff');
    expect(r.error).toMatch(/user_not_found/);
  });

  it('no signed-in caller (auth.uid() is null) is refused', async () => {
    const r = await revokeAs({ uid: null, super: true }, TARGET);
    expect(r.error).toMatch(/not_authenticated/);
    expect(await sessionsOf(TARGET)).toEqual({ sessions: 2, tokens: 2 });
  });

  it('anon cannot execute the function at all, even with Supabase default grants', async () => {
    const r = await revokeAs({ role: 'anon', super: true }, TARGET);
    expect(r.error).toMatch(/permission denied/);
    expect(await sessionsOf(TARGET)).toEqual({ sessions: 2, tokens: 2 });
  });
});

// Repair round 2 Oct: the database must never report "nobody was signed in"
// when it simply could not delete. The function owner is switched to a plain
// role (the suite's own user is a superuser, who sees every row regardless).
describe('fn_revoke_user_sessions — reports failure instead of a false all-clear', () => {
  const OWNER = `revoke_owner_${DBNAME.slice(-8)}`;

  async function asPlainOwner(setup: string[], body: () => Promise<void>) {
    await client.query(`DO $$ BEGIN CREATE ROLE ${OWNER} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await client.query(`GRANT USAGE ON SCHEMA public, auth TO ${OWNER}`);
    await client.query(`GRANT SELECT ON public.profiles TO ${OWNER}`);
    await client.query(`ALTER FUNCTION public.fn_revoke_user_sessions(uuid) OWNER TO ${OWNER}`);
    try {
      for (const sql of setup) await client.query(sql);
      await body();
    } finally {
      await client.query(`ALTER FUNCTION public.fn_revoke_user_sessions(uuid) OWNER TO CURRENT_USER`);
      await client.query(`ALTER TABLE auth.sessions DISABLE ROW LEVEL SECURITY`);
      await client.query(`ALTER TABLE auth.refresh_tokens DISABLE ROW LEVEL SECURITY`);
      await client.query(`REVOKE ALL ON auth.sessions, auth.refresh_tokens FROM ${OWNER}`);
    }
  }

  it('an owner role without DELETE on the auth tables gets revoke_unavailable and nothing changes', async () => {
    await asPlainOwner([`GRANT SELECT ON auth.sessions, auth.refresh_tokens TO ${OWNER}`], async () => {
      const r = await revokeAs({ super: true }, TARGET);
      expect(r.error).toMatch(/revoke_unavailable/);
    });
    expect(await sessionsOf(TARGET)).toEqual({ sessions: 2, tokens: 2 });
  });

  it('row security that hides the rows gets revoke_unavailable, not "0 logins ended"', async () => {
    await asPlainOwner(
      [
        `GRANT SELECT, DELETE ON auth.sessions, auth.refresh_tokens TO ${OWNER}`,
        `ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY`,
      ],
      async () => {
        const r = await revokeAs({ super: true }, TARGET);
        expect(r.error).toMatch(/revoke_unavailable/);
        expect(r.n).toBeNull();
      }
    );
    expect(await sessionsOf(TARGET)).toEqual({ sessions: 2, tokens: 2 });
  });

  it('a plain owner with DELETE and no row security still works (the checks are not over-strict)', async () => {
    await asPlainOwner([`GRANT SELECT, DELETE ON auth.sessions, auth.refresh_tokens TO ${OWNER}`], async () => {
      const r = await revokeAs({ super: true }, TARGET);
      expect(r.error).toBeNull();
      expect(r.n).toBe(2);
    });
    expect(await sessionsOf(TARGET)).toEqual({ sessions: 0, tokens: 0 });
  });

  it('the migration has no apply-time RAISE (it must never fail the wave dry-run)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sql = require('fs').readFileSync(MIGRATION, 'utf8') as string;
    expect(sql).not.toMatch(/^DO\s+\$\$/m);
  });
});
