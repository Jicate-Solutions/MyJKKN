/**
 * Behavioural proof for the two review repairs on PR #3893 (2026-09-24):
 *
 *   supabase/migrations/20270211100000_cdc_drive_move_creates_a_learner_clash.sql
 *     — each learner is told only about the drive THEY clash with, never a list
 *       built from every clashing learner together.
 *   supabase/migrations/20270211100100_cdc_reopened_response_tells_the_learner.sql
 *     — a reopening notifies once (a repeat is silent), ignores a reopen marker
 *       the learner's own client wrote, and says nothing for a cancelled drive.
 *
 * The migrations are applied VERBATIM (on top of 20260912200000, whose trigger
 * calls the clash emitter) to a throwaway PostgreSQL. Each test performs the
 * UPDATE the app performs and reads back what PostgreSQL actually wrote.
 *
 * RUNNING IT
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/cdc/drive-clash-and-reopen-notifications.test.ts
 *
 * Override the server with CDCNOTIFY_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 * Deliberately loud rather than skipped when no server is reachable.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATIONS = [
  'supabase/migrations/20260912200000_cdc_drive_details_change_notifications.sql',
  'supabase/migrations/20270211100000_cdc_drive_move_creates_a_learner_clash.sql',
  'supabase/migrations/20270211100100_cdc_reopened_response_tells_the_learner.sql',
].map((m) => path.join(REPO, m));

const PGHOST = process.env.CDCNOTIFY_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.CDCNOTIFY_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.CDCNOTIFY_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const PGPASSWORD = process.env.CDCNOTIFY_TEST_PGPASSWORD;

const DBNAME = `cdc_clash_reopen_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const COORDINATOR = '00000000-0000-4000-8000-0000000000c1';
const FORGED_ACTOR = '00000000-0000-4000-8000-0000000000e9';
// The drive that moves, and two OTHER drives already on the target day.
const MOVING = '00000000-0000-4000-8000-0000000000d1';
const X = '00000000-0000-4000-8000-0000000000d2';
const Y = '00000000-0000-4000-8000-0000000000d3';
const TARGET_DAY = '2026-10-08';

const L = {
  a: '00000000-0000-4000-8000-000000000001', // yes to MOVING + X
  b: '00000000-0000-4000-8000-000000000002', // yes to MOVING + Y
  c: '00000000-0000-4000-8000-000000000003', // yes to MOVING only
  d: '00000000-0000-4000-8000-000000000004', // yes to MOVING + X (shares A's set)
  r: '00000000-0000-4000-8000-000000000005', // declined MOVING — the one CDC reopens
} as const;
const P = {
  a: '00000000-0000-4000-8000-0000000000f1',
  b: '00000000-0000-4000-8000-0000000000f2',
  c: '00000000-0000-4000-8000-0000000000f3',
  d: '00000000-0000-4000-8000-0000000000f4',
  r: '00000000-0000-4000-8000-0000000000f5',
} as const;
const REOPEN_ROW = '00000000-0000-4000-8000-0000000000a5';

const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

CREATE TYPE public.cdc_drive_status AS ENUM (
  'draft','announced','willingness_open','eligibility_locked',
  'attendance_day','results_announced','closed','cancelled');

CREATE TYPE public.cdc_willingness_status AS ENUM (
  'willing','confirmed','withdrawn','no_show');

CREATE TABLE public.cdc_drives (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  status           public.cdc_drive_status NOT NULL DEFAULT 'draft',
  drive_date       date,
  drive_start_time time,
  drive_end_time   time,
  venue_label      text,
  location_url     text,
  drive_mode       text NOT NULL DEFAULT 'on_campus',
  created_by       uuid NOT NULL,
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.cdc_drive_willingness (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id          uuid NOT NULL,
  learner_id        uuid NOT NULL,
  status            public.cdc_willingness_status NOT NULL DEFAULT 'willing',
  willingness_audit jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY,
  learner_id uuid);

CREATE TABLE public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  body            text NOT NULL,
  url             text,
  created_by      uuid NOT NULL,
  targeting       jsonb NOT NULL,
  priority        text DEFAULT 'normal',
  category        text DEFAULT 'general',
  kind            text NOT NULL DEFAULT 'announcement',
  metadata        jsonb DEFAULT '{}'::jsonb,
  expires_at      timestamptz,
  idempotency_key text,
  created_at      timestamptz NOT NULL DEFAULT now());

CREATE UNIQUE INDEX notifications_idempotency_key_uq
  ON public.notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- The learner's client (authenticated) and the CDC route (service_role) can both
-- UPDATE a willingness row, as on production.
GRANT SELECT, UPDATE ON public.cdc_drive_willingness TO authenticated, service_role;
`;

const FIXTURE = `
TRUNCATE public.notifications, public.cdc_drive_willingness,
         public.cdc_drives, public.profiles;

INSERT INTO public.profiles (id, learner_id) VALUES
  ('${P.a}', '${L.a}'), ('${P.b}', '${L.b}'), ('${P.c}', '${L.c}'),
  ('${P.d}', '${L.d}'), ('${P.r}', '${L.r}');

INSERT INTO public.cdc_drives
  (id, title, status, drive_date, drive_start_time, venue_label, created_by, updated_by, updated_at)
VALUES
  ('${MOVING}', 'Foxconn India', 'willingness_open', '2026-10-01', '09:00', 'Main Auditorium',
   '${COORDINATOR}', '${COORDINATOR}', '2026-09-12T10:00:00Z'),
  ('${X}', 'INDO-MIM', 'willingness_open', '${TARGET_DAY}', '10:00', 'Hall X',
   '${COORDINATOR}', '${COORDINATOR}', '2026-09-12T10:00:00Z'),
  ('${Y}', 'Ashok Leyland', 'willingness_open', '${TARGET_DAY}', '14:00', 'Hall Y',
   '${COORDINATOR}', '${COORDINATOR}', '2026-09-12T10:00:00Z');

INSERT INTO public.cdc_drive_willingness (id, drive_id, learner_id, status, willingness_audit) VALUES
  (gen_random_uuid(), '${MOVING}', '${L.a}', 'willing',  '[]'),
  (gen_random_uuid(), '${MOVING}', '${L.b}', 'willing',  '[]'),
  (gen_random_uuid(), '${MOVING}', '${L.c}', 'willing',  '[]'),
  (gen_random_uuid(), '${MOVING}', '${L.d}', 'willing',  '[]'),
  ('${REOPEN_ROW}',   '${MOVING}', '${L.r}', 'withdrawn', '[{"via":"learner-ui"}]'),
  (gen_random_uuid(), '${X}',      '${L.a}', 'willing',  '[]'),
  (gen_random_uuid(), '${X}',      '${L.d}', 'confirmed','[]'),
  (gen_random_uuid(), '${Y}',      '${L.b}', 'willing',  '[]');
`;

let admin: Client;
let db: Client;
let adminConnected = false;
let dbConnected = false;

type Row = {
  title: string;
  body: string;
  category: string;
  created_by: string;
  targeting: { user_ids: string[] };
  metadata: Record<string, unknown>;
};

async function byCategory(category: string): Promise<Row[]> {
  const { rows } = await db.query(
    `SELECT title, body, category, created_by, targeting, metadata
     FROM public.notifications WHERE category = $1 ORDER BY body`,
    [category]
  );
  return rows as Row[];
}

/** Append one CDC reopen entry to the declined row, as the given role. */
async function reopenAs(role: 'service_role' | 'authenticated', at: string, actor = COORDINATOR) {
  const entry = JSON.stringify([{ at, actor, via: 'cdc-reopen' }]);
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query(
      `UPDATE public.cdc_drive_willingness
       SET willingness_audit = willingness_audit || $1::jsonb, updated_at = $2
       WHERE id = $3`,
      [entry, at, REOPEN_ROW]
    );
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}

