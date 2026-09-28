/**
 * A learner who attends one course in two SEPARATE periods of a day can
 * confirm both; a back-to-back block class still asks once.
 *
 * Behavioural proof for
 * supabase/migrations/20270208090000_scf_pending_separate_periods_offered.sql
 *
 * The migration is applied VERBATIM to a throwaway PostgreSQL over minimal
 * stand-ins for the tables and helpers it reads, and fn_scf_pending_for_learner
 * is called as each learner. The control is production's own definition, read
 * from the live catalogue on 2026-09-28 (_fixtures/…live-2026-09-28.sql) and
 * installed beside the fix under another name: against the SAME rows it hides
 * the second, separated class — the reported defect.
 *
 * RUNNING IT
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/lib/session-feedback/pending-separate-periods.pg.test.ts
 *
 * Override the server with SCF_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 * Loud rather than skipped when no server is reachable.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20270208090000_scf_pending_separate_periods_offered.sql',
);
const CONTROL = path.join(__dirname, '_fixtures/fn_scf_pending_for_learner.live-2026-09-28.sql');

const PGHOST = process.env.SCF_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.SCF_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.SCF_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const PGPASSWORD = process.env.SCF_TEST_PGPASSWORD;
const DBNAME = `scf_pending_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const C = '00000000-0000-4000-8000-0000000000c1'; // the course that meets twice
const D = '00000000-0000-4000-8000-0000000000d1'; // another course

const STUBS = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.institutions (id uuid PRIMARY KEY);
CREATE TABLE public.learners_profiles (id uuid PRIMARY KEY, profile_id uuid);
CREATE TABLE public.student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid, attendance_date date,
  timetable_id uuid, attendance_data jsonb);
CREATE TABLE public.session_feedback (
  student_id uuid, attendance_date date, timetable_id uuid, period_id text, course_id uuid);
CREATE FUNCTION public.fn_get_policy_int(text, integer, uuid) RETURNS integer
  LANGUAGE sql STABLE AS $$ SELECT $2 $$;
CREATE FUNCTION public.fn_attendance_slot_faculty(jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('faculty_name', 'SL') $$;
CREATE FUNCTION public.fn_attendance_slot_students(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(p -> 'students', '[]'::jsonb) $$;
INSERT INTO public.institutions VALUES ('00000000-0000-4000-8000-0000000000a1');
`;

let admin: Client;
let db: Client;

type Slot = { course: string | null; start: string; end: string };

/** One learner, one day's attendance record, and the periods they already answered. */
async function scenario(slots: Record<string, Slot>, answered: string[]) {
  const lp = randomUUID();
  const profile = randomUUID();
  const data: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(slots)) {
    data[key] = {
      course_id: s.course ?? '',
      start_time: s.start,
      end_time: s.end,
      students: [{ student_id: lp, status: 'Present' }],
    };
  }
  await db.query('INSERT INTO public.learners_profiles VALUES ($1, $2)', [lp, profile]);
  await db.query(
    `INSERT INTO public.student_attendance (institution_id, attendance_date, attendance_data)
     VALUES ('00000000-0000-4000-8000-0000000000a1', CURRENT_DATE, $1)`,
    [JSON.stringify(data)],
  );
  for (const key of answered) {
    await db.query(
      'INSERT INTO public.session_feedback VALUES ($1, CURRENT_DATE, NULL, $2, $3)',
      [lp, key, slots[key].course],
    );
  }
  const pending = async (fn: string) => {
    await db.query(`SELECT set_config('test.uid', $1, false)`, [profile]);
    const { rows } = await db.query(`SELECT period_id FROM public.${fn}(30) ORDER BY period_id`);
    return rows.map((r) => r.period_id as string);
  };
  return { fixed: () => pending('fn_scf_pending_for_learner'), live: () => pending('fn_scf_pending_live') };
}

beforeAll(async () => {
  admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  await db.query(STUBS);
  await db.query(readFileSync(MIGRATION, 'utf8'));
  const control = readFileSync(CONTROL, 'utf8').replace(
    'public.fn_scf_pending_for_learner(',
    'public.fn_scf_pending_live(',
  );
  await db.query(control);
}, 30_000);

afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME}`);
    await admin.end();
  }
});

describe('fn_scf_pending_for_learner: separate classes each ask, a block asks once', () => {
  it('offers the second of two SEPARATE classes of a course after the first is answered (live hides it)', async () => {
    const s = await scenario(
      {
        p1: { course: C, start: '09:00', end: '09:50' },
        p2: { course: D, start: '09:50', end: '10:40' },
        p5: { course: C, start: '14:00:00', end: '14:50:00' },
      },
      ['p1'],
    );
    expect(await s.fixed()).toEqual(['p2', 'p5']);
    expect(await s.live()).toEqual(['p2']); // the reported defect
  });

  it('reads 12-hour times too: 10:00 AM and 2:00 PM are separate', async () => {
    const s = await scenario(
      {
        p1: { course: C, start: '10:00 AM', end: '10:50 AM' },
        p6: { course: C, start: '2:00 PM', end: '2:50 PM' },
      },
      ['p1'],
    );
    expect(await s.fixed()).toEqual(['p6']);
    expect(await s.live()).toEqual([]);
  });

  it('a two-period block class still takes ONE confirmation', async () => {
    const s = await scenario(
      {
        p1: { course: C, start: '09:00', end: '09:50' },
        p2: { course: C, start: '09:50', end: '10:40' },
      },
      ['p1'],
    );
    expect(await s.fixed()).toEqual([]);
    expect(await s.live()).toEqual([]);
  });

  it('a three-period block with short breaks is one block, even where #1 and #3 are not adjacent', async () => {
    const s = await scenario(
      {
        p1: { course: C, start: '09:00', end: '09:50' },
        p2: { course: C, start: '09:55', end: '10:45' },
        p3: { course: C, start: '10:50', end: '11:40' },
      },
      ['p1'],
    );
    expect(await s.fixed()).toEqual([]);
  });

  it('an unreadable time falls back to today\'s rule (one confirmation for the course that day)', async () => {
    const s = await scenario(
      {
        p1: { course: C, start: '09:00', end: '09:50' },
        p5: { course: C, start: '', end: '' },
      },
      ['p1'],
    );
    expect(await s.fixed()).toEqual([]);
  });

  it('nothing answered: every attended period is offered', async () => {
    const s = await scenario(
      {
        p1: { course: C, start: '09:00', end: '09:50' },
        p2: { course: C, start: '09:50', end: '10:40' },
        p5: { course: C, start: '14:00', end: '14:50' },
      },
      [],
    );
    expect(await s.fixed()).toEqual(['p1', 'p2', 'p5']);
  });
});

describe('fn_scf_block_period_keys never raises', () => {
  it.each([
    ['[]', 'p1'],
    ['{"p1": {"course_id": "x", "start_time": "abc", "end_time": "25:99"}}', 'p1'],
    ['{"p1": {"course_id": ""}}', 'p1'],
    ['{}', 'missing'],
    ['{"p1": {"course_id": "x", "start_time": "13:00 PM", "end_time": "0:00 AM"}}', 'p1'],
  ])('%s / %s', async (data, key) => {
    const { rows } = await db.query('SELECT public.fn_scf_block_period_keys($1::jsonb, $2) AS k', [data, key]);
    expect(Array.isArray(rows[0].k)).toBe(true);
  });
});
