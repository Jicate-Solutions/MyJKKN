/**
 * supabase/migrations/20271008150000_personal_key_meeting_booking.sql and its
 * follow-up 20271008160000_personal_key_booking_reservations.sql, applied
 * VERBATIM (after 20270301090000, which creates personal keys) to a throwaway
 * PostgreSQL and exercised as real signed-in callers (SET ROLE authenticated +
 * request.jwt.claim.sub, the way PostgREST does it).
 *
 * Proves what the door relies on before it offers schedule_meeting:
 *   - only the key's OWNER can switch booking on, and only for a working
 *     personal key — never another person's key, an administrator key, or a
 *     turned-off key;
 *   - switching on needs meetings.view (or super admin);
 *   - switching off always works (even after meetings.view is taken away) and
 *     leaves the row the door reads with active = false;
 *   - nobody signed in reads the grants table directly, and anon runs neither
 *     function;
 *   - at most ONE key per person can book (switching on another key switches
 *     the first off; a partial unique index refuses two active grants), and a
 *     turned-off key is not listed as booking;
 *   - booking reservations: service role only; a call past a limit is refused;
 *     a released slot stops counting; two calls at the same instant cannot
 *     both take the last slot (per-owner advisory lock);
 *   - the file applies twice.
 *
 * REQUIRES a PostgreSQL (CI's postgres:16 service; locally
 * `brew services start postgresql@16`). Fails loudly rather than skipping.
 * Override with AI_DOOR_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const BASE = path.join(REPO, 'supabase/migrations/20270301090000_ai_tool_catalog.sql');
const MIGRATION = path.join(REPO, 'supabase/migrations/20271008150000_personal_key_meeting_booking.sql');
const RESERVATIONS = path.join(REPO, 'supabase/migrations/20271008160000_personal_key_booking_reservations.sql');
const DROP_STMT_TIMEOUT = path.join(REPO, 'supabase/migrations/20271008170000_booking_reserve_drop_statement_timeout.sql');

const PGHOST = process.env.AI_DOOR_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.AI_DOOR_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.AI_DOOR_TEST_PGUSER ?? (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.AI_DOOR_TEST_PGPASSWORD;
const DBNAME = `ai_book_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const A = 'aaaaaaaa-0000-4000-8000-000000000001'; // ai_query.view + meetings.view
const B = 'bbbbbbbb-0000-4000-8000-000000000002'; // ai_query.view only
const S = 'cccccccc-0000-4000-8000-000000000003'; // super admin, no permission rows

const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Supabase grants EXECUTE on new functions to anon by default; reproduced so the
-- migration's REVOKE has something real to revoke.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
GRANT USAGE ON SCHEMA auth, extensions, public TO anon, authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
-- is_active / is_login_disabled as on production (repair round 4 reads both)
CREATE TABLE public.profiles (id uuid PRIMARY KEY, institution_id uuid, is_super_admin boolean DEFAULT false,
  is_active boolean DEFAULT true, is_login_disabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.test_perms (user_id uuid, key text);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $f$ SELECT COALESCE((SELECT is_super_admin FROM profiles WHERE id = auth.uid()), false) $f$;
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $f$ SELECT EXISTS (SELECT 1 FROM test_perms WHERE user_id = auth.uid() AND key = permission_name) $f$;
-- api_keys as supabase/setup/01_tables.sql + 20260306_mcp_user_bound_api_keys + institution_id
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key_value VARCHAR(255) NOT NULL,
  created_by UUID,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{"read": true, "write": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  institution_id uuid,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT CHECK (user_role IN ('student', 'faculty', 'admin', 'super_admin')),
  department_id UUID
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
INSERT INTO public.api_keys (name, key_value) VALUES ('legacy admin key', 'legacy-hash');
INSERT INTO auth.users VALUES ('${A}'), ('${B}'), ('${S}');
INSERT INTO public.profiles VALUES ('${A}', 'dddddddd-0000-4000-8000-000000000004', false), ('${B}', NULL, false), ('${S}', NULL, true);
INSERT INTO public.test_perms VALUES ('${A}', 'ai_query.view'), ('${A}', 'meetings.view'), ('${B}', 'ai_query.view');
`;

let admin: Client;
let db: Client;
let adminConnected = false;
let dbConnected = false;
const baseSql = readFileSync(BASE, 'utf8');
const migrationSql = readFileSync(MIGRATION, 'utf8');
const reservationsSql = readFileSync(RESERVATIONS, 'utf8');
const dropStmtTimeoutSql = readFileSync(DROP_STMT_TIMEOUT, 'utf8');

/** Stand-ins for the seeded functions — the migration asserts every target exists. */
function stubsFor(sql: string): string {
  const targets = [...new Set([...sql.matchAll(/'rpc', '(ai_rpc_[a-z0-9_]+)'/g)].map((m) => m[1]))];
  return targets
    .map((t) => `CREATE FUNCTION public.${t}() RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$;`)
    .join('\n');
}

