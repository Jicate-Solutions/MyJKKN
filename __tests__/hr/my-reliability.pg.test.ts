/**
 * Behavioural proof for supabase/migrations/20271007161151_hr_duty_tower_and_reliability.sql,
 * part 2: fn_hr_my_reliability — a team member's own read-only 12-week record.
 *
 * The migration is applied VERBATIM with psql onto a throwaway database after a
 * prelude that stands in for the production tables it reads (the same prelude
 * as duty-tower.pg.test.ts). fn_is_the_director is copied verbatim from 20270520090000.
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20271007161151_hr_duty_tower_and_reliability.sql');
const DIRECTOR_LIST = path.join(REPO, 'supabase/migrations/20270520090000_the_director_list.sql');
const PGHOST = process.env.HDT_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HDT_TEST_PGPORT ?? '5432';
const PGUSER = process.env.HDT_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `hdt_rel_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

// ---------------------------------------------------------------------------
// Prelude: the production objects the migration reads, as stand-ins.
// ---------------------------------------------------------------------------
const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
-- The JWT role claim: set by a test to the role it acts as. Read from a setting,
-- not current_user, which is the owner inside a SECURITY DEFINER function.
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.role', true), '') $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.super', true), '') = 'on' $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.admin', true), '') = 'on' $$;
CREATE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p = ANY (string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;
CREATE FUNCTION public.role_has_institution_access(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p::text = ANY (string_to_array(coalesce(current_setting('test.insts', true), ''), ',')) $$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), public.is_super_admin(), public.is_admin(),
  public.user_has_permission(text), public.role_has_institution_access(uuid) TO authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text);
CREATE TABLE public.staff (id uuid PRIMARY KEY, institution_id uuid NOT NULL, profile_id uuid);
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_key text NOT NULL, scope_type text NOT NULL,
  scope_id uuid, value jsonb NOT NULL, data_type text NOT NULL, classification text NOT NULL,
  publication_state text NOT NULL DEFAULT 'published', is_active boolean DEFAULT true, description text,
  updated_at timestamptz DEFAULT now(), updated_by uuid);
CREATE UNIQUE INDEX uq_platform_policies_key_scope
  ON platform_policies (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE public.loop_registry (
  loop_key text PRIMARY KEY, name text NOT NULL,
  stack_tier integer NOT NULL DEFAULT 3 CHECK (stack_tier BETWEEN 1 AND 5),
  loop_class text NOT NULL DEFAULT 'cadence'
    CHECK (loop_class IN ('self_improving','cadence','accountability','intake','infrastructure')),
  domain text, description text,
  gates jsonb NOT NULL DEFAULT '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb,
  routine_id text, owner_email text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  outcome_metric text, baseline_window text, intervention text, verdict_owner text,
  remeasure_window text, counter_metric text, bar text, bar_kind text);
CREATE TABLE public.ai_routine_schedules (
  routine_id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true,
  days_of_week smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', minute_of_day smallint NOT NULL DEFAULT 0,
  managed boolean NOT NULL DEFAULT true, max_only boolean NOT NULL DEFAULT false,
  CHECK (minute_of_day BETWEEN 0 AND 1439), CHECK (days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]));
-- The seven sources, with the main columns (types/supabase.ts) the facts
-- function reads. hr_leave_applications has no CREATE on main.
CREATE TABLE public.hr_leave_applications (
  id uuid PRIMARY KEY, hr_organization_id uuid, employee_id uuid NOT NULL,
  approval_chain jsonb NOT NULL DEFAULT '[]', current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL, final_decided_at timestamptz, final_approver_id uuid,
  revoked_at timestamptz, revoked_by uuid, superseded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_comp_off_credits (
  id uuid PRIMARY KEY, employee_id uuid NOT NULL, worked_date date, expires_on date NOT NULL,
  source text NOT NULL DEFAULT 'claim', status text NOT NULL, approved_by uuid, approved_at timestamptz,
  revoked_at timestamptz, created_by uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_attendance_regularizations (
  id uuid PRIMARY KEY, employee_id uuid NOT NULL, status text, approver_id uuid, approved_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.hr_employee_documents (
  id uuid PRIMARY KEY, institution_id uuid NOT NULL, staff_id uuid, verification_status text NOT NULL,
  verified_by uuid, verified_at timestamptz, uploaded_by uuid, uploaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_staff_photo_submissions (
  id uuid PRIMARY KEY, institution_id uuid NOT NULL, staff_id uuid, status text NOT NULL,
  reviewed_by uuid, reviewed_at timestamptz, submitted_by uuid, submitted_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_form_submissions (
  id uuid PRIMARY KEY, institution_id uuid, status text NOT NULL, current_step integer NOT NULL DEFAULT 1,
  approval_history jsonb NOT NULL DEFAULT '[]', submitted_by uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_recruitment_candidates (
  id uuid PRIMARY KEY, institution_id uuid, status text NOT NULL, current_step integer NOT NULL DEFAULT 0,
  approval_chain jsonb, final_decided_at timestamptz, submitted_by uuid, submitted_at timestamptz NOT NULL DEFAULT now());
-- The decision-email outbox: its created_at is the server's record of a comp-off decision.
CREATE TABLE public.hr_decision_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leave_application_id uuid, comp_off_credit_id uuid,
  employee_id uuid, decision text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- The permission and chain tables no function here may write.
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, role_id uuid);
CREATE TABLE public.custom_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role_key text, permissions jsonb);
CREATE TABLE public.user_institution_access (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, institution_id uuid);
CREATE TABLE public.leave_approval_chains (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chain jsonb);
CREATE TABLE public.hr_approval_flows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), steps jsonb);
`;

/** fn_is_the_director, verbatim from main's 20270520090000 (CREATE through its GRANT). */
function directorFunctionSql(): string {
  const src = fs.readFileSync(DIRECTOR_LIST, 'utf8');
  const start = src.indexOf('CREATE OR REPLACE FUNCTION public.fn_is_the_director()');
  const grant = 'GRANT  EXECUTE ON FUNCTION public.fn_is_the_director() TO authenticated, service_role;';
  const end = src.indexOf(grant);
  if (start < 0 || end < 0) throw new Error('fn_is_the_director not found in 20270520090000');
  return src.slice(start, end + grant.length);
}

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const INST = '00000000-0000-4000-8000-0000000000a1';
const ME = '00000000-0000-4000-8000-0000000000c1';         // steady: 12 documents, all on time
const OTHER = '00000000-0000-4000-8000-0000000000c2';      // 3 documents, all late
const SLOW = '00000000-0000-4000-8000-0000000000c3';       // 10 documents, all late
const SELF = '00000000-0000-4000-8000-0000000000c4';       // verified 12 of their OWN documents
const DIRECT = '00000000-0000-4000-8000-0000000000c6';     // 12 attendance corrections written already approved
const SELF_ROW = '00000000-0000-4000-8000-0000000000b4';
const NOT_A_MEMBER = '00000000-0000-4000-8000-0000000000c7';   // decided 12 documents on time, but has no team-member record
/** The weekly compute for the IST week holding now: writes everyone's 12-week snapshot. */
const COMPUTE = `SELECT public.fn_hr_duty_tower_compute((date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata'))::date)`;

