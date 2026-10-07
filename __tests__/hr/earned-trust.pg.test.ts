/**
 * Behavioural proof for supabase/migrations/20271007161151_hr_duty_tower_and_reliability.sql,
 * part 3: earned-trust suggestions — Director only, switch ships OFF, and nothing
 * in the cycle touches a role, a permission or an approval chain.
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
const DBNAME = `hdt_trust_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

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
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.super', true), '') = 'on' $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p = ANY (string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;
CREATE FUNCTION public.role_has_institution_access(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p::text = ANY (string_to_array(coalesce(current_setting('test.insts', true), ''), ',')) $$;
GRANT EXECUTE ON FUNCTION auth.uid(), public.is_super_admin(), public.is_admin(),
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
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_attendance_regularizations (
  id uuid PRIMARY KEY, employee_id uuid NOT NULL, status text, approver_id uuid, approved_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.hr_employee_documents (
  id uuid PRIMARY KEY, institution_id uuid NOT NULL, staff_id uuid, verification_status text NOT NULL,
  verified_by uuid, verified_at timestamptz, uploaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_staff_photo_submissions (
  id uuid PRIMARY KEY, institution_id uuid NOT NULL, staff_id uuid, status text NOT NULL,
  reviewed_by uuid, reviewed_at timestamptz, submitted_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_form_submissions (
  id uuid PRIMARY KEY, institution_id uuid, status text NOT NULL, current_step integer NOT NULL DEFAULT 1,
  approval_history jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_recruitment_candidates (
  id uuid PRIMARY KEY, institution_id uuid, status text NOT NULL, current_step integer NOT NULL DEFAULT 0,
  approval_chain jsonb, final_decided_at timestamptz, submitted_at timestamptz NOT NULL DEFAULT now());
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
const DIRECTOR = '00000000-0000-4000-8000-0000000000d1';
const SUPER = '00000000-0000-4000-8000-0000000000d2';     // a super admin who is not the Director
const STEADY = '00000000-0000-4000-8000-0000000000c1';    // on time on every document for 25 weeks
const PROTECTED = ['user_roles', 'custom_roles', 'profiles', 'user_institution_access', 'leave_approval_chains', 'hr_approval_flows'];

let client: Client;

type Step = { uid?: string | null; superAdmin?: boolean; role?: 'authenticated' | 'service_role'; sql: string };

/** Run steps in ONE transaction, each as its own caller; always rolled back. */
async function run(setup: string | null, steps: Step[]) {
  await client.query('BEGIN');
  const results: Array<{ rows: Array<Record<string, any>>; error: string | null }> = [];
  try {
    if (setup) await client.query(setup);
    for (const s of steps) {
      await client.query('SAVEPOINT s');
      try {
        await client.query(`SELECT set_config('test.uid', $1, true), set_config('test.super', $2, true)`,
          [s.uid ?? '', s.superAdmin ? 'on' : '']);
        await client.query(`SET LOCAL ROLE ${s.role ?? 'authenticated'}`);
        const r = await client.query(s.sql);
        await client.query('RESET ROLE');
        await client.query('RELEASE SAVEPOINT s');
        results.push({ rows: r.rows, error: null });
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT s');
        await client.query('RESET ROLE');
        results.push({ rows: [], error: (e as Error).message });
      }
    }
    const fingerprint = await snapshot();
    const suggestions = await client.query(`SELECT user_id, duty_code, status, evidence FROM public.hr_trust_suggestions`);
    const policy = await client.query(
      `SELECT value FROM public.platform_policies WHERE policy_key = 'hr.harness.trust.suggestions_enabled'`);
    const log = await client.query(`SELECT turned_on, by_user FROM public.hr_trust_switch_log ORDER BY at`);
    return { results, fingerprint, suggestions: suggestions.rows, policy: policy.rows[0]?.value, log: log.rows };
  } finally {
    await client.query('ROLLBACK');
  }
}

/** Row counts and an md5 of every protected table. */
async function snapshot(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of PROTECTED) {
    const r = await client.query(
      `SELECT count(*) || ':' || coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '') AS f FROM public.${t} x`);
    out[t] = r.rows[0].f;
  }
  return out;
}

const generate: Step = { role: 'service_role', sql: `SELECT public.fn_hr_trust_suggestions_generate() AS n` };
const switchOn = (uid: string, superAdmin = false): Step =>
  ({ uid, superAdmin, sql: `SELECT public.fn_hr_trust_switch(true, 'trying it') AS on` });