async function as<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  await db.query('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.query(uid === null ? 'SET ROLE anon' : 'SET ROLE authenticated');
  try {
    const r = await db.query(sql, params);
    return { rows: r.rows as T[] };
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  } finally {
    await db.query('RESET ROLE');
  }
}


async function makeKey(uid: string, name: string): Promise<string> {
  const r = await as(uid, `SELECT public.fn_ai_personal_key_create($1, 30) AS k`, [name]);
  if (r.error) throw new Error(r.error);
  return r.rows[0].k.id as string;
}
const setBooking = (uid: string | null, keyId: string, allow: boolean) =>
  as(uid, `SELECT public.fn_ai_personal_key_set_booking($1, $2) AS r`, [keyId, allow]);
const bookingIds = async (uid: string): Promise<string[]> => {
  const r = await as(uid, `SELECT public.fn_ai_personal_key_booking_ids() AS ids`);
  if (r.error) throw new Error(r.error);
  return r.rows[0].ids as string[];
};
/** Exactly what lib/mcp/personal-door.ts keyMayBook reads (with the service role). */
const doorReads = async (keyId: string): Promise<boolean> => {
  await db.query('RESET ROLE');
  const r = await db.query(`SELECT active FROM public.ai_personal_key_booking_grants WHERE key_id = $1`, [keyId]);
  return r.rows[0]?.active === true;
};

let keyA: string;
let keyA2: string;
let keyB: string;
let keyS: string;
let adminKey: string;

beforeAll(async () => {
  admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: 'postgres' });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(
      `Cannot reach PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}. This suite proves the migration against a ` +
        `real engine and fails rather than skipping. Start one with: brew services start postgresql@16\n${e}`
    );
  }
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  dbConnected = true;
  await db.query(SCHEMA);
  await db.query(stubsFor(baseSql));
  await db.query(baseSql);
  // 20271008160000 must refuse to run before 20271008150000
  await expect(db.query(reservationsSql)).rejects.toThrow(/needs 20271008150000/);
  await db.query(migrationSql);
  await db.query(reservationsSql);
  await db.query(dropStmtTimeoutSql);
  keyA = await makeKey(A, 'A front desk');
  keyA2 = await makeKey(A, 'A laptop');
  keyB = await makeKey(B, 'B key');
  keyS = await makeKey(S, 'S key');
  adminKey = (await db.query(`SELECT id FROM public.api_keys WHERE name = 'legacy admin key'`)).rows[0].id;
}, 60_000);

afterAll(async () => {
  if (dbConnected) await db.end();
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME}`);
    await admin.end();
  }
});

describe('migration', () => {
  const setBookingLocked = async () => {
    await db.query('RESET ROLE');
    const r = await db.query(
      `SELECT position('pg_advisory_xact_lock' IN pg_get_functiondef('public.fn_ai_personal_key_set_booking(uuid, boolean)'::regprocedure)) > 0 AS locked`
    );
    return r.rows[0].locked as boolean;
  };

  it('in version order (150000 then 160000) the final switch function takes the lock', async () => {
    // beforeAll applied 150000 then 160000; re-run both in the same order
    await db.query(migrationSql);
    await db.query(reservationsSql);
    expect(await setBookingLocked()).toBe(true);
    const r = await db.query(
      `SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('fn_ai_booking_reserve', 'fn_ai_booking_release')`
    );
    expect(r.rows[0].n).toBe(2);
  });

  it('if 150000 is re-run last the lock is lost, safety still holds, and re-running 160000 restores it', async () => {
    await db.query(reservationsSql);
    await db.query(migrationSql); // 150000 applied LAST
    expect(await setBookingLocked()).toBe(false);
    // the one-active-grant-per-owner index still refuses a second active key
    const idx = await db.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_ai_personal_key_booking_one_per_owner'`
    );
    expect(idx.rows[0].indexdef).toMatch(/UNIQUE INDEX .* \(owner_id\) WHERE active/);
    await db.query(reservationsSql);
    expect(await setBookingLocked()).toBe(true);
  });
});