let client: Client;

/** n documents verified by `who`, uploaded every 5 days back from 5 days ago, verified after `afterHours`. */
async function documents(who: string, n: number, afterHours: number) {
  await client.query(
    `INSERT INTO public.hr_employee_documents (id, institution_id, verification_status, verified_by, verified_at, uploaded_at)
     SELECT gen_random_uuid(), $1, 'verified', $2,
            now() - make_interval(days => 5 * g) + make_interval(hours => $4),
            now() - make_interval(days => 5 * g)
       FROM generate_series(1, $3) g`,
    [INST, who, n, afterHours],
  );
}

/** Run fn_hr_my_reliability as `authenticated` with auth.uid() = uid. Always rolled back. */
async function mine(uid: string | null, setup?: string) {
  await client.query('BEGIN');
  try {
    if (setup) await client.query(setup);
    await client.query(COMPUTE);
    await client.query(`SELECT set_config('test.uid', $1, true)`, [uid ?? '']);
    await client.query('SET LOCAL ROLE authenticated');
    const r = await client.query(`SELECT * FROM public.fn_hr_my_reliability()`);
    return { rows: r.rows, error: null as string | null };
  } catch (e) {
    return { rows: [] as Array<Record<string, any>>, error: (e as Error).message };
  } finally {
    await client.query('ROLLBACK');
  }
}

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-c', directorFunctionSql()]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
  await client.query(`INSERT INTO public.profiles VALUES ($1, 'Me'), ($2, 'Other'), ($3, 'Slow')`, [ME, OTHER, SLOW]);
  await documents(ME, 12, 1);
  await documents(OTHER, 3, 24 * 6);
  await documents(SLOW, 10, 24 * 6);
  await client.query(`INSERT INTO public.profiles VALUES ($1, 'Self'), ($2, 'Direct'), ($3, 'Not A Team Member')`,
    [SELF, DIRECT, NOT_A_MEMBER]);
  // Everyone who decides HR duties here is a team member with a staff row, except NOT_A_MEMBER.
  await client.query(
    `INSERT INTO public.staff (id, institution_id, profile_id)
     SELECT gen_random_uuid(), $1, p FROM unnest($2::uuid[]) p`, [INST, [ME, OTHER, SLOW, DIRECT]]);
  await documents(NOT_A_MEMBER, 12, 1);
  await client.query(`INSERT INTO public.staff VALUES ($1, $2, $3)`, [SELF_ROW, INST, SELF]);
  await client.query(
    `INSERT INTO public.hr_employee_documents (id, institution_id, staff_id, verification_status, verified_by, verified_at, uploaded_at)
     SELECT gen_random_uuid(), $1, $2, 'verified', $3, now() - make_interval(days => 5 * g) + interval '1 hour',
            now() - make_interval(days => 5 * g)
       FROM generate_series(1, 12) g`, [INST, SELF_ROW, SELF]);
  await client.query(
    `INSERT INTO public.hr_attendance_regularizations (id, employee_id, status, approver_id, approved_at, created_at)
     SELECT gen_random_uuid(), $1, 'approved', $2, now() - make_interval(days => 5 * g), now() - make_interval(days => 5 * g)
       FROM generate_series(1, 12) g`, [SELF_ROW, DIRECT]);
});

afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('fn_hr_my_reliability — a team member reads only their own record', () => {
  it('a caller sees only the items they decided', async () => {
    const me = await mine(ME);
    expect(me.error).toBeNull();
    expect(me.rows).toHaveLength(1);
    expect(me.rows[0]).toMatchObject({ duty_code: 'S2', items: 12, signal: 'steady' });
    expect(Number(me.rows[0].on_time_rate)).toBe(1);

    const other = await mine(OTHER);
    expect(other.rows).toHaveLength(1);
    expect(other.rows[0]).toMatchObject({ duty_code: 'S2', items: 3, signal: 'too few items' });
    expect(Number(other.rows[0].on_time_rate)).toBe(0);
  });

  it("enough items but too many late reads 'building', never 'steady'", async () => {
    const slow = await mine(SLOW);
    expect(slow.rows[0]).toMatchObject({ items: 10, signal: 'building' });
  });

  it('a caller with no decided items gets no rows', async () => {
    const nobody = await mine('00000000-0000-4000-8000-0000000000ff');
    expect(nobody.error).toBeNull();
    expect(nobody.rows).toHaveLength(0);
  });

  it('a call with no signed-in user raises', async () => {
    const r = await mine(null);
    expect(r.error).toMatch(/Sign in/);
  });

  it('the function takes no user to look up', async () => {
    const r = await client.query(
      `SELECT pg_get_function_identity_arguments('public.fn_hr_my_reliability'::regproc) AS args`);
    expect(r.rows[0].args).toBe('');
  });
});

describe("the thresholds fail closed: never 'steady' by default", () => {
  it("a missing min_items policy gives 'too few items', not 'steady'", async () => {
    const r = await mine(ME, `DELETE FROM public.platform_policies WHERE policy_key = 'hr.harness.trust.min_items'`);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({ items: 12, signal: 'too few items' });
  });

  it("an unreadable steady_on_time value gives 'too few items'", async () => {
    const r = await mine(ME,
      `UPDATE public.platform_policies SET value = '"ninety"'::jsonb WHERE policy_key = 'hr.harness.trust.steady_on_time'`);
    expect(r.rows[0]).toMatchObject({ signal: 'too few items' });
  });

  it("an inactive max_reversal policy gives 'too few items'", async () => {
    const r = await mine(ME,
      `UPDATE public.platform_policies SET is_active = false WHERE policy_key = 'hr.harness.trust.max_reversal'`);
    expect(r.rows[0]).toMatchObject({ signal: 'too few items' });
  });
});