const directorLog = `INSERT INTO public.hr_trust_switch_log (turned_on, by_user) VALUES (true, '${DIRECTOR}')`;
const policyTrue = `UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = 'hr.harness.trust.suggestions_enabled'`;

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-c', directorFunctionSql()]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
  await client.query(`INSERT INTO public.profiles VALUES ($1, 'The Director'), ($2, 'Super Admin'), ($3, 'Steady Team Member')`,
    [DIRECTOR, SUPER, STEADY]);
  await client.query(
    `INSERT INTO public.platform_policies (policy_key, scope_type, value, data_type, classification)
     VALUES ('platform.the_director_profile_ids', 'global', $1::jsonb, 'array', 'major')`,
    [JSON.stringify([DIRECTOR])]);
  // A document verified one hour after upload, every 3 days for 25 weeks.
  await client.query(
    `INSERT INTO public.hr_employee_documents (id, institution_id, verification_status, verified_by, verified_at, uploaded_at)
     SELECT gen_random_uuid(), $1, 'verified', $2, now() - make_interval(days => 3 * g) + interval '1 hour',
            now() - make_interval(days => 3 * g)
       FROM generate_series(2, 58) g`, [INST, STEADY]);
  // One row in each protected table, so the fingerprint is not of empty tables.
  await client.query(`INSERT INTO public.user_roles (user_id) VALUES ($1)`, [STEADY]);
  await client.query(`INSERT INTO public.custom_roles (role_key, permissions) VALUES ('hr', '{}')`);
  await client.query(`INSERT INTO public.user_institution_access (user_id, institution_id) VALUES ($1, $2)`, [STEADY, INST]);
  await client.query(`INSERT INTO public.leave_approval_chains (chain) VALUES ('[]')`);
  await client.query(`INSERT INTO public.hr_approval_flows (steps) VALUES ('[]')`);
});

afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('the switch ships OFF', () => {
  it('the policy row is seeded false with no switch-log row', async () => {
    const r = await run(null, []);
    expect(r.policy).toBe(false);
    expect(r.log).toHaveLength(0);
  });

  it('generate returns 0 while the policy is false, even with a Director log row turning it on', async () => {
    const r = await run(directorLog, [generate]);
    expect(r.results[0].rows[0].n).toBe(0);
    expect(r.suggestions).toHaveLength(0);
  });

  it('policy true but no Director log row gives 0 (a raw policy edit switches nothing on)', async () => {
    const r = await run(policyTrue, [generate]);
    expect(r.results[0].error).toBeNull();
    expect(r.results[0].rows[0].n).toBe(0);
  });

  it('policy true with the latest log row written by a non-Director gives 0', async () => {
    const r = await run(`${policyTrue}; INSERT INTO public.hr_trust_switch_log (turned_on, by_user) VALUES (true, '${SUPER}')`,
      [generate]);
    expect(r.results[0].rows[0].n).toBe(0);
  });

  it('positive control: switched on by the Director, a team member steady for 12 weeks is suggested', async () => {
    const r = await run(null, [switchOn(DIRECTOR), generate]);
    expect(r.results[0].error).toBeNull();
    expect(r.policy).toBe(true);
    expect(r.log).toEqual([{ turned_on: true, by_user: DIRECTOR }]);
    expect(r.results[1].rows[0].n).toBe(1);
    expect(r.suggestions).toEqual([
      expect.objectContaining({ user_id: STEADY, duty_code: 'S2', status: 'proposed' }),
    ]);
    expect(r.suggestions[0].evidence).toMatchObject({ weeks: 12 });
  });
});

describe('only the Director', () => {
  it('a super admin who is not the Director cannot call the switch', async () => {
    const r = await run(null, [switchOn(SUPER, true)]);
    expect(r.results[0].error).toMatch(/Only the Director/);
    expect(r.policy).toBe(false);
    expect(r.log).toHaveLength(0);
  });

  it('a super admin who is not the Director cannot note a suggestion, and cannot see one', async () => {
    const r = await run(null, [
      switchOn(DIRECTOR), generate,
      { uid: SUPER, superAdmin: true, sql: `SELECT id FROM public.hr_trust_suggestions` },
      { uid: SUPER, superAdmin: true, sql: `SELECT public.fn_hr_trust_suggestion_decide(gen_random_uuid(), 'noted', NULL)` },
      { uid: DIRECTOR, sql: `SELECT id FROM public.hr_trust_suggestions` },
    ]);
    expect(r.results[2].rows).toHaveLength(0);
    expect(r.results[3].error).toMatch(/Only the Director/);
    expect(r.results[4].rows).toHaveLength(1);
  });

  it('the generate function is not callable by a signed-in team member', async () => {
    const r = await run(null, [{ uid: DIRECTOR, sql: `SELECT public.fn_hr_trust_suggestions_generate()` }]);
    expect(r.results[0].error).toMatch(/permission denied/);
  });
});

describe('a generate and decide cycle changes no role, permission or approval chain', () => {
  it('row counts and an md5 of every protected table are identical before and after', async () => {
    const before = await snapshot();
    const r = await run(null, [
      switchOn(DIRECTOR),
      generate,
      { uid: DIRECTOR, sql: `SELECT public.fn_hr_trust_suggestion_decide(
          (SELECT id FROM public.hr_trust_suggestions LIMIT 1), 'noted', 'good work') AS s` },
    ]);
    expect(r.results.map((x) => x.error)).toEqual([null, null, null]);
    expect(r.results[2].rows[0].s).toBe('noted');
    expect(r.suggestions).toEqual([expect.objectContaining({ status: 'noted' })]);
    expect(r.fingerprint).toEqual(before);
  });
});