describe('who can touch it', () => {
  it('anon runs neither function', async () => {
    expect((await setBooking(null, keyA, true)).error).toMatch(/permission denied/);
    expect((await as(null, `SELECT public.fn_ai_personal_key_booking_ids()`)).error).toMatch(/permission denied/);
  });

  it('a signed-in person cannot read or write the grants table directly', async () => {
    expect((await as(A, `SELECT count(*) FROM public.ai_personal_key_booking_grants`)).error).toMatch(/permission denied/);
    expect(
      (await as(A, `INSERT INTO public.ai_personal_key_booking_grants (key_id, owner_id) VALUES ($1, $2)`, [keyB, A])).error
    ).toMatch(/permission denied/);
  });
});

describe('switching booking on', () => {
  it('the owner with meetings.view can, and the door then sees it', async () => {
    const r = await setBooking(A, keyA, true);
    expect(r.error).toBeUndefined();
    expect(r.rows[0].r).toEqual({ id: keyA, can_book_meetings: true });
    expect(await bookingIds(A)).toEqual([keyA]);
    expect(await doorReads(keyA)).toBe(true);
    // only that key, not the owner's other key
    expect(await doorReads(keyA2)).toBe(false);
  });

  it("nobody can switch it on for another person's key", async () => {
    expect((await setBooking(A, keyB, true)).error).toMatch(/Key not found/);
    expect((await setBooking(B, keyA2, true)).error).toMatch(/Key not found/);
    expect(await doorReads(keyB)).toBe(false);
    expect(await doorReads(keyA2)).toBe(false);
    expect(await bookingIds(B)).toEqual([]);
  });

  it('an administrator key can never be switched on', async () => {
    expect((await setBooking(A, adminKey, true)).error).toMatch(/Key not found/);
    expect((await setBooking(S, adminKey, true)).error).toMatch(/Key not found/);
    expect(await doorReads(adminKey)).toBe(false);
  });

  it('an owner without meetings.view is refused', async () => {
    expect((await setBooking(B, keyB, true)).error).toMatch(/access to Meetings/);
    expect(await doorReads(keyB)).toBe(false);
  });

  it('a super admin owner may, without the permission row', async () => {
    expect((await setBooking(S, keyS, true)).error).toBeUndefined();
    expect(await doorReads(keyS)).toBe(true);
  });

  it('a turned-off key cannot be switched on', async () => {
    const r = await as(A, `SELECT public.fn_ai_personal_key_revoke($1)`, [keyA2]);
    expect(r.error).toBeUndefined();
    expect((await setBooking(A, keyA2, true)).error).toMatch(/Key not found/);
    expect(await doorReads(keyA2)).toBe(false);
  });
});

describe('one booking key per person', () => {
  it('switching on a second key switches the first one off', async () => {
    expect(await doorReads(keyA)).toBe(true);
    const keyA3 = await makeKey(A, 'A second');
    expect((await setBooking(A, keyA3, true)).error).toBeUndefined();
    expect(await doorReads(keyA3)).toBe(true);
    expect(await doorReads(keyA)).toBe(false);
    expect(await bookingIds(A)).toEqual([keyA3]);
    // the index refuses two active grants for one person, whoever writes them
    await db.query('RESET ROLE');
    await expect(
      db.query(`UPDATE public.ai_personal_key_booking_grants SET active = true WHERE key_id = $1`, [keyA])
    ).rejects.toThrow(/uq_ai_personal_key_booking_one_per_owner/);
    // back to keyA for the tests below
    expect((await setBooking(A, keyA3, false)).error).toBeUndefined();
    expect((await setBooking(A, keyA, true)).error).toBeUndefined();
    expect(await bookingIds(A)).toEqual([keyA]);
  });

  it('a turned-off key is not listed as booking', async () => {
    const keyA4 = await makeKey(A, 'A third');
    expect((await setBooking(A, keyA4, true)).error).toBeUndefined();
    expect(await bookingIds(A)).toEqual([keyA4]);
    expect((await as(A, `SELECT public.fn_ai_personal_key_revoke($1)`, [keyA4])).error).toBeUndefined();
    expect(await bookingIds(A)).toEqual([]);
    expect((await setBooking(A, keyA, true)).error).toBeUndefined();
    expect(await bookingIds(A)).toEqual([keyA]);
  });
});