describe("nobody makes their own 'steady'", () => {
  it('a team member who verified twelve of their own documents has no record', async () => {
    const r = await mine(SELF);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(0);
  });

  it('twelve attendance corrections written already approved (they never waited) give no record', async () => {
    const r = await mine(DIRECT);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(0);
  });
});

describe('the bar for steady travels with the rows, read from the policy rows', () => {
  it('each row carries the three thresholds as stored', async () => {
    const r = await mine(ME);
    expect(r.rows[0]).toMatchObject({ min_items: '10', steady_on_time: '0.9', max_reversal: '0.05' });
  });

  it('a changed threshold changes both the signal and the bar shown', async () => {
    const r = await mine(ME, `UPDATE public.platform_policies SET value = '13'::jsonb WHERE policy_key = 'hr.harness.trust.min_items'`);
    expect(r.rows[0]).toMatchObject({ items: 12, signal: 'too few items', min_items: '13' });
  });

  it('an unreadable threshold sends all three back empty, so the page cannot print a bar', async () => {
    const r = await mine(ME,
      `UPDATE public.platform_policies SET value = '"ninety"'::jsonb WHERE policy_key = 'hr.harness.trust.steady_on_time'`);
    expect(r.rows[0]).toMatchObject({ min_items: null, steady_on_time: null, max_reversal: null });
  });
});

describe('load: My Desk reads a weekly snapshot, and nothing at all for someone with no team-member record', () => {
  it('a caller with no team-member record gets nothing, even with decided items on record', async () => {
    const r = await mine(NOT_A_MEMBER);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(0);
  });

  it('reads the last weekly snapshot, not the live sources', async () => {
    await client.query('BEGIN');
    try {
      await client.query(COMPUTE);
      // twelve more decided documents after the weekly run...
      await client.query(
        `INSERT INTO public.hr_employee_documents (id, institution_id, verification_status, verified_by, verified_at, uploaded_at)
         SELECT gen_random_uuid(), $1, 'verified', $2, now() - make_interval(days => 5 * g) + interval '2 hours',
                now() - make_interval(days => 5 * g)
           FROM generate_series(1, 12) g`, [INST, ME]);
      await client.query(`SELECT set_config('test.uid', $1, true)`, [ME]);
      await client.query('SET LOCAL ROLE authenticated');
      const r = await client.query(`SELECT items FROM public.fn_hr_my_reliability()`);
      // ...do not show until the next run
      expect(r.rows[0].items).toBe(12);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('nobody signed in can read the snapshot table directly, the Director included', async () => {
    await client.query('BEGIN');
    try {
      await client.query(COMPUTE);
      await client.query(`SELECT set_config('test.uid', $1, true)`, [ME]);
      await client.query('SET LOCAL ROLE authenticated');
      await expect(client.query(`SELECT * FROM public.hr_duty_person_records`)).rejects.toThrow(/permission denied/);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('My Desk reads only the latest weekly snapshot', () => {
  it('with two weekly snapshots on record, each duty appears once, from the latest', async () => {
    await client.query('BEGIN');
    try {
      // last week's run, then this week's
      await client.query(`SELECT public.fn_hr_duty_tower_compute(
        (date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') - interval '7 days')::date)`);
      await client.query(COMPUTE);
      const latest = await client.query(
        `SELECT items FROM public.hr_duty_person_records
          WHERE user_id = $1 AND duty_code = 'S2'
            AND week_start = (SELECT max(week_start) FROM public.hr_duty_person_records)`, [ME]);
      await client.query(`SELECT set_config('test.uid', $1, true)`, [ME]);
      await client.query('SET LOCAL ROLE authenticated');
      const r = await client.query(`SELECT duty_code, items FROM public.fn_hr_my_reliability()`);
      expect(r.rows).toEqual([{ duty_code: 'S2', items: latest.rows[0].items }]);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
