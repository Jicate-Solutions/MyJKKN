/**
 * supabase/migrations/20271009131500_meetings_inbox_type_counts.sql, applied
 * VERBATIM to a throwaway PostgreSQL, called as real signed-in callers
 * (SET ROLE authenticated + request.jwt.claim.sub, as PostgREST does), with
 * meeting_bookings / meeting_types RLS exactly as 20260611190000 declares it.
 *
 * Proves:
 *   a host counts only their own bookings; an admin counts everyone's;
 *   the status and time filters match the page's tabs;
 *   a type whose row the caller cannot read comes back with no title;
 *   anon cannot run it.
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
const MIGRATION = readFileSync(
  path.join(REPO, 'supabase/migrations/20271009131500_meetings_inbox_type_counts.sql'),
  'utf8'
);
const PGHOST = process.env.AI_DOOR_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.AI_DOOR_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.AI_DOOR_TEST_PGUSER ?? (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.AI_DOOR_TEST_PGPASSWORD;
const DBNAME = `inbox_counts_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const HOST_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const HOST_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const ADMIN = 'cccccccc-0000-4000-8000-000000000003';
const T_A = 'aaaaaaaa-1111-4111-8111-000000000001'; // HOST_A's type
const T_B = 'bbbbbbbb-1111-4111-8111-000000000002'; // HOST_B's type

const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT false $f$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
  AS $f$ SELECT auth.uid() = '${ADMIN}'::uuid $f$;
CREATE TABLE public.meeting_types (id uuid PRIMARY KEY, host_profile_id uuid, title text);
CREATE TABLE public.meeting_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id uuid, meeting_type_id uuid REFERENCES public.meeting_types(id),
  status text NOT NULL, start_time timestamptz NOT NULL
);
ALTER TABLE public.meeting_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_bookings ENABLE ROW LEVEL SECURITY;
-- as 20260611190000_native_scheduling_engine.sql
CREATE POLICY "mt_host_all" ON public.meeting_types FOR ALL
  USING (is_super_admin() OR is_admin() OR host_profile_id = auth.uid())
  WITH CHECK (is_super_admin() OR is_admin() OR host_profile_id = auth.uid());
CREATE POLICY "mb_host_select" ON public.meeting_bookings FOR SELECT
  USING (is_super_admin() OR is_admin() OR host_profile_id = auth.uid());
GRANT SELECT ON public.meeting_types, public.meeting_bookings TO authenticated;
INSERT INTO public.meeting_types VALUES ('${T_A}', '${HOST_A}', 'Interview'), ('${T_B}', '${HOST_B}', 'Review');
INSERT INTO public.meeting_bookings (host_profile_id, meeting_type_id, status, start_time) VALUES
  ('${HOST_A}', '${T_A}', 'confirmed', now() + interval '1 day'),
  ('${HOST_A}', '${T_A}', 'confirmed', now() + interval '2 days'),
  ('${HOST_A}', NULL,     'confirmed', now() + interval '3 days'),
  ('${HOST_A}', '${T_A}', 'cancelled', now() - interval '1 day'),
  ('${HOST_A}', '${T_A}', 'completed', now() - interval '2 days'),
  ('${HOST_B}', '${T_B}', 'confirmed', now() + interval '1 day'),
  -- a booking on HOST_A's calendar of HOST_B's type: A sees the booking, not the type
  ('${HOST_A}', '${T_B}', 'confirmed', now() + interval '4 days');
`;

let admin: Client;
let db: Client;
let adminConnected = false;
let dbConnected = false;

async function as(uid: string | null, sql: string, params: unknown[] = []) {
  await db.query('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.query(uid === null ? 'SET ROLE anon' : 'SET ROLE authenticated');
  try {
    return { rows: (await db.query(sql, params)).rows as any[], error: undefined as string | undefined };
  } catch (e) {
    return { rows: [] as any[], error: (e as Error).message };
  } finally {
    await db.query('RESET ROLE');
  }
}
const counts = (uid: string | null, statuses: string[] | null, from: string | null, before: string | null) =>
  as(
    uid,
    `SELECT meeting_type_id, title, bookings::int AS n FROM public.fn_meeting_inbox_type_counts($1, $2, $3)
      ORDER BY meeting_type_id::text COLLATE "C" NULLS LAST`,
    [statuses, from, before]
  );

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
  await db.query(MIGRATION);
}, 60_000);

afterAll(async () => {
  if (dbConnected) await db.end();
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME}`);
    await admin.end();
  }
});

describe('fn_meeting_inbox_type_counts', () => {
  const now = () => new Date().toISOString();

  it('a host counts only their own bookings (Upcoming tab)', async () => {
    const r = await counts(HOST_A, ['confirmed'], now(), null);
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([
      { meeting_type_id: T_A, title: 'Interview', n: 2 },
      // the booking is A's, the type is B's: counted, but its name is not readable
      { meeting_type_id: T_B, title: null, n: 1 },
      { meeting_type_id: null, title: null, n: 1 },
    ]);
  });

  it("another host sees none of the first host's bookings", async () => {
    const r = await counts(HOST_B, null, null, null);
    expect(r.rows).toEqual([{ meeting_type_id: T_B, title: 'Review', n: 1 }]);
  });

  it("an admin counts everyone's, with names", async () => {
    const r = await counts(ADMIN, ['confirmed'], now(), null);
    expect(r.rows).toEqual([
      { meeting_type_id: T_A, title: 'Interview', n: 2 },
      { meeting_type_id: T_B, title: 'Review', n: 2 },
      { meeting_type_id: null, title: null, n: 1 },
    ]);
  });

  it('the Past and Cancelled filters match the page tabs', async () => {
    const past = await counts(HOST_A, ['confirmed', 'completed', 'no_show'], null, now());
    expect(past.rows).toEqual([{ meeting_type_id: T_A, title: 'Interview', n: 1 }]);
    const cancelled = await counts(HOST_A, ['cancelled'], null, null);
    expect(cancelled.rows).toEqual([{ meeting_type_id: T_A, title: 'Interview', n: 1 }]);
  });

  it('runs as the caller, not as its owner', async () => {
    const r = await db.query(
      `SELECT prosecdef FROM pg_proc WHERE proname = 'fn_meeting_inbox_type_counts'`
    );
    expect(r.rows[0].prosecdef).toBe(false);
  });

  it('anon cannot run it', async () => {
    const r = await counts(null, null, null, null);
    expect(r.error).toMatch(/permission denied/);
  });

  it('applies twice', async () => {
    await expect(db.query(MIGRATION)).resolves.toBeDefined();
  });
});