beforeAll(async () => {
  admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: 'postgres' });
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${DBNAME}`);

  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  dbConnected = true;

  await db.query(SCHEMA);
  for (const m of MIGRATIONS) await db.query(readFileSync(m, 'utf8'));
}, 60_000);

afterAll(async () => {
  if (dbConnected) await db.end();
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
});

beforeEach(async () => {
  await db.query(FIXTURE);
});

describe('a drive that moves onto a booked day warns each learner about THEIR clash only', () => {
  it('tells A only about INDO-MIM and B only about Ashok Leyland — never both', async () => {
    await db.query(
      `UPDATE public.cdc_drives SET drive_date = '${TARGET_DAY}', updated_by = '${COORDINATOR}',
              updated_at = '2026-09-12T11:00:00Z' WHERE id = '${MOVING}'`
    );

    const clash = await byCategory('cdc.drive.same_day_clash');
    // Two distinct sets → two notifications.
    expect(clash).toHaveLength(2);

    const toA = clash.filter((n) => n.targeting.user_ids.includes(P.a));
    const toB = clash.filter((n) => n.targeting.user_ids.includes(P.b));
    expect(toA).toHaveLength(1);
    expect(toB).toHaveLength(1);
    expect(toA[0].body).toContain('INDO-MIM');
    expect(toA[0].body).not.toContain('Ashok Leyland');
    expect(toB[0].body).toContain('Ashok Leyland');
    expect(toB[0].body).not.toContain('INDO-MIM');

    // D shares A's set (INDO-MIM) and so shares A's notification.
    expect(toA[0].targeting.user_ids.slice().sort()).toEqual([P.a, P.d].sort());
    // C has no clash and the declined learner is not going: neither is warned.
    const everyone = clash.flatMap((n) => n.targeting.user_ids);
    expect(everyone).not.toContain(P.c);
    expect(everyone).not.toContain(P.r);

    // Non-vacuity: the ordinary move notice still reached every learner who said yes.
    const moved = await byCategory('cdc.drive.details_changed');
    expect(moved).toHaveLength(1);
    expect(moved[0].targeting.user_ids.slice().sort()).toEqual([P.a, P.b, P.c, P.d].sort());
  });

  it('says nothing about clashes when only the venue changed (control)', async () => {
    await db.query(
      `UPDATE public.cdc_drives SET venue_label = 'Block C', updated_by = '${COORDINATOR}',
              updated_at = '2026-09-12T11:00:00Z' WHERE id = '${MOVING}'`
    );
    expect(await byCategory('cdc.drive.same_day_clash')).toHaveLength(0);
    expect(await byCategory('cdc.drive.details_changed')).toHaveLength(1);
  });

  it('does not count a clashing drive that is cancelled', async () => {
    await db.query(`UPDATE public.cdc_drives SET status = 'cancelled' WHERE id = '${Y}'`);
    await db.query(
      `UPDATE public.cdc_drives SET drive_date = '${TARGET_DAY}', updated_by = '${COORDINATOR}',
              updated_at = '2026-09-12T11:00:00Z' WHERE id = '${MOVING}'`
    );
    const clash = await byCategory('cdc.drive.same_day_clash');
    expect(clash).toHaveLength(1);
    expect(clash[0].targeting.user_ids).not.toContain(P.b);
  });
});

describe('a CDC reopening tells the learner exactly once', () => {
  it('notifies on the first reopen and stays silent on a repeat while it still stands', async () => {
    await reopenAs('service_role', '2026-09-16T06:30:00Z');
    let rows = await byCategory('cdc.drive.response_reopened');
    expect(rows).toHaveLength(1);
    expect(rows[0].targeting.user_ids).toEqual([P.r]);
    expect(rows[0].created_by).toBe(COORDINATOR);

    // A second press: new updated_at (so a new idempotency key) — still one message.
    await reopenAs('service_role', '2026-09-16T06:31:00Z');
    rows = await byCategory('cdc.drive.response_reopened');
    expect(rows).toHaveLength(1);
  });

  it('ignores a reopen marker the learner wrote through their own client, and its forged actor', async () => {
    await reopenAs('authenticated', '2026-09-16T06:30:00Z', FORGED_ACTOR);
    expect(await byCategory('cdc.drive.response_reopened')).toHaveLength(0);

    // Non-vacuity: the same write, from the same starting row, through the CDC
    // path DOES notify, so the silence above is the role guard and not a
    // trigger that never fires.
    await db.query(FIXTURE);
    await reopenAs('service_role', '2026-09-16T06:30:00Z');
    const rows = await byCategory('cdc.drive.response_reopened');
    expect(rows).toHaveLength(1);
    expect(rows[0].created_by).toBe(COORDINATOR);
    expect(rows.map((r) => r.created_by)).not.toContain(FORGED_ACTOR);
  });

  it('says nothing for a cancelled drive', async () => {
    await db.query(`UPDATE public.cdc_drives SET status = 'cancelled' WHERE id = '${MOVING}'`);
    await reopenAs('service_role', '2026-09-16T06:30:00Z');
    expect(await byCategory('cdc.drive.response_reopened')).toHaveLength(0);
  });
});