describe('switching booking off', () => {
  it('removes access at once: the door reads it as off', async () => {
    expect((await setBooking(A, keyA, false)).error).toBeUndefined();
    expect(await bookingIds(A)).toEqual([]);
    expect(await doorReads(keyA)).toBe(false);
  });

  it('works even after the owner loses meetings.view, and turning it back on then fails', async () => {
    expect((await setBooking(A, keyA, true)).error).toBeUndefined();
    await db.query('RESET ROLE');
    await db.query(`DELETE FROM public.test_perms WHERE user_id = $1 AND key = 'meetings.view'`, [A]);
    expect((await setBooking(A, keyA, false)).error).toBeUndefined();
    expect(await doorReads(keyA)).toBe(false);
    expect((await setBooking(A, keyA, true)).error).toMatch(/access to Meetings/);
    expect(await doorReads(keyA)).toBe(false);
  });

  it("a stranger cannot switch someone else's booking off either", async () => {
    expect(await doorReads(keyS)).toBe(true);
    expect((await setBooking(A, keyS, false)).error).toMatch(/Key not found/);
    expect(await doorReads(keyS)).toBe(true);
  });
});

describe('booking reservations (atomic limits)', () => {
  const reserve = (key: string, owner: string, invitees: number, perHour: number, perDay = 60, perDayInvitees = 150) =>
    `SELECT public.fn_ai_booking_reserve('${key}', '${owner}', ${invitees}, ${perHour}, ${perDay}, ${perDayInvitees}) AS r`;
  async function asService<T = any>(sql: string, client: Client = db): Promise<T[]> {
    await client.query('RESET ROLE');
    await client.query('SET ROLE service_role');
    try {
      return (await client.query(sql)).rows as T[];
    } finally {
      await client.query('RESET ROLE');
    }
  }

  it('only the service role may reserve or release; nobody signed in reads the table', async () => {
    expect((await as(A, reserve(keyS, S, 1, 20))).error).toMatch(/permission denied/);
    expect((await as(null, reserve(keyS, S, 1, 20))).error).toMatch(/permission denied/);
    expect((await as(A, `SELECT public.fn_ai_booking_release(gen_random_uuid())`)).error).toMatch(/permission denied/);
    expect((await as(A, `SELECT count(*) FROM public.ai_booking_reservations`)).error).toMatch(/permission denied/);
  });

  it('refuses past the per-hour limit, and a released slot no longer counts', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [{ r }] = await asService(reserve(keyS, S, 1, 3));
      expect(r.ok).toBe(true);
      ids.push(r.id);
    }
    const [{ r: refused }] = await asService(reserve(keyS, S, 1, 3));
    expect(refused).toEqual({ ok: false, reason: 'per_hour', limit: 3 });
    const [{ ok }] = await asService(`SELECT public.fn_ai_booking_release('${ids[0]}') AS ok`);
    expect(ok).toBe(true);
    const [{ r: again }] = await asService(reserve(keyS, S, 1, 3));
    expect(again.ok).toBe(true);
    // releasing twice changes nothing
    const [{ ok: twice }] = await asService(`SELECT public.fn_ai_booking_release('${ids[0]}') AS ok`);
    expect(twice).toBe(false);
  });

  it('refuses a missing limit instead of treating it as unlimited', async () => {
    await db.query('RESET ROLE');
    await db.query('SET ROLE service_role');
    try {
      await expect(
        db.query(`SELECT public.fn_ai_booking_reserve('${keyS}', '${S}', 1, NULL, 60, 150)`)
      ).rejects.toThrow(/every limit must be a positive number/);
      await expect(
        db.query(`SELECT public.fn_ai_booking_reserve('${keyS}', '${S}', 1, 20, 60, 0)`)
      ).rejects.toThrow(/every limit must be a positive number/);
    } finally {
      await db.query('RESET ROLE');
    }
  });

  it('only a key with booking switched on, for its own owner, may reserve', async () => {
    // keyB never had booking switched on
    const [{ r: noGrant }] = await asService(reserve(keyB, B, 1, 20));
    expect(noGrant).toEqual({ ok: false, reason: 'not_allowed' });
    // keyS is allowed, but not when named for a different owner
    const [{ r: wrongOwner }] = await asService(reserve(keyS, A, 1, 20));
    expect(wrongOwner).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('caps attempts per key per hour, released ones included', async () => {
    // keyS: 3 live + 1 released reservations so far; a per-hour limit of 1 caps attempts at 3
    const [{ r }] = await asService(reserve(keyS, S, 1, 1));
    expect(r).toEqual({ ok: false, reason: 'attempts', limit: 3 });
  });

  it('deleting a key keeps its reservations counted for the owner', async () => {
    await db.query('RESET ROLE');
    const before = (await db.query(`SELECT count(*)::int AS n FROM public.ai_booking_reservations WHERE owner_id = $1`, [S])).rows[0].n;
    const tmp = (await db.query(
      `INSERT INTO public.api_keys (name, key_value) VALUES ('tmp admin key', 'tmp-hash') RETURNING id`
    )).rows[0].id;
    await db.query(`INSERT INTO public.ai_booking_reservations (key_id, owner_id, invitees) VALUES ($1, $2, 1)`, [tmp, S]);
    await db.query(`DELETE FROM public.api_keys WHERE id = $1`, [tmp]);
    const after = await db.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE key_id IS NULL)::int AS orphaned FROM public.ai_booking_reservations WHERE owner_id = $1`,
      [S]
    );
    expect(after.rows[0].n).toBe(before + 1);
    expect(after.rows[0].orphaned).toBe(1);
    // put the count back so the invitee-limit test below sees the same total
    await db.query(`UPDATE public.ai_booking_reservations SET released = true WHERE key_id IS NULL AND owner_id = $1`, [S]);
  });

  it('the reserve function keeps its lock time limit and no longer claims a statement limit (20271008170000)', async () => {
    await db.query('RESET ROLE');
    // re-applying 160000 puts the setting back; 170000 removes it again, and is re-runnable
    await db.query(reservationsSql);
    await db.query(dropStmtTimeoutSql);
    await db.query(dropStmtTimeoutSql);
    const r = await db.query(`SELECT proconfig FROM pg_proc WHERE proname = 'fn_ai_booking_reserve'`);
    expect(r.rows[0].proconfig).toEqual(expect.arrayContaining(['lock_timeout=5s']));
    expect(r.rows[0].proconfig).not.toEqual(expect.arrayContaining(['statement_timeout=10s']));
  });

  it('lock_timeout really bounds the wait for the owner lock', async () => {
    const holder = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtext('ai_booking_grant:' || $1::text))`, [S]);
      const t0 = Date.now();
      await db.query('RESET ROLE');
      await db.query('SET ROLE service_role');
      await expect(db.query(reserve(keyS, S, 1, 100))).rejects.toThrow(/lock timeout/);
      expect(Date.now() - t0).toBeLessThan(8000);
    } finally {
      await db.query('RESET ROLE').catch(() => {});
      await holder.query('ROLLBACK').catch(() => {});
      await holder.end();
    }
  }, 20_000);

  it('refuses past the per-day invitee limit for the owner', async () => {
    const [{ r }] = await asService(reserve(keyS, S, 148, 100, 100, 150)); // 3 already live + 148 > 150
    expect(r).toEqual({ ok: false, reason: 'invitees_per_day', limit: 150 });
  });

  it('two calls at the same instant cannot both take the last slot', async () => {
    const other = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
    await other.connect();
    try {
      // keyS has 3 live reservations from the test above: the limit 4 leaves exactly one slot.
      await db.query('BEGIN');
      await db.query('SET LOCAL ROLE service_role');
      const first = (await db.query(reserve(keyS, S, 1, 4))).rows[0].r;
      expect(first.ok).toBe(true);
      // the second call blocks on the owner's lock until the first commits
      const secondP = (async () => {
        await other.query('BEGIN');
        await other.query('SET LOCAL ROLE service_role');
        const r = (await other.query(reserve(keyS, S, 1, 4))).rows[0].r;
        await other.query('COMMIT');
        return r;
      })();
      await new Promise((res) => setTimeout(res, 300));
      await db.query('COMMIT');
      const second = await secondP;
      expect(second).toEqual({ ok: false, reason: 'per_hour', limit: 4 });
    } finally {
      // a failed assertion above must not leave either session inside BEGIN
      await db.query('ROLLBACK').catch(() => {});
      await other.query('ROLLBACK').catch(() => {});
      await db.query('RESET ROLE').catch(() => {});
      await other.end();
    }
  });
});
