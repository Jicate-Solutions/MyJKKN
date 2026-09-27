/**
 * The learner dashboard's Fee Balance must equal what /learners/my-bills shows.
 *
 * public.fn_student_metrics() (SECURITY DEFINER) summed every bill with a
 * balance except cancelled / refunded. /learners/my-bills also leaves out
 * SUPERSEDED bills and bills in a category with visible_to_learners = false.
 * Live on 2026-09-28: 451 learners' dashboards overstated (Rs 3.75 crore);
 * BUG-006118 (40,000 vs 15,000), BUG-006111 (65,000 vs 0), BUG-006215
 * (1,10,000 vs 50,000).
 *
 * The CONTROL is production's body verbatim (supabase/tests/fn-student-metrics-pre-fix.sql);
 * then supabase/migrations/20270414090000_… is applied over it with psql, as the ship wave would.
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const PRE_FIX = path.join(REPO, 'supabase/tests/fn-student-metrics-pre-fix.sql');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270414090000_student_dashboard_fee_balance_matches_my_bills.sql');
const PGHOST = process.env.FEE_BALANCE_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.FEE_BALANCE_TEST_PGPORT ?? '5432';
const PGUSER = process.env.FEE_BALANCE_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `fee_bal_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const UID = '00000000-0000-4000-8000-00000000f001';
const LEARNER = '00000000-0000-4000-8000-00000000f011';
const CAT_TUITION = '00000000-0000-4000-8000-00000000f021';
const CAT_HIDDEN = '00000000-0000-4000-8000-00000000f022';

// Only what fn_student_metrics() reads before and inside the fee tiles. Every
// other tile sits in its own BEGIN … EXCEPTION block, so a missing table there
// is caught and does not affect the fee numbers under test.
const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
-- The career-readiness composite helper is called outside a tile block; a stand-in keeps it out of the way.
CREATE FUNCTION public.compute_renormalized_composite(jsonb, jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, learner_id uuid, institution_id uuid);
CREATE TABLE public.learners_profiles (id uuid PRIMARY KEY, section_id uuid, semester_id uuid);
CREATE TABLE public.billing_categories (id uuid PRIMARY KEY, name text, visible_to_learners boolean NOT NULL DEFAULT true);
CREATE TABLE public.billing_student_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, item_category_id uuid,
  bill_description text, balance_amount numeric, status text, due_date date,
  updated_at timestamptz DEFAULT now());
INSERT INTO public.profiles VALUES ('${UID}', '${LEARNER}', NULL);
INSERT INTO public.learners_profiles VALUES ('${LEARNER}', NULL, NULL);
INSERT INTO public.billing_categories VALUES ('${CAT_TUITION}', 'Tuition', true), ('${CAT_HIDDEN}', 'Internal adjustment', false);
-- What /learners/my-bills shows as owed: 15,000 (one visible unpaid bill).
INSERT INTO public.billing_student_bills (student_id, item_category_id, bill_description, balance_amount, status, due_date) VALUES
  ('${LEARNER}', '${CAT_TUITION}', 'Tuition 2026',          15000, 'unpaid',     current_date + 10),
  ('${LEARNER}', '${CAT_TUITION}', 'Tuition 2026 (old)',    60000, 'superseded', current_date + 12),
  ('${LEARNER}', '${CAT_HIDDEN}',  'Internal adjustment',   25000, 'unpaid',     current_date + 14),
  ('${LEARNER}', '${CAT_TUITION}', 'Cancelled bill',         9000, 'cancelled',  current_date + 16),
  ('${LEARNER}', '${CAT_TUITION}', 'Exam fee',                  0, 'paid',       current_date + 5);
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

async function metricsAsLearner(): Promise<{ fees: { balance_due: number; next_due_date: string | null }; deadlines: { upcoming: { title: string }[]; count: number } }> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('test.uid', $1, true)`, [UID]);
    await client.query('SET LOCAL ROLE authenticated');
    const r = await client.query('SELECT public.fn_student_metrics() AS m');
    return r.rows[0].m;
  } finally {
    await client.query('ROLLBACK');
  }
}

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', PRE_FIX]);
  psql(['-d', DBNAME, '-c', 'REVOKE EXECUTE ON FUNCTION public.fn_student_metrics() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_student_metrics() TO authenticated, service_role;']);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
});
afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('learner dashboard Fee Balance = /learners/my-bills', () => {
  it('control: production\'s body counts the superseded and hidden bills (100,000, not 15,000)', async () => {
    const m = await metricsAsLearner();
    expect(Number(m.fees.balance_due)).toBe(100000);
    expect(m.deadlines.upcoming.map((d) => d.title)).toContain('Internal adjustment');
  });

  it('after 20270414090000: the balance is 15,000 — the visible unpaid bill only', async () => {
    psql(['-d', DBNAME, '-f', MIGRATION]);
    const m = await metricsAsLearner();
    expect(Number(m.fees.balance_due)).toBe(15000);
  });

  it('the fee deadlines list shows only that bill, not the superseded or hidden ones', async () => {
    const m = await metricsAsLearner();
    expect(m.deadlines.upcoming.map((d) => d.title)).toEqual(['Tuition 2026']);
    expect(m.deadlines.count).toBe(1);
  });

  it('next due date follows the visible bill', async () => {
    const m = await metricsAsLearner();
    const expected = (await client.query(`SELECT (current_date + 10)::text AS d`)).rows[0].d;
    expect(m.fees.next_due_date).toBe(expected);
  });

  it('the migration re-applies cleanly (its precondition accepts its own result)', () => {
    expect(() => psql(['-d', DBNAME, '-f', MIGRATION])).not.toThrow();
  });

  it('the self-check refuses a drifted grant (a role beyond authenticated and service_role)', () => {
    psql(['-d', DBNAME, '-c', `DO $$ BEGIN CREATE ROLE reporting NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT EXECUTE ON FUNCTION public.fn_student_metrics() TO reporting;`]);
    try {
      expect(() => psql(['-d', DBNAME, '-f', MIGRATION])).toThrow(/grantees drifted/);
    } finally {
      psql(['-d', DBNAME, '-c', 'REVOKE EXECUTE ON FUNCTION public.fn_student_metrics() FROM reporting;']);
    }
  });
});
