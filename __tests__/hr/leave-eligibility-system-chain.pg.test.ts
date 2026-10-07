/**
 * supabase/migrations/20271003101521_hr_leave_eligibility_system_chain.sql,
 * applied with the real migrations it builds on to a throwaway PostgreSQL 16.
 *
 * THE HOLE (confirmed live, 1 Oct 2026): the person asking for leave
 * eligibility wrote their own approval_chain, so they could name themselves and
 * approve their own PH.D eligibility; an HR Head on the flow could approve
 * their own request; and nothing in the database stopped an application for a
 * gated leave type.
 *
 * The real files are applied VERBATIM (function bodies are not checked at
 * create time, so the parts that read tables this test does not build are
 * simply never run). The production helpers they call — auth.uid(),
 * is_super_admin(), user_has_permission(), role_has_institution_access(),
 * fn_my_staff_ids(), fn_my_hr_organization_ids() — are stand-ins answering
 * from per-transaction test settings. Every test runs in a transaction that is
 * ALWAYS rolled back.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIG = (f: string) => path.join(REPO, 'supabase/migrations', f);
const MIGRATIONS = [
  '20260831120000_hr_leave_approval_flow_parallel_ladder.sql',
  '20260908_leave_chain_resync_rpcs.sql',
  '20260908170000_leave_approval_org_scope.sql',
  '20260908180000_leave_scope_predicate_memo.sql',
  '20261225090000_leave_approval_flow_staff_group.sql',
  '20261225100000_leave_type_eligibility.sql',
  '20261225110000_leave_eligibility_approval_flow.sql',
  '20261225120000_hr_can_decide_eligibility_narrow.sql',
  '20270520090000_the_director_list.sql',
  '20271003101521_hr_leave_eligibility_system_chain.sql',
].map(MIG);
const PGHOST = process.env.HLE_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HLE_TEST_PGPORT ?? '5432';
const PGUSER = process.env.HLE_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `hle_chain_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const INST_A = id(1);
const INST_B = id(2);
const ORG_A = id(11);
const ORG_B = id(12);
const DEPT = id(21);
const R_HOD = id(31);
const R_HRHEAD = id(32);
// profiles (= auth user ids)
const P_ASKER = id(101);
const P_HOD = id(102);
const P_HRHEAD = id(103);
const P_DIRECTOR = id(104);
const P_DEPUTY = id(105);
const P_HR2 = id(106); // a second HR manager, not on any chain
const P_B = id(107); // a team member at college B
const P_HODX = id(108); // holds the HOD role, no department on their record
const P_HODHR = id(109); // holds the HOD role AND the HR Head role
const P_HODY = id(110); // the HOD of another department
const DEPT_Y = id(22);
// staff rows
const S_ASKER = id(201);
const S_HOD = id(202);
const S_HRHEAD = id(203);
const S_B = id(204);
const S_DIR = id(205); // the Director's own team member record
const S_HODX = id(206);
const S_HODHR = id(207);
const S_HODY = id(208);
// leave types
const T_PHD = id(301); // gated, has an eligibility flow (HOD -> HR Head)
const T_WFH = id(302); // gated, no flow anywhere
const T_CL = id(303); // not gated
const T_WFH_B = id(304); // gated, college B, no flow
const T_TWO = id(305); // gated, flow names the HR Head twice
const T_DIRPIN = id(306); // gated, flow pins the Director by name
const T_THREE = id(307); // gated, flow: HOD review, HR Head final, HOD review
const FLOW_PHD = id(401);
const FLOW_TWO = id(402);
const FLOW_DIRPIN = id(403);
const FLOW_THREE = id(404);

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.jwt_role', true), '') $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, deleted_at timestamptz);

CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('test.super', true) = 'on' $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p = ANY (string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;
-- As production: a NULL institution passes; otherwise the caller's reach.
CREATE FUNCTION public.role_has_institution_access(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p IS NULL OR p::text = ANY (string_to_array(coalesce(current_setting('test.insts', true), ''), ',')) $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, is_super_admin boolean NOT NULL DEFAULT false);
CREATE TABLE public.custom_roles (id uuid PRIMARY KEY, role_key text UNIQUE, role_name text, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_roles (user_id uuid, role_id uuid);
CREATE TABLE public.user_institution_access (user_id uuid, institution_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.employment_categories (id uuid PRIMARY KEY, is_teaching boolean);
CREATE TABLE public.staff (id uuid PRIMARY KEY, profile_id uuid, institution_id uuid, department_id uuid,
  category_id uuid, is_active boolean DEFAULT true, first_name text, last_name text, email text, institution_email text);
CREATE TABLE public.hr_organizations (id uuid PRIMARY KEY, institution_id uuid, included_in_hr boolean NOT NULL DEFAULT true, name text);
CREATE TABLE public.hr_leave_types (id uuid PRIMARY KEY, leave_type_name text, hr_organization_id uuid);
CREATE TABLE public.hr_approval_flows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hr_organization_id uuid,
  flow_for text, flow_name text, conditions jsonb NOT NULL DEFAULT '{}'::jsonb, steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalate_after_hours int, is_active boolean NOT NULL DEFAULT true, valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_leave_applications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid,
  leave_type_id uuid, hr_organization_id uuid, status text DEFAULT 'pending', approval_chain jsonb DEFAULT '[]'::jsonb,
  current_step int DEFAULT 0, start_date date DEFAULT CURRENT_DATE, end_date date DEFAULT CURRENT_DATE);
CREATE TABLE public.platform_policies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_key text NOT NULL,
  scope_type text NOT NULL, scope_id uuid, value jsonb NOT NULL, description text, data_type text NOT NULL,
  is_system boolean DEFAULT false, is_active boolean DEFAULT true, updated_by uuid, updated_at timestamptz);
CREATE UNIQUE INDEX uq_platform_policies_key_scope ON public.platform_policies
  (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE VIEW public.v_hr_leave_balance_src AS
  SELECT s.id AS employee_id, t.id AS leave_type_id FROM public.staff s CROSS JOIN public.hr_leave_types t;

-- Production's own bodies (20260801002600, 20260906150000).
CREATE FUNCTION public.fn_my_staff_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) FROM public.staff s WHERE s.profile_id = auth.uid() AND s.is_active $$;
CREATE FUNCTION public.fn_my_hr_organization_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[]) FROM public.hr_organizations o
  WHERE o.included_in_hr AND (public.role_has_institution_access(o.institution_id)
    OR o.institution_id IN (SELECT s.institution_id FROM public.staff s WHERE s.profile_id = auth.uid() AND s.is_active)) $$;

GRANT SELECT, INSERT, UPDATE ON public.hr_leave_applications TO authenticated;
-- As production: an admin can reach platform_policies; the guard decides.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_policies TO authenticated;

INSERT INTO public.custom_roles VALUES ('${R_HOD}', 'hod', 'HOD', true), ('${R_HRHEAD}', 'hr_head', 'HR Head', true);

-- As Supabase: every table created from here on (the migrations') is granted
-- to the API roles by default, whatever the migration itself grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
`;

// Before the migrations: the Director's sign-in, which the new file's policy
// seed reads.
const PRE_SEED = `
INSERT INTO public.profiles (id) VALUES ('${P_DIRECTOR}');
INSERT INTO auth.users VALUES ('${P_DIRECTOR}', 'Director@jkkn.ac.in', now(), NULL);
`;

// After the migrations: requires_eligibility arrives with 20261225100000.
const SEED = `
INSERT INTO public.profiles (id) VALUES ('${P_ASKER}'), ('${P_HOD}'), ('${P_HRHEAD}'), ('${P_DEPUTY}'), ('${P_HR2}'), ('${P_B}'),
  ('${P_HODX}'), ('${P_HODHR}'), ('${P_HODY}');
INSERT INTO public.user_roles VALUES ('${P_HOD}', '${R_HOD}'), ('${P_HRHEAD}', '${R_HRHEAD}'),
  ('${P_HODX}', '${R_HOD}'), ('${P_HODHR}', '${R_HOD}'), ('${P_HODHR}', '${R_HRHEAD}'), ('${P_HODY}', '${R_HOD}');
INSERT INTO public.hr_organizations (id, institution_id, name) VALUES ('${ORG_A}', '${INST_A}', 'A'), ('${ORG_B}', '${INST_B}', 'B');
INSERT INTO public.staff (id, profile_id, institution_id, department_id) VALUES
  ('${S_ASKER}', '${P_ASKER}', '${INST_A}', '${DEPT}'),
  ('${S_HOD}', '${P_HOD}', '${INST_A}', '${DEPT}'),
  ('${S_HRHEAD}', '${P_HRHEAD}', '${INST_A}', NULL),
  ('${S_B}', '${P_B}', '${INST_B}', NULL),
  ('${S_DIR}', '${P_DIRECTOR}', '${INST_A}', NULL),
  ('${S_HODX}', '${P_HODX}', '${INST_A}', NULL),
  ('${S_HODHR}', '${P_HODHR}', '${INST_A}', '${DEPT}'),
  ('${S_HODY}', '${P_HODY}', '${INST_A}', '${DEPT_Y}');
INSERT INTO public.hr_leave_types (id, leave_type_name, hr_organization_id, requires_eligibility) VALUES
  ('${T_PHD}', 'PH.D', '${ORG_A}', true), ('${T_WFH}', 'Work From Home', '${ORG_A}', true),
  ('${T_CL}', 'Casual Leave', '${ORG_A}', false),
  ('${T_WFH_B}', 'Work From Home', '${ORG_B}', true), ('${T_TWO}', 'Sabbatical', '${ORG_A}', true),
  ('${T_DIRPIN}', 'Study Leave', '${ORG_A}', true), ('${T_THREE}', 'Research Leave', '${ORG_A}', true);
INSERT INTO public.hr_approval_flows (id, hr_organization_id, flow_for, flow_name, conditions, steps) VALUES
  ('${FLOW_PHD}', '${ORG_A}', 'leave_eligibility', 'PH.D proof',
   '{"leave_type_id":"${T_PHD}"}',
   '[{"approver_role":"hod","chain_order":1},{"approver_role":"hr_head","chain_order":2,"step_type":"final"}]'),
  ('${FLOW_TWO}', '${ORG_A}', 'leave_eligibility', 'Sabbatical proof',
   '{"leave_type_id":"${T_TWO}"}',
   '[{"approver_role":"hr_head","chain_order":1},{"approver_role":"hod","chain_order":2},{"approver_role":"hr_head","chain_order":3,"step_type":"final"}]'),
  ('${FLOW_DIRPIN}', '${ORG_A}', 'leave_eligibility', 'Study proof',
   '{"leave_type_id":"${T_DIRPIN}"}',
   '[{"approver_user_id":"${P_DIRECTOR}","chain_order":1,"step_type":"final"}]'),
  ('${FLOW_THREE}', '${ORG_A}', 'leave_eligibility', 'Research proof',
   '{"leave_type_id":"${T_THREE}"}',
   '[{"approver_role":"hod","chain_order":1,"step_type":"review"},{"approver_role":"hr_head","chain_order":2,"step_type":"final"},{"approver_role":"hod","chain_order":3,"step_type":"review"}]');
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PGOPTIONS: '-c check_function_bodies=off -c client_min_messages=warning' },
  });
}

type Who = { uid: string; super?: boolean; perms?: string[]; insts?: string[] };
type Step = { who?: Who; sql: string; params?: unknown[] };

const ASKER: Who = { uid: P_ASKER, insts: [INST_A] };
const HOD: Who = { uid: P_HOD, insts: [INST_A] };
const HRHEAD: Who = {
  uid: P_HRHEAD, perms: ['hr.leave.approve', 'hr.leave.types.manage'], insts: [INST_A, INST_B],
};
const DIRECTOR: Who = { uid: P_DIRECTOR, insts: [] };
/** An admin with every power except being on the Director list. */
const SUPER_NOT_DIRECTOR: Who = { ...HRHEAD, super: true };
/** Another HR manager with every college in reach, on no chain. */
const HR2: Who = { uid: P_HR2, perms: ['hr.leave.approve', 'hr.leave.types.manage'], insts: [INST_A, INST_B] };
/** A super admin filing or deciding their OWN row. */
const SUPER_SELF: Who = { ...ASKER, super: true };
const MEMBER_B: Who = { uid: P_B, insts: [INST_B] };

let client: Client;

/**
 * Steps in ONE transaction that is always rolled back. A step with no `who`
 * runs as the owner with nobody signed in (a migration / the SQL console).
 */
async function tx(steps: Step[]) {
  const rows: Record<string, unknown>[][] = [];
  await client.query('BEGIN');
  try {
    for (const s of steps) {
      await client.query('RESET ROLE');
      const w = s.who;
      await client.query(
        `SELECT set_config('test.uid', $1, true), set_config('test.super', $2, true),
                set_config('test.perms', $3, true), set_config('test.insts', $4, true),
                set_config('test.jwt_role', $5, true)`,
        [w?.uid ?? '', w?.super ? 'on' : '', (w?.perms ?? []).join(','), (w?.insts ?? []).join(','),
          w ? 'authenticated' : '']
      );
      if (w) await client.query('SET LOCAL ROLE authenticated');
      rows.push((await client.query(s.sql, s.params ?? [])).rows);
    }
    return { rows, error: null as string | null };
  } catch (e) {
    return { rows, error: (e as Error).message };
  } finally {
    await client.query('ROLLBACK');
  }
}

/** The request the app files (no chain sent), plus any forged columns. */
const request = (member: string, type: string, org: string, extra: Record<string, string> = {}, status = 'pending') => {
  const cols = Object.keys(extra).map((c) => `, ${c}`).join('');
  const vals = Object.values(extra).map((v) => `, ${v}`).join('');
  return `INSERT INTO public.hr_leave_eligibilities
     (employee_id, leave_type_id, hr_organization_id, status, documents${cols})
   VALUES ('${member}', '${type}', '${org}', '${status}', '[{"file_id":"f1"}]'${vals})
   RETURNING id, approval_chain, current_step, status, created_by, entitled_days`;
};

const FORGED_CHAIN = JSON.stringify([
  { step_order: 1, approver_role: 'hr_approver', approver_user_id: P_ASKER,
    approvers: [{ approver_role: null, approver_user_id: P_ASKER }], decisions: [], status: 'pending' },
]);

/** A row written by the owner, as a legacy request already in flight would be. */
const legacy = (rowId: string, member: string, chain: unknown[], type = T_PHD) =>
  `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, approval_chain, current_step)
   VALUES ('${rowId}', '${member}', '${type}', '${ORG_A}', 'pending', '${JSON.stringify(chain)}', 0)`;

/** Exactly what LeaveEligibilityService.decide() writes for an approval. */
const decide = (
  rowId: string, by: string, opts: { advance: boolean; approve: boolean }, where = `id = '${rowId}'`
) => `
  UPDATE public.hr_leave_eligibilities SET
    approval_chain = jsonb_set(approval_chain, ARRAY[current_step::text],
      (approval_chain -> current_step) || jsonb_build_object(
        'decisions', jsonb_build_array(jsonb_build_object('by', '${by}', 'at', now()::text,
                       'decision', '${opts.approve ? 'approved' : 'rejected'}', 'comment', NULL)),
        'status', '${opts.approve ? 'approved' : 'rejected'}', 'decided_at', now()::text,
        'decided_by', '${by}', 'comment', NULL)),
    current_step = current_step + ${opts.advance ? 1 : 0},
    status = '${!opts.approve ? 'rejected' : opts.advance ? 'pending' : 'approved'}',
    decided_by = '${by}', decided_at = now(), decision_note = NULL, updated_at = now()
  WHERE ${where}
  RETURNING id, status, current_step`;

const pinned = (uid: string) => ({
  step_order: 1, approver_role: 'hr_approver', approver_user_id: uid,
  approvers: [{ approver_role: null, approver_user_id: uid }], decisions: [], status: 'pending', step_type: 'final',
});
const roleStep = (order: number, role: string, final = false) => ({
  step_order: order, approver_role: role, approver_user_id: null,
  approvers: [{ approver_role: role, approver_user_id: null }], decisions: [], status: 'pending',
  ...(final ? { step_type: 'final' } : {}),
});

const approverOf = (step: Record<string, unknown>) =>
  (step.approvers as Array<{ approver_role: string | null; approver_user_id: string | null }>)[0];

const DROP_INSERT_TRIGGER = 'DROP TRIGGER trg_hle_system_chain ON public.hr_leave_eligibilities';
const DROP_UPDATE_TRIGGER = 'DROP TRIGGER trg_hle_guard_update ON public.hr_leave_eligibilities';

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-c', PRE_SEED]);
  for (const f of MIGRATIONS) psql(['-d', DBNAME, '-f', f]);
  psql(['-d', DBNAME, '-c', SEED]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
});
afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('the Director self-route row', () => {
  it('is seeded from the one confirmed account for director@jkkn.ac.in', async () => {
    const r = await tx([{ sql: `SELECT value #>> '{}' AS v FROM public.platform_policies
      WHERE policy_key = 'hr.leave.eligibility_self_route_profile_id'` }]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual([{ v: P_DIRECTOR }]);
  });

  it('re-running the migration leaves it as it is (safe to run twice)', () => {
    expect(() => psql(['-d', DBNAME, '-f', MIGRATIONS[MIGRATIONS.length - 1]])).not.toThrow();
  });
});

describe('only the Director list can change the self-route row', () => {
  const KEY = `policy_key = 'hr.leave.eligibility_self_route_profile_id'`;
  const setTo = (v: string) =>
    `UPDATE public.platform_policies SET value = to_jsonb('${v}'::text) WHERE ${KEY} RETURNING value #>> '{}' AS v, updated_by`;
  const insertRow = (v: string) =>
    `INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type)
     VALUES ('hr.leave.eligibility_self_route_profile_id', 'global', NULL, to_jsonb('${v}'::text), 'string') RETURNING id`;
  const removeRow = `DELETE FROM public.platform_policies WHERE ${KEY} RETURNING id`;
  const NOT_DIRECTOR = /Only the Director can change who decides leave eligibility requests/;

  it('a super admin who is not on the list cannot change, remove or add it', async () => {
    const change = await tx([{ who: SUPER_NOT_DIRECTOR, sql: setTo(P_HRHEAD) }]);
    expect(change.error).toMatch(NOT_DIRECTOR);
    const remove = await tx([{ who: SUPER_NOT_DIRECTOR, sql: removeRow }]);
    expect(remove.error).toMatch(NOT_DIRECTOR);
    const add = await tx([
      { sql: `DELETE FROM public.platform_policies WHERE ${KEY}` },
      { who: SUPER_NOT_DIRECTOR, sql: insertRow(P_HRHEAD) },
    ]);
    expect(add.error).toMatch(NOT_DIRECTOR);
  });

  it('an HR Head (who manages leave types) cannot change it either', async () => {
    const r = await tx([{ who: HRHEAD, sql: setTo(P_HRHEAD) }]);
    expect(r.error).toMatch(NOT_DIRECTOR);
  });

  it('non-vacuity: without the guard that super admin rewrites it', async () => {
    const r = await tx([
      { sql: 'DROP TRIGGER trg_guard_hr_leave_eligibility_self_route ON public.platform_policies' },
      { who: SUPER_NOT_DIRECTOR, sql: setTo(P_HRHEAD) },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toMatchObject([{ v: P_HRHEAD }]);
  });

  const ADD_DEPUTY_TO_LIST = `UPDATE public.platform_policies SET value = '["${P_DIRECTOR}","${P_DEPUTY}"]'::jsonb
    WHERE policy_key = 'platform.the_director_profile_ids'`;

  it('someone on the list can change it, and requests then go to the person named', async () => {
    const r = await tx([
      { sql: ADD_DEPUTY_TO_LIST },
      { who: DIRECTOR, sql: setTo(P_DEPUTY.toUpperCase()) },
      { who: HOD, sql: request(S_HOD, T_PHD, ORG_A) },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toEqual([{ v: P_DEPUTY, updated_by: P_DIRECTOR }]);
    const chain = (r.rows[2][0] as { approval_chain: Record<string, unknown>[] }).approval_chain;
    expect(approverOf(chain[0]).approver_user_id).toBe(P_DEPUTY);
  });

  it('a person named who is not (or no longer) on the Director list decides nothing: such requests are refused', async () => {
    const notOnList = await tx([
      { who: DIRECTOR, sql: setTo(P_DEPUTY) },
      { who: HOD, sql: request(S_HOD, T_PHD, ORG_A) },
    ]);
    expect(notOnList.error).toMatch(/contact HR/);
    const droppedOff = await tx([
      { sql: `UPDATE public.platform_policies SET value = '["${P_DEPUTY}"]'::jsonb
              WHERE policy_key = 'platform.the_director_profile_ids'` },
      { who: HOD, sql: request(S_HOD, T_PHD, ORG_A) },
    ]);
    expect(droppedOff.error).toMatch(/contact HR/);
  });

  it('someone on the list can remove it or switch it off, and such requests are then refused', async () => {
    const removed = await tx([
      { who: DIRECTOR, sql: removeRow },
      { who: HOD, sql: request(S_HOD, T_PHD, ORG_A) },
    ]);
    expect(removed.rows[0]).toHaveLength(1);
    expect(removed.error).toMatch(/contact HR/);
    const off = await tx([
      { who: DIRECTOR, sql: `UPDATE public.platform_policies SET is_active = false WHERE ${KEY}` },
      { who: HOD, sql: request(S_HOD, T_PHD, ORG_A) },
    ]);
    expect(off.error).toMatch(/contact HR/);
  });

  it('someone on the list can add it back', async () => {
    const r = await tx([
      { sql: `DELETE FROM public.platform_policies WHERE ${KEY}` },
      { who: DIRECTOR, sql: insertRow(P_DIRECTOR) },
    ]);
    expect(r.error).toBeNull();
  });

  it('it must name one existing account, for the whole group', async () => {
    const unknown = await tx([{ who: DIRECTOR, sql: setTo(id(999)) }]);
    expect(unknown.error).toMatch(/No account has the id/);
    const notAnId = await tx([{ who: DIRECTOR, sql: setTo('the director') }]);
    expect(notAnId.error).toMatch(/must be one profile id/);
    const oneCollege = await tx([{
      who: DIRECTOR,
      sql: `UPDATE public.platform_policies SET scope_type = 'institution', scope_id = '${INST_A}' WHERE ${KEY}`,
    }]);
    expect(oneCollege.error).toMatch(/one setting for the whole group/);
  });
});

describe('the system builds the chain (ruling 1)', () => {
  it('a chain the asker sends is thrown away and replaced by the flow set for the type', async () => {
    const r = await tx([{ who: ASKER, sql: request(S_ASKER, T_PHD, ORG_A, { approval_chain: `'${FORGED_CHAIN}'::jsonb` }) }]);
    expect(r.error).toBeNull();
    const row = r.rows[0][0] as { approval_chain: Record<string, unknown>[]; created_by: string };
    expect(row.approval_chain.map((s) => approverOf(s).approver_role)).toEqual(['hod', 'hr_head']);
    expect(row.approval_chain.some((s) => approverOf(s).approver_user_id === P_ASKER)).toBe(false);
    expect(row.created_by).toBe(P_ASKER);
  });

  it('non-vacuity: without the trigger the forged chain is stored as sent', async () => {
    const r = await tx([
      { sql: DROP_INSERT_TRIGGER },
      { who: ASKER, sql: request(S_ASKER, T_PHD, ORG_A, { approval_chain: `'${FORGED_CHAIN}'::jsonb` }) },
    ]);
    expect(r.error).toBeNull();
    const row = r.rows[1][0] as { approval_chain: Record<string, unknown>[] };
    expect(approverOf(row.approval_chain[0]).approver_user_id).toBe(P_ASKER);
  });

  it('current_step is forced to 0 and the asker cannot set their own day count', async () => {
    const r = await tx([{ who: ASKER, sql: request(S_ASKER, T_PHD, ORG_A, { current_step: '1', entitled_days: '365' }) }]);
    expect(r.error).toBeNull();
    expect(r.rows[0][0]).toMatchObject({ current_step: 0, status: 'pending', entitled_days: null });
  });

  it('a request covers leave from the filing day: a back-dated valid_from is overwritten', async () => {
    const r = await tx([{
      who: ASKER,
      sql: request(S_ASKER, T_PHD, ORG_A, { valid_from: 'CURRENT_DATE - 30' }).replace(
        'RETURNING id,', 'RETURNING valid_from = CURRENT_DATE AS from_today, id,'),
    }]);
    expect(r.error).toBeNull();
    expect(r.rows[0][0]).toMatchObject({ from_today: true });
  });

  it('the asker cannot file an approved row or a direct grant for themselves', async () => {
    const approved = await tx([{ who: ASKER, sql: request(S_ASKER, T_PHD, ORG_A, {}, 'approved') }]);
    expect(approved.error).toMatch(/cannot grant eligibility to yourself/);
    // An HR Head (a manager) gets the same answer for their own row.
    const selfGrant = await tx([{ who: HRHEAD, sql: request(S_HRHEAD, T_PHD, ORG_A, { granted_directly: 'true' }, 'approved') }]);
    expect(selfGrant.error).toMatch(/cannot grant eligibility to yourself/);
  });

  it("a request filed under another college's organisation is refused", async () => {
    const r = await tx([{ who: ASKER, sql: request(S_ASKER, T_PHD, ORG_B) }]);
    expect(r.error).toMatch(/own institution/);
  });

  it('a request for somebody else by a non-manager is refused', async () => {
    const r = await tx([{ who: ASKER, sql: request(S_HOD, T_PHD, ORG_A) }]);
    expect(r.error).toMatch(/only request eligibility for yourself/);
  });

  it('no flow for the type = one step, the HR Head (ruling 3)', async () => {
    const r = await tx([{ who: ASKER, sql: request(S_ASKER, T_WFH, ORG_A) }]);
    expect(r.error).toBeNull();
    const chain = (r.rows[0][0] as { approval_chain: Record<string, unknown>[] }).approval_chain;
    expect(chain).toHaveLength(1);
    expect(approverOf(chain[0])).toMatchObject({ approver_role: 'hr_head', approver_user_id: null });
    expect(chain[0].step_type).toBe('final');
  });
});

describe('a step the asker could clear goes to the Director (ruling 2)', () => {
  it('a HOD asking: the HOD step becomes one step pinned to the Director', async () => {
    const r = await tx([{ who: HOD, sql: request(S_HOD, T_PHD, ORG_A) }]);
    expect(r.error).toBeNull();
    const chain = (r.rows[0][0] as { approval_chain: Record<string, unknown>[] }).approval_chain;
    expect(chain).toHaveLength(2);
    expect(chain[0].approvers).toEqual([{ approver_role: null, approver_user_id: P_DIRECTOR, approver_name: 'Director' }]);
    // The top-level fields agree. approver_role keeps the 'hr_approver'
    // placeholder every pinned step carries (LeaveApprovalStep types it as a string).
    expect(chain[0]).toMatchObject({ approver_user_id: P_DIRECTOR, approver_name: 'Director', approver_role: 'hr_approver' });
    expect(approverOf(chain[1]).approver_role).toBe('hr_head');
  });

  it('an HR Head asking (a manager): the HR Head step becomes the Director, and keeps its final flag', async () => {
    const r = await tx([{ who: HRHEAD, sql: request(S_HRHEAD, T_PHD, ORG_A) }]);
    expect(r.error).toBeNull();
    const chain = (r.rows[0][0] as { approval_chain: Record<string, unknown>[] }).approval_chain;
    expect(approverOf(chain[0]).approver_role).toBe('hod');
    expect(approverOf(chain[1]).approver_user_id).toBe(P_DIRECTOR);
    expect(chain[1].step_type).toBe('final');
  });

  it('no Director row = the request is refused (fail closed)', async () => {
    const r = await tx([
      { sql: `DELETE FROM public.platform_policies WHERE policy_key = 'hr.leave.eligibility_self_route_profile_id'` },
      { who: HOD, sql: request(S_HOD, T_PHD, ORG_A) },
    ]);
    expect(r.error).toMatch(/contact HR/);
  });

  it("the request is on the Director's queue and he decides it; the HOD still cannot decide the rest", async () => {
    const mine = `employee_id = '${S_HOD}'`;
    const r = await tx([
      { who: HOD, sql: request(S_HOD, T_PHD, ORG_A) },
      { who: DIRECTOR, sql: `SELECT id FROM public.hr_leave_eligibilities WHERE ${mine} AND status = 'pending'` },
      { who: DIRECTOR, sql: decide('', P_DIRECTOR, { advance: true, approve: true }, mine) },
      { who: HOD, sql: decide('', P_HOD, { advance: false, approve: true }, mine) },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toHaveLength(1); // RLS: his pinned step puts it on his list
    expect(r.rows[2]).toMatchObject([{ status: 'pending', current_step: 1 }]);
    // The next step is the HR Head's; the HOD does not even reach the row.
    expect(r.rows[3]).toEqual([]);
  });
});

describe('deciding (ruling 4)', () => {
  const ROW = id(901);
  const SELF_CHAIN = [pinned(P_ASKER)];
  const REAL_CHAIN = [roleStep(1, 'hod'), roleStep(2, 'hr_head', true)];

  it('the asker cannot approve their own request even when the chain names them', async () => {
    const r = await tx([
      { sql: legacy(ROW, S_ASKER, SELF_CHAIN) },
      { who: ASKER, sql: decide(ROW, P_ASKER, { advance: false, approve: true }) },
    ]);
    expect(r.error).toMatch(/cannot decide on your own eligibility request/);
  });

  it('non-vacuity: without the trigger that same self-approval goes through', async () => {
    const r = await tx([
      { sql: DROP_UPDATE_TRIGGER },
      { sql: legacy(ROW, S_ASKER, SELF_CHAIN) },
      { who: ASKER, sql: decide(ROW, P_ASKER, { advance: false, approve: true }) },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[2]).toEqual([{ id: ROW, status: 'approved', current_step: 0 }]);
  });

  it('an HR Head cannot approve their own request through the HR edit rule either', async () => {
    const r = await tx([
      { sql: legacy(ROW, S_HRHEAD, REAL_CHAIN) },
      { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET status = 'approved' WHERE id = '${ROW}' RETURNING id` },
    ]);
    expect(r.error).toMatch(/cannot decide on your own eligibility request/);
  });

  it('an approver cannot change anything but the decision', async () => {
    for (const change of [
      `entitled_days = 365`,
      `leave_type_id = '${T_WFH}'`,
      `documents = '[{"file_id":"swapped"}]'::jsonb`,
      `reason = 'rewritten'`,
      `valid_until = CURRENT_DATE + 3650`,
      `approval_chain = jsonb_set(approval_chain, '{1,approvers}', '[{"approver_role":null,"approver_user_id":"${P_HOD}"}]')`,
    ]) {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL_CHAIN) },
        { who: HOD, sql: `UPDATE public.hr_leave_eligibilities SET ${change} WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect({ change, error: r.error }).toMatchObject({ change, error: expect.stringMatching(/can only (record|decide)/) });
    }
  });

  it('non-vacuity: without the trigger the approver rewrites the day count', async () => {
    const r = await tx([
      { sql: DROP_UPDATE_TRIGGER },
      { sql: legacy(ROW, S_ASKER, REAL_CHAIN) },
      { who: HOD, sql: `UPDATE public.hr_leave_eligibilities SET entitled_days = 365 WHERE id = '${ROW}' RETURNING id` },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[2]).toHaveLength(1);
  });

  it('an approver on the first step cannot grant the whole request', async () => {
    const r = await tx([
      { sql: legacy(ROW, S_ASKER, REAL_CHAIN) },
      { who: HOD, sql: decide(ROW, P_HOD, { advance: false, approve: true }) },
    ]);
    expect(r.error).toMatch(/Only the last approver/);
  });

  it('the real approvers approve, step by step, and the type opens up', async () => {
    const r = await tx([
      { sql: legacy(ROW, S_ASKER, REAL_CHAIN) },
      { who: HOD, sql: decide(ROW, P_HOD, { advance: true, approve: true }) },
      { who: HRHEAD, sql: decide(ROW, P_HRHEAD, { advance: false, approve: true }) },
      { who: ASKER, sql: `SELECT public.fn_hr_leave_eligibility_ok('${S_ASKER}', '${T_PHD}') AS ok` },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toEqual([{ id: ROW, status: 'pending', current_step: 1 }]);
    expect(r.rows[2]).toEqual([{ id: ROW, status: 'approved', current_step: 1 }]);
    expect(r.rows[3]).toEqual([{ ok: true }]);
  });

  it('a rejection by the step approver is recorded', async () => {
    const r = await tx([
      { sql: legacy(ROW, S_ASKER, REAL_CHAIN) },
      { who: HOD, sql: decide(ROW, P_HOD, { advance: false, approve: false }) },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toEqual([{ id: ROW, status: 'rejected', current_step: 0 }]);
  });

  it('there is no withdraw path in the app, so the asker cannot touch their own pending row', async () => {
    const r = await tx([
      { sql: legacy(ROW, S_ASKER, [pinned(P_ASKER)]) },
      { who: ASKER, sql: `UPDATE public.hr_leave_eligibilities SET reason = 'x' WHERE id = '${ROW}' RETURNING id` },
    ]);
    expect(r.error).toMatch(/cannot decide on your own/);
  });
});

describe('HR still records grants for other people', () => {
  it('an HR Head grants directly, and the row is kept as sent', async () => {
    const r = await tx([{
      who: HRHEAD,
      sql: `INSERT INTO public.hr_leave_eligibilities (employee_id, leave_type_id, hr_organization_id, status, granted_directly, entitled_days, decided_at)
            VALUES ('${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true, 12, now())
            RETURNING status, granted_directly, entitled_days::int AS days, approval_chain`,
    }]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual([{ status: 'approved', granted_directly: true, days: 12, approval_chain: [] }]);
  });

  it('and revokes it', async () => {
    const r = await tx([
      { sql: `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly)
              VALUES ('${id(902)}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true)` },
      { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET status = 'revoked', revoked_by = '${P_HRHEAD}',
              revoked_at = now(), revoke_reason = 'ended' WHERE id = '${id(902)}' RETURNING status` },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toEqual([{ status: 'revoked' }]);
  });
});

describe('a gated leave type needs approved eligibility in the database too (ruling 7)', () => {
  const apply = (type: string) =>
    `INSERT INTO public.hr_leave_applications (employee_id, leave_type_id, hr_organization_id)
     VALUES ('${S_ASKER}', '${type}', '${ORG_A}') RETURNING id`;

  it('refused without eligibility', async () => {
    const r = await tx([{ who: ASKER, sql: apply(T_PHD) }]);
    expect(r.error).toMatch(/PH\.D is only open to team members whose eligibility has been approved/);
  });

  it('allowed with an approved, in-date eligibility', async () => {
    const r = await tx([
      { sql: `INSERT INTO public.hr_leave_eligibilities (employee_id, leave_type_id, hr_organization_id, status, granted_directly)
              VALUES ('${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true)` },
      { who: ASKER, sql: apply(T_PHD) },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toHaveLength(1);
  });

  it('refused when the eligibility has lapsed', async () => {
    const r = await tx([
      { sql: `INSERT INTO public.hr_leave_eligibilities (employee_id, leave_type_id, hr_organization_id, status, granted_directly, valid_from, valid_until)
              VALUES ('${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true, CURRENT_DATE - 30, CURRENT_DATE - 1)` },
      { who: ASKER, sql: apply(T_PHD) },
    ]);
    expect(r.error).toMatch(/only open to team members/);
  });

  it('an ungated type is not affected', async () => {
    const r = await tx([{ who: ASKER, sql: apply(T_CL) }]);
    expect(r.error).toBeNull();
  });

  it('switching an existing application onto a gated type is refused', async () => {
    const r = await tx([
      { who: ASKER, sql: apply(T_CL) },
      { who: ASKER, sql: `UPDATE public.hr_leave_applications SET leave_type_id = '${T_PHD}' RETURNING id` },
    ]);
    expect(r.error).toMatch(/only open to team members/);
  });
});

describe('review round 2', () => {
  const ROW = id(911);
  type Chain = Record<string, unknown>[];
  const chainOf = (rows: Record<string, unknown>[]) => (rows[0] as { approval_chain: Chain }).approval_chain;

  describe('nobody approves or grants their own eligibility, super admins included', () => {
    it('a super admin cannot file an approved row or a direct grant for themselves', async () => {
      const grant = await tx([{ who: SUPER_SELF, sql: request(S_ASKER, T_PHD, ORG_A, { granted_directly: 'true' }, 'approved') }]);
      expect(grant.error).toMatch(/cannot grant eligibility to yourself/);
      const approved = await tx([{ who: SUPER_SELF, sql: request(S_ASKER, T_PHD, ORG_A, {}, 'approved') }]);
      expect(approved.error).toMatch(/cannot grant eligibility to yourself/);
    });

    it('a super admin who files for themselves gets a request with the built chain', async () => {
      const r = await tx([{ who: SUPER_SELF, sql: request(S_ASKER, T_PHD, ORG_A, { approval_chain: `'${FORGED_CHAIN}'::jsonb` }) }]);
      expect(r.error).toBeNull();
      expect(chainOf(r.rows[0]).map((s) => approverOf(s).approver_role)).toEqual(['hod', 'hr_head']);
    });

    it('a super admin cannot approve, or edit, their own row', async () => {
      const decided = await tx([
        { sql: legacy(ROW, S_ASKER, [pinned(P_ASKER)]) },
        { who: SUPER_SELF, sql: decide(ROW, P_ASKER, { advance: false, approve: true }) },
      ]);
      expect(decided.error).toMatch(/cannot decide on your own eligibility request/);
      const edited = await tx([
        { sql: legacy(ROW, S_ASKER, [roleStep(1, 'hod', true)]) },
        { who: SUPER_SELF, sql: `UPDATE public.hr_leave_eligibilities SET status = 'approved', granted_directly = true WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(edited.error).toMatch(/cannot decide on your own eligibility request/);
    });

    it("a super admin keeps full power over somebody else's decided row, and decides their pending steps", async () => {
      const edit = await tx([
        { sql: `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly)
                VALUES ('${ROW}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true)` },
        { who: SUPER_NOT_DIRECTOR, sql: `UPDATE public.hr_leave_eligibilities SET entitled_days = 10, valid_until = CURRENT_DATE + 30 WHERE id = '${ROW}' RETURNING entitled_days::int AS d` },
      ]);
      expect(edit.error).toBeNull();
      expect(edit.rows[1]).toEqual([{ d: 10 }]);
      const decide1 = await tx([
        { sql: legacy(ROW, S_HOD, [roleStep(1, 'hr_head', true)]) },
        { who: SUPER_NOT_DIRECTOR, sql: decide(ROW, P_HRHEAD, { advance: false, approve: true }) },
      ]);
      expect(decide1.error).toBeNull();
      expect(decide1.rows[1]).toMatchObject([{ status: 'approved' }]);
    });
  });

  describe('the application gate', () => {
    const app = (type: string, from: string, to: string, status = 'pending') =>
      `INSERT INTO public.hr_leave_applications (employee_id, leave_type_id, hr_organization_id, status, start_date, end_date)
       VALUES ('${S_ASKER}', '${type}', '${ORG_A}', '${status}', ${from}, ${to}) RETURNING id`;
    const grant = (from: string, to: string) =>
      `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly, valid_from, valid_until)
       VALUES ('${ROW}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true, ${from}, ${to})`;

    it('cancelling an approved leave still works after the eligibility is revoked (the cancelled clone)', async () => {
      const r = await tx([
        { sql: grant('CURRENT_DATE', 'NULL') },
        { who: ASKER, sql: app(T_PHD, 'CURRENT_DATE + 1', 'CURRENT_DATE + 2') },
        { sql: `UPDATE public.hr_leave_applications SET status = 'approved'` },
        { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET status = 'revoked', revoked_by = '${P_HRHEAD}', revoked_at = now(), revoke_reason = 'ended' WHERE id = '${ROW}'` },
        // LeaveService.cancelApplication: a clone of the approved row, status 'cancelled'.
        { who: ASKER, sql: app(T_PHD, 'CURRENT_DATE + 1', 'CURRENT_DATE + 2', 'cancelled') },
      ]);
      expect(r.error).toBeNull();
      expect(r.rows[4]).toHaveLength(1);
    });

    it('withdrawn and rejected rows are never blocked; open and granted ones are', async () => {
      for (const status of ['withdrawn', 'rejected']) {
        const r = await tx([{ who: ASKER, sql: app(T_PHD, 'CURRENT_DATE', 'CURRENT_DATE', status) }]);
        expect({ status, error: r.error }).toEqual({ status, error: null });
      }
      for (const status of ['pending', 'escalated', 'approved']) {
        const r = await tx([{ who: ASKER, sql: app(T_PHD, 'CURRENT_DATE', 'CURRENT_DATE', status) }]);
        expect({ status, error: r.error }).toMatchObject({ status, error: expect.stringMatching(/only open to team members/) });
      }
    });

    it("the eligibility must cover the leave's own dates, not today", async () => {
      // Valid from next week: a leave next week is fine, though today is not covered.
      const future = await tx([
        { sql: grant('CURRENT_DATE + 5', 'CURRENT_DATE + 30') },
        { who: ASKER, sql: app(T_PHD, 'CURRENT_DATE + 6', 'CURRENT_DATE + 7') },
      ]);
      expect(future.error).toBeNull();
      // Valid today, but the leave runs past its end.
      const past = await tx([
        { sql: grant('CURRENT_DATE', 'CURRENT_DATE + 10') },
        { who: ASKER, sql: app(T_PHD, 'CURRENT_DATE + 9', 'CURRENT_DATE + 12') },
      ]);
      expect(past.error).toMatch(/only open to team members whose eligibility has been approved for these dates/);
      // Valid today, leave before it starts.
      const before = await tx([
        { sql: grant('CURRENT_DATE', 'NULL') },
        { who: ASKER, sql: app(T_PHD, 'CURRENT_DATE - 3', 'CURRENT_DATE - 2') },
      ]);
      expect(before.error).toMatch(/only open to team members/);
    });

    it('moving an open leave onto dates the eligibility does not cover is refused', async () => {
      const r = await tx([
        { sql: grant('CURRENT_DATE', 'CURRENT_DATE + 10') },
        { who: ASKER, sql: app(T_PHD, 'CURRENT_DATE + 1', 'CURRENT_DATE + 2') },
        { who: ASKER, sql: `UPDATE public.hr_leave_applications SET end_date = CURRENT_DATE + 20 RETURNING id` },
      ]);
      expect(r.error).toMatch(/only open to team members/);
    });
  });

  describe('a request routed to the Director is decided by the Director only', () => {
    it("the COO's own no-flow request goes to the Director; another HR manager and a super admin cannot decide it; he can", async () => {
      const mine = `employee_id = '${S_HRHEAD}'`;
      const filed = await tx([{ who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) }]);
      expect(filed.error).toBeNull();
      const chain = chainOf(filed.rows[0]);
      expect(chain).toHaveLength(1);
      expect(approverOf(chain[0])).toMatchObject({ approver_role: null, approver_user_id: P_DIRECTOR });
      expect(chain[0]).toMatchObject({ step_type: 'final', self_routed: true });

      const byHr2 = await tx([
        { who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) },
        { who: HR2, sql: decide('', P_HR2, { advance: false, approve: true }, mine) },
      ]);
      expect(byHr2.error).toMatch(/waiting on someone else/);

      const hr2Edit = await tx([
        { who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) },
        { who: HR2, sql: `UPDATE public.hr_leave_eligibilities SET status = 'approved' WHERE ${mine} RETURNING id` },
      ]);
      expect(hr2Edit.error).toMatch(/waiting on someone else|can only/);

      const hr2Rewrite = await tx([
        { who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) },
        { who: HR2, sql: `UPDATE public.hr_leave_eligibilities SET approval_chain = '${JSON.stringify([roleStep(1, 'hr_head', true)])}'::jsonb WHERE ${mine} RETURNING id` },
      ]);
      expect(hr2Rewrite.error).toMatch(/can only decide the step/);

      const bySuper = await tx([
        { who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) },
        { who: { ...HR2, super: true }, sql: decide('', P_HR2, { advance: false, approve: true }, mine) },
      ]);
      expect(bySuper.error).toMatch(/waiting on someone else/);

      const byDirector = await tx([
        { who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) },
        { who: DIRECTOR, sql: decide('', P_DIRECTOR, { advance: false, approve: true }, mine) },
      ]);
      expect(byDirector.error).toBeNull();
      expect(byDirector.rows[1]).toMatchObject([{ status: 'approved' }]);
    });

    it('on an ordinary pending request too, HR cannot flip it to approved without being its approver', async () => {
      const r = await tx([
        { who: ASKER, sql: request(S_ASKER, T_WFH, ORG_A) },
        { who: HR2, sql: `UPDATE public.hr_leave_eligibilities SET status = 'approved' WHERE employee_id = '${S_ASKER}' RETURNING status` },
      ]);
      expect(r.error).toMatch(/waiting on someone else/);
      const bySuper = await tx([
        { who: ASKER, sql: request(S_ASKER, T_WFH, ORG_A) },
        { who: { ...HR2, super: true }, sql: `UPDATE public.hr_leave_eligibilities SET entitled_days = 365 WHERE employee_id = '${S_ASKER}' RETURNING status` },
      ]);
      expect(bySuper.error).toMatch(/can only record a decision/);
    });

    it('several steps the asker could clear become ONE Director step, last, and final', async () => {
      const r = await tx([{ who: HRHEAD, sql: request(S_HRHEAD, T_TWO, ORG_A) }]);
      expect(r.error).toBeNull();
      const chain = chainOf(r.rows[0]);
      expect(chain.map((s) => approverOf(s).approver_role ?? approverOf(s).approver_user_id)).toEqual(['hod', P_DIRECTOR]);
      expect(chain[1]).toMatchObject({ step_type: 'final', self_routed: true });
    });
  });

  describe('the HR Head of the asker\'s own college, with group reach (ruling 3)', () => {
    it('the COO receives a no-flow request from another college and decides it', async () => {
      const mine = `employee_id = '${S_B}'`;
      const r = await tx([
        { who: MEMBER_B, sql: request(S_B, T_WFH_B, ORG_B) },
        // On his queue as the step's approver, not only through his HR edit rights.
        { who: HRHEAD, sql: `SELECT public.fn_is_designated_eligibility_approver(id) AS ok FROM public.hr_leave_eligibilities WHERE ${mine}` },
        { who: HRHEAD, sql: decide('', P_HRHEAD, { advance: false, approve: true }, mine) },
      ]);
      expect(r.error).toBeNull();
      expect(approverOf(chainOf(r.rows[0])[0])).toMatchObject({ approver_role: 'hr_head', approver_user_id: null });
      expect(r.rows[1]).toEqual([{ ok: true }]);
      expect(r.rows[2]).toMatchObject([{ status: 'approved' }]);
    });
  });

  describe('what HR files for someone else', () => {
    it('refused when the person does not belong to the institution named on the row', async () => {
      const grantB = await tx([{
        who: HRHEAD,
        sql: `INSERT INTO public.hr_leave_eligibilities (employee_id, leave_type_id, hr_organization_id, status, granted_directly)
              VALUES ('${S_ASKER}', '${T_PHD}', '${ORG_B}', 'approved', true) RETURNING id`,
      }]);
      expect(grantB.error).toMatch(/does not belong to the institution/);
      const requestB = await tx([{ who: HRHEAD, sql: request(S_ASKER, T_PHD, ORG_B) }]);
      expect(requestB.error).toMatch(/does not belong to the institution/);
    });

    it('a pending request HR files on someone\'s behalf gets the system chain, not an empty one', async () => {
      const r = await tx([{ who: HR2, sql: request(S_ASKER, T_PHD, ORG_A, { approval_chain: `'${FORGED_CHAIN}'::jsonb` }) }]);
      expect(r.error).toBeNull();
      expect(chainOf(r.rows[0]).map((s) => approverOf(s).approver_role)).toEqual(['hod', 'hr_head']);
      expect(r.rows[0][0]).toMatchObject({ current_step: 0, status: 'pending', created_by: P_HR2 });
    });

    it('and a step the person it is for could clear still goes to the Director', async () => {
      const r = await tx([{ who: HR2, sql: request(S_HOD, T_PHD, ORG_A) }]);
      expect(r.error).toBeNull();
      expect(approverOf(chainOf(r.rows[0])[0]).approver_user_id).toBe(P_DIRECTOR);
    });
  });

  describe('a decision is recorded under the decider\'s own name', () => {
    const REAL = [roleStep(1, 'hod'), roleStep(2, 'hr_head', true)];
    it("an approver cannot record the step under someone else's name", async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: decide(ROW, P_HRHEAD, { advance: true, approve: true }).replace(`decided_by = '${P_HRHEAD}', decided_at`, `decided_by = '${P_HOD}', decided_at`) },
      ]);
      expect(r.error).toMatch(/under the name of the person making it/);
    });

    it("an approver cannot put someone else's name on the step's decision", async () => {
      const forged = decide(ROW, P_HOD, { advance: true, approve: true })
        .replace(`'decided_by', '${P_HOD}', 'comment'`, `'decided_by', '${P_HRHEAD}', 'comment'`);
      expect(forged).toContain(`'decided_by', '${P_HRHEAD}', 'comment'`);
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: forged },
      ]);
      expect(r.error).toMatch(/under the name of the person making it/);
    });

    it("an approver cannot erase someone else's earlier decision on the step", async () => {
      const step0 = { ...roleStep(1, 'hod'), quorum: 'all',
        decisions: [{ by: P_DEPUTY, at: '2026-10-01', decision: 'approved', comment: null }] };
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, [step0, roleStep(2, 'hr_head', true)]) },
        { who: HOD, sql: decide(ROW, P_HOD, { advance: true, approve: true }) },
      ]);
      expect(r.error).toMatch(/other people's decisions stay as they were/);
    });

    it("adding one's own decision next to someone else's is fine", async () => {
      const step0 = { ...roleStep(1, 'hod'), quorum: 'all',
        decisions: [{ by: P_DEPUTY, at: '2026-10-01', decision: 'approved', comment: null }] };
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, [step0, roleStep(2, 'hr_head', true)]) },
        { who: HOD, sql: `UPDATE public.hr_leave_eligibilities SET approval_chain = jsonb_set(approval_chain, '{0,decisions}',
            (approval_chain #> '{0,decisions}') || jsonb_build_array(jsonb_build_object('by', '${P_HOD}', 'decision', 'approved'))),
            decided_by = '${P_HOD}' WHERE id = '${ROW}' RETURNING status` },
      ]);
      expect(r.error).toBeNull();
      expect(r.rows[1]).toEqual([{ status: 'pending' }]);
    });
  });
});

describe('review round 3', () => {
  const ROW = id(921);
  type Chain = Record<string, unknown>[];
  const REAL = [roleStep(1, 'hod'), roleStep(2, 'hr_head', true)];

  describe('re-opening a closed leave application runs the eligibility check', () => {
    const app = (status: string) =>
      `INSERT INTO public.hr_leave_applications (id, employee_id, leave_type_id, hr_organization_id, status, start_date, end_date)
       VALUES ('${ROW}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', '${status}', CURRENT_DATE + 1, CURRENT_DATE + 2) RETURNING id`;
    const setStatus = (status: string) =>
      `UPDATE public.hr_leave_applications SET status = '${status}' WHERE id = '${ROW}' RETURNING status`;
    const GRANT = `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly)
       VALUES ('${id(922)}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true)`;

    it('filed withdrawn, then set to pending: refused', async () => {
      const r = await tx([{ who: ASKER, sql: app('withdrawn') }, { who: ASKER, sql: setStatus('pending') }]);
      expect(r.rows[0]).toHaveLength(1);
      expect(r.error).toMatch(/only open to team members/);
    });

    it('filed cancelled, then HR sets it approved: refused', async () => {
      const r = await tx([{ who: ASKER, sql: app('cancelled') }, { who: HRHEAD, sql: setStatus('approved') }]);
      expect(r.rows[0]).toHaveLength(1);
      expect(r.error).toMatch(/only open to team members/);
    });

    it('a rejected one re-opened as escalated: refused', async () => {
      const r = await tx([{ who: ASKER, sql: app('rejected') }, { who: HRHEAD, sql: setStatus('escalated') }]);
      expect(r.error).toMatch(/only open to team members/);
    });

    it('pending -> approved after the eligibility is revoked is still allowed (a revoke does not reach back)', async () => {
      const r = await tx([
        { sql: GRANT },
        { who: ASKER, sql: app('pending') },
        { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET status = 'revoked', revoked_by = '${P_HRHEAD}', revoked_at = now(), revoke_reason = 'ended' WHERE id = '${id(922)}'` },
        { who: HRHEAD, sql: setStatus('approved') },
      ]);
      expect(r.error).toBeNull();
      expect(r.rows[3]).toEqual([{ status: 'approved' }]);
    });
  });

  describe('a request routed to the Director stays protected after it is decided', () => {
    const mine = `employee_id = '${S_HRHEAD}'`;

    it('the Director rejects; another HR manager or a super admin cannot turn it into an approval', async () => {
      for (const who of [HR2, { ...HR2, super: true }]) {
        const r = await tx([
          { who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) },
          { who: DIRECTOR, sql: decide('', P_DIRECTOR, { advance: false, approve: false }, mine) },
          { who, sql: `UPDATE public.hr_leave_eligibilities SET status = 'approved' WHERE ${mine} RETURNING id` },
        ]);
        expect(r.rows[1]).toMatchObject([{ status: 'rejected' }]);
        expect(r.error).toMatch(/A decided eligibility record can only be withdrawn/);
      }
    });

    it('HR can withdraw an approval the Director gave, under its own name, and change nothing else', async () => {
      const revoke = (by: string, extra = '') =>
        `UPDATE public.hr_leave_eligibilities SET status = 'revoked', revoked_by = '${by}', revoked_at = now(),
           revoke_reason = 'ended', updated_at = now()${extra} WHERE ${mine} RETURNING status`;
      const filed = (last: Step) => tx([
        { who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) },
        { who: DIRECTOR, sql: decide('', P_DIRECTOR, { advance: false, approve: true }, mine) },
        last,
      ]);
      const ok = await filed({ who: HR2, sql: revoke(P_HR2) });
      expect(ok.error).toBeNull();
      expect(ok.rows[2]).toEqual([{ status: 'revoked' }]);
      const otherName = await filed({ who: HR2, sql: revoke(P_HOD) });
      expect(otherName.error).toMatch(/A decided eligibility record can only be withdrawn/);
      const more = await filed({ who: HR2, sql: revoke(P_HR2, ', entitled_days = 99') });
      expect(more.error).toMatch(/A decided eligibility record can only be withdrawn/);
      // Not HR: the row rules do not even let the update reach the row.
      const notHr = await filed({ who: HOD, sql: revoke(P_HOD) });
      expect(notHr.error !== null || notHr.rows[2].length === 0).toBe(true);
    });
  });

  describe('a pending request always goes through the decide checks', () => {
    it("HR cannot record an approval under the HoD's name", async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HR2, sql: decide(ROW, P_HOD, { advance: true, approve: true }) },
      ]);
      expect(r.error).toMatch(/waiting on someone else|under the name/);
    });

    it("HR (even as the step's approver) cannot erase the HoD's decision or move the step back", async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: decide(ROW, P_HOD, { advance: true, approve: true }) },
        { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET current_step = 0,
            approval_chain = jsonb_set(approval_chain, '{0,decisions}', '[]'::jsonb) WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(r.rows[1]).toMatchObject([{ current_step: 1 }]);
      expect(r.error).toMatch(/can only decide the step/);
    });

    it("a super admin deciding someone else's ordinary step still cannot use another name or erase a decision", async () => {
      const step0 = { ...roleStep(1, 'hod'), quorum: 'all',
        decisions: [{ by: P_DEPUTY, at: '2026-10-01', decision: 'approved', comment: null }] };
      const SUPER = { ...HR2, super: true };
      const otherName = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: SUPER, sql: decide(ROW, P_HOD, { advance: true, approve: true }) },
      ]);
      expect(otherName.error).toMatch(/under the name/);
      const erase = await tx([
        { sql: legacy(ROW, S_ASKER, [step0, roleStep(2, 'hr_head', true)]) },
        { who: SUPER, sql: decide(ROW, P_HR2, { advance: true, approve: true }) },
      ]);
      expect(erase.error).toMatch(/other people's decisions stay as they were/);
    });
  });

  describe('rules a review found untested', () => {
    it("(a) nobody moves someone else's row onto themselves", async () => {
      const r = await tx([
        { sql: `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly)
                VALUES ('${ROW}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true)` },
        { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET employee_id = '${S_HRHEAD}' WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(r.error).toMatch(/cannot decide on your own eligibility request/);
    });

    it('(b) the Director\'s own request, with himself on its chain, is refused', async () => {
      const r = await tx([{ who: DIRECTOR, sql: request(S_DIR, T_DIRPIN, ORG_A) }]);
      expect(r.error).toMatch(/contact HR/);
    });

    it('(b) non-vacuity: the same flow for someone else is pinned to him', async () => {
      const r = await tx([{ who: ASKER, sql: request(S_ASKER, T_DIRPIN, ORG_A) }]);
      expect(r.error).toBeNull();
      expect(approverOf((r.rows[0][0] as { approval_chain: Chain }).approval_chain[0]).approver_user_id).toBe(P_DIRECTOR);
    });

    it("(c) a decider cannot set status 'revoked' through the decide path", async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: `UPDATE public.hr_leave_eligibilities SET status = 'revoked' WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(r.error).toMatch(/can only approve or reject/);
    });

    it('(d) decisions must be a JSON array', async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: `UPDATE public.hr_leave_eligibilities SET approval_chain = jsonb_set(approval_chain, '{0,decisions}',
            jsonb_build_object('by', '${P_HOD}')) WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(r.error).toBe('A decision is recorded under the name of the person making it.');
    });

    it('(e) the step pointer cannot run past the last step', async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, [roleStep(1, 'hod', true)]) },
        { who: HOD, sql: decide(ROW, P_HOD, { advance: true, approve: true }) },
      ]);
      expect(r.error).toMatch(/can only decide the step/);
    });
  });

  describe('Default taken (Director did not answer): eligibility covers leave from the request day onward', () => {
    const mine = `employee_id = '${S_ASKER}'`;
    const flow = (leaveFrom: string, leaveTo: string) => [
      { who: ASKER, sql: request(S_ASKER, T_PHD, ORG_A) },
      { who: HOD, sql: decide('', P_HOD, { advance: true, approve: true }, mine) },
      { who: HRHEAD, sql: decide('', P_HRHEAD, { advance: false, approve: true }, mine) },
      { who: ASKER, sql: `SELECT valid_from = CURRENT_DATE AS from_today FROM public.hr_leave_eligibilities WHERE ${mine}` },
      { who: ASKER, sql: `INSERT INTO public.hr_leave_applications (employee_id, leave_type_id, hr_organization_id, start_date, end_date)
          VALUES ('${S_ASKER}', '${T_PHD}', '${ORG_A}', ${leaveFrom}, ${leaveTo}) RETURNING id` },
    ];

    it('after approval, leave from the request day onward is allowed', async () => {
      for (const [a, b] of [['CURRENT_DATE', 'CURRENT_DATE'], ['CURRENT_DATE + 40', 'CURRENT_DATE + 45']]) {
        const r = await tx(flow(a, b));
        expect({ a, error: r.error }).toEqual({ a, error: null });
        expect(r.rows[2]).toMatchObject([{ status: 'approved' }]);
        expect(r.rows[3]).toEqual([{ from_today: true }]);
        expect(r.rows[4]).toHaveLength(1);
      }
    });

    it('leave before the request day stays refused', async () => {
      const r = await tx(flow('CURRENT_DATE - 1', 'CURRENT_DATE'));
      expect(r.error).toMatch(/only open to team members/);
    });
  });
});

describe('review round 3, reviewer notes', () => {
  const ROW = id(931);
  const directGrant = (member: string, type: string, org: string, extra = '') =>
    `INSERT INTO public.hr_leave_eligibilities (employee_id, leave_type_id, hr_organization_id, status, granted_directly${extra ? ', valid_from' : ''})
     VALUES ('${member}', '${type}', '${org}', 'approved', true${extra ? `, ${extra}` : ''}) RETURNING id, valid_from = CURRENT_DATE AS from_today`;

  describe('no direct grant around the Director (default taken)', () => {
    const mine = `employee_id = '${S_HRHEAD}'`;
    it('after the Director rejects an HR Head, neither another HR manager nor a super admin can grant it directly', async () => {
      for (const who of [HR2, { ...HR2, super: true }]) {
        const r = await tx([
          { who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) },
          { who: DIRECTOR, sql: decide('', P_DIRECTOR, { advance: false, approve: false }, mine) },
          { who, sql: directGrant(S_HRHEAD, T_WFH, ORG_A) },
        ]);
        expect(r.rows[1]).toMatchObject([{ status: 'rejected' }]);
        expect(r.error).toMatch(/one of the approvers for this leave type/);
      }
    });

    it('an approved (not flagged direct) row for such a person is refused the same way', async () => {
      const r = await tx([{ who: HR2, sql: request(S_HRHEAD, T_WFH, ORG_A, {}, 'approved') }]);
      expect(r.error).toMatch(/one of the approvers for this leave type/);
    });

    it('nor can HR flip a decided row of theirs to approved', async () => {
      const r = await tx([
        { sql: `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, approval_chain)
                VALUES ('${ROW}', '${S_HRHEAD}', '${T_WFH}', '${ORG_A}', 'rejected', '${JSON.stringify([roleStep(1, 'hod', true)])}')` },
        { who: HR2, sql: `UPDATE public.hr_leave_eligibilities SET status = 'approved' WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(r.error).toMatch(/A decided eligibility record can only be withdrawn/);
    });

    it('an ordinary team member is still granted directly', async () => {
      const r = await tx([{ who: HR2, sql: directGrant(S_ASKER, T_WFH, ORG_A) }]);
      expect(r.error).toBeNull();
      expect(r.rows[0]).toHaveLength(1);
    });
  });

  it('a row for someone else cannot be both pending and a direct grant', async () => {
    const r = await tx([{ who: HR2, sql: request(S_ASKER, T_PHD, ORG_A, { granted_directly: 'true' }) }]);
    expect(r.error).toMatch(/either a request \(pending\) or a direct grant, not both/);
  });

  describe('college of the row, the person and the leave type', () => {
    const GRANT = `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly)
       VALUES ('${ROW}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true)`;
    it('HR cannot move a grant to another college, another person or another type', async () => {
      for (const change of [`hr_organization_id = '${ORG_B}'`, `employee_id = '${S_HOD}'`, `leave_type_id = '${T_WFH}'`]) {
        const r = await tx([
          { sql: GRANT },
          { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET ${change} WHERE id = '${ROW}' RETURNING id` },
        ]);
        expect({ change, error: r.error }).toMatchObject({ change, error: expect.stringMatching(/A decided eligibility record can only be withdrawn/) });
      }
    });

    it('HR still edits the grant itself', async () => {
      const r = await tx([
        { sql: GRANT },
        { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET entitled_days = 12 WHERE id = '${ROW}' RETURNING entitled_days::int AS d` },
      ]);
      expect(r.error).toBeNull();
      expect(r.rows[1]).toEqual([{ d: 12 }]);
    });

    it("a leave type of another college is refused, for a grant and for one's own request", async () => {
      const grant = await tx([{ who: HRHEAD, sql: directGrant(S_ASKER, T_WFH_B, ORG_A) }]);
      expect(grant.error).toMatch(/leave type belongs to another institution/);
      const own = await tx([{ who: ASKER, sql: request(S_ASKER, T_WFH_B, ORG_A) }]);
      expect(own.error).toMatch(/leave type belongs to another institution/);
      const onBehalf = await tx([{ who: HRHEAD, sql: request(S_ASKER, T_WFH_B, ORG_A) }]);
      expect(onBehalf.error).toMatch(/leave type belongs to another institution/);
    });
  });

  it("HR's direct grant keeps an earlier valid_from, and leave already taken in that window is accepted", async () => {
    const r = await tx([
      { who: HRHEAD, sql: directGrant(S_ASKER, T_PHD, ORG_A, 'CURRENT_DATE - 60') },
      { who: ASKER, sql: `INSERT INTO public.hr_leave_applications (employee_id, leave_type_id, hr_organization_id, start_date, end_date)
          VALUES ('${S_ASKER}', '${T_PHD}', '${ORG_A}', CURRENT_DATE - 50, CURRENT_DATE - 45) RETURNING id` },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject([{ from_today: false }]);
    expect(r.rows[1]).toHaveLength(1);
  });
});

describe('review round 4', () => {
  const ROW = id(941);
  const REAL = [roleStep(1, 'hod'), roleStep(2, 'hr_head', true)];

  describe('nothing HR files or edits can be re-opened into a request it then decides', () => {
    it('HR cannot file a rejected row with a chain naming themself (P1)', async () => {
      const r = await tx([{ who: HR2, sql: request(S_HRHEAD, T_WFH, ORG_A,
        { approval_chain: `'${JSON.stringify([pinned(P_HR2)])}'::jsonb` }, 'rejected') }]);
      expect(r.error).toMatch(/request for someone \(pending\) or grant it directly/);
    });

    it('HR cannot file a revoked row, a grant with a chain, or a grant on a later step', async () => {
      for (const sql of [
        request(S_ASKER, T_PHD, ORG_A, { granted_directly: 'true' }, 'revoked'),
        request(S_ASKER, T_PHD, ORG_A, { granted_directly: 'true', approval_chain: `'${JSON.stringify(REAL)}'::jsonb` }, 'approved'),
        request(S_ASKER, T_PHD, ORG_A, { granted_directly: 'true', current_step: '1' }, 'approved'),
      ]) {
        const r = await tx([{ who: HR2, sql }]);
        expect({ sql, error: r.error }).toMatchObject({ sql, error: expect.stringMatching(/grant it directly/) });
      }
    });

    it('a decided row never returns to pending (P1, P4)', async () => {
      for (const status of ['rejected', 'approved', 'revoked']) {
        const r = await tx([
          { sql: `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, approval_chain)
                  VALUES ('${ROW}', '${S_HRHEAD}', '${T_WFH}', '${ORG_A}', '${status}', '${JSON.stringify([pinned(P_HR2)])}')` },
          { who: HR2, sql: `UPDATE public.hr_leave_eligibilities SET status = 'pending' WHERE id = '${ROW}' RETURNING id` },
        ]);
        expect({ status, error: r.error }).toMatchObject({ status, error: expect.stringMatching(/A decided eligibility record can only be withdrawn/) });
      }
    });

    it("HR cannot swap a chain naming themself into an ordinary decided request (P4)", async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { sql: `UPDATE public.hr_leave_eligibilities SET status = 'rejected' WHERE id = '${ROW}'` },
        { who: HR2, sql: `UPDATE public.hr_leave_eligibilities SET approval_chain = '${JSON.stringify([pinned(P_HR2)])}'::jsonb, current_step = 0 WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(r.error).toMatch(/A decided eligibility record can only be withdrawn/);
    });

    it("HR cannot record a grant under the Director's name (P3), nor a revoke under someone else's", async () => {
      const grantAsDirector = await tx([{ who: HR2, sql: request(S_ASKER, T_PHD, ORG_A,
        { granted_directly: 'true', decided_by: `'${P_DIRECTOR}'` }, 'approved') }]);
      expect(grantAsDirector.error).toMatch(/under the name of the person making it/);
      const grantRevokedBy = await tx([{ who: HR2, sql: request(S_ASKER, T_PHD, ORG_A,
        { granted_directly: 'true', revoked_by: `'${P_HOD}'` }, 'approved') }]);
      expect(grantRevokedBy.error).toMatch(/under the name of the person making it/);
      const own = await tx([{ who: HR2, sql: request(S_ASKER, T_PHD, ORG_A,
        { granted_directly: 'true', decided_by: `'${P_HR2}'` }, 'approved') }]);
      expect(own.error).toBeNull();

      const GRANT = `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly)
         VALUES ('${ROW}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true)`;
      const editAsDirector = await tx([
        { sql: GRANT },
        { who: HR2, sql: `UPDATE public.hr_leave_eligibilities SET decided_by = '${P_DIRECTOR}' WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(editAsDirector.error).toMatch(/A decided eligibility record can only be withdrawn/);
      const revokeAsHod = await tx([
        { sql: GRANT },
        { who: HR2, sql: `UPDATE public.hr_leave_eligibilities SET status = 'revoked', revoked_by = '${P_HOD}', revoked_at = now() WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(revokeAsHod.error).toMatch(/A decided eligibility record can only be withdrawn/);
    });
  });

  describe("a decision that moves a request is recorded in full under the decider's name", () => {
    it('after the HoD approves step 1, the HR Head cannot just set status approved', async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: decide(ROW, P_HOD, { advance: true, approve: true }) },
        { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET status = 'approved' WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(r.rows[1]).toMatchObject([{ current_step: 1 }]);
      expect(r.error).toMatch(/recorded in full under the name/);
    });

    it('nor with the row signed but no decision on the step', async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: decide(ROW, P_HOD, { advance: true, approve: true }) },
        { who: HRHEAD, sql: `UPDATE public.hr_leave_eligibilities SET status = 'approved', decided_by = '${P_HRHEAD}',
            approval_chain = jsonb_set(approval_chain, '{1,decided_by}', to_jsonb('${P_HRHEAD}'::text)) WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(r.error).toMatch(/recorded in full under the name/);
    });

    it('nor can a decider advance the step without a decision of their own', async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: `UPDATE public.hr_leave_eligibilities SET current_step = 1, decided_by = '${P_HOD}',
            approval_chain = jsonb_set(approval_chain, '{0,decided_by}', to_jsonb('${P_HOD}'::text)) WHERE id = '${ROW}' RETURNING id` },
      ]);
      expect(r.error).toMatch(/recorded in full under the name/);
    });
  });

  describe('rules a review found untested', () => {
    it('a decider cannot jump past the next step (e.g. over the Director)', async () => {
      const directorStep = { ...pinned(P_DIRECTOR), step_order: 2, step_type: undefined, self_routed: true };
      const chain = [roleStep(1, 'hod'), directorStep, roleStep(3, 'hr_head', true)];
      const jump = decide(ROW, P_HOD, { advance: true, approve: true }).replace('current_step = current_step + 1', 'current_step = current_step + 2');
      expect(jump).toContain('current_step + 2');
      const r = await tx([{ sql: legacy(ROW, S_ASKER, chain) }, { who: HOD, sql: jump }]);
      expect(r.error).toMatch(/can only decide the step/);
    });

    it("a decision that does not move the request still cannot put someone else's name on the step", async () => {
      const step0 = { ...roleStep(1, 'hod'), quorum: 'all' };
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, [step0, roleStep(2, 'hr_head', true)]) },
        { who: HOD, sql: `UPDATE public.hr_leave_eligibilities SET
            approval_chain = jsonb_set(jsonb_set(approval_chain, '{0,decisions}', jsonb_build_array(jsonb_build_object('by', '${P_HOD}', 'decision', 'approved'))),
              '{0,decided_by}', to_jsonb('${P_HRHEAD}'::text))
            WHERE id = '${ROW}' RETURNING status` },
      ]);
      expect(r.error).toBe('A decision is recorded under the name of the person making it.');
    });

    it("a decision that does not move the request still cannot carry someone else's name on the row", async () => {
      const step0 = { ...roleStep(1, 'hod'), quorum: 'all' };
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, [step0, roleStep(2, 'hr_head', true)]) },
        { who: HOD, sql: `UPDATE public.hr_leave_eligibilities SET decided_by = '${P_HRHEAD}',
            approval_chain = jsonb_set(approval_chain, '{0,decisions}', jsonb_build_array(jsonb_build_object('by', '${P_HOD}', 'decision', 'approved')))
            WHERE id = '${ROW}' RETURNING status` },
      ]);
      expect(r.error).toBe('A decision is recorded under the name of the person making it.');
    });
  });
});

describe('review round 4 add-ons', () => {
  type Chain = Record<string, unknown>[];
  const chainOf = (rows: Record<string, unknown>[]) => (rows[0] as { approval_chain: Chain }).approval_chain;
  const who = (uid: string, extra: Partial<Who> = {}): Who => ({ uid, insts: [INST_A], ...extra });
  const shape = (c: Chain) => c.map((s) => approverOf(s).approver_user_id === P_DIRECTOR ? 'Director' : approverOf(s).approver_role);
  const HOD_STEP = JSON.stringify(roleStep(1, 'hod'));

  describe('routing to the Director follows the role\'s scope, not just holding the role', () => {
    it("the HOD of the asker's own department, and the COO, are routed (existing cases, restated)", async () => {
      const hod = await tx([{ who: HOD, sql: request(S_HOD, T_PHD, ORG_A) }]);
      expect(shape(chainOf(hod.rows[0]))).toEqual(['Director', 'hr_head']);
      const coo = await tx([{ who: HRHEAD, sql: request(S_HRHEAD, T_PHD, ORG_A) }]);
      expect(shape(chainOf(coo.rows[0]))).toEqual(['hod', 'Director']);
    });

    it('an HOD of another department is routed for their OWN request: department scope is their own record\'s department', async () => {
      const r = await tx([
        { who: who(P_HODY), sql: request(S_HODY, T_PHD, ORG_A) },
        // ...because the decide rules would let them clear that step of their own request,
        { who: who(P_HODY), sql: `SELECT public.fn_leave_step_admits('${HOD_STEP}'::jsonb, '${P_HODY}', '${ORG_A}', '${S_HODY}') AS own` },
        // ...while they do not reach a member of the other department.
        { who: who(P_HODY), sql: `SELECT public.fn_leave_step_admits('${HOD_STEP}'::jsonb, '${P_HODY}', '${ORG_A}', '${S_ASKER}') AS other` },
      ]);
      expect(r.error).toBeNull();
      expect(shape(chainOf(r.rows[0]))).toEqual(['Director', 'hr_head']);
      expect(r.rows[1]).toEqual([{ own: true }]);
      expect(r.rows[2]).toEqual([{ other: false }]);
    });

    it('an HOD-role holder with no department on their record is NOT routed (they could not clear that step)', async () => {
      const r = await tx([{ who: who(P_HODX), sql: request(S_HODX, T_PHD, ORG_A) }]);
      expect(r.error).toBeNull();
      expect(shape(chainOf(r.rows[0]))).toEqual(['hod', 'hr_head']);
    });

    it('a senior who also holds the HOD role is not routed at the HOD step, only at their own senior step', async () => {
      const r = await tx([{ who: who(P_HODHR), sql: request(S_HODHR, T_PHD, ORG_A) }]);
      expect(r.error).toBeNull();
      expect(shape(chainOf(r.rows[0]))).toEqual(['hod', 'Director']);
    });

    it('the same rule decides direct grants: allowed for the no-department HOD, refused for a real HOD', async () => {
      const ok = await tx([{ who: HR2, sql: request(S_HODX, T_PHD, ORG_A, { granted_directly: 'true' }, 'approved') }]);
      expect(ok.error).toBeNull();
      const refused = await tx([{ who: HR2, sql: request(S_HOD, T_PHD, ORG_A, { granted_directly: 'true' }, 'approved') }]);
      expect(refused.error).toMatch(/one of the approvers for this leave type/);
    });

    const MAKE_HODX_SUPER = `UPDATE public.profiles SET is_super_admin = true WHERE id = '${P_HODX}'`;

    it('a super admin holding the HOD role reaches it whatever its scope, so their own request is routed', async () => {
      const r = await tx([
        { sql: MAKE_HODX_SUPER },
        { who: who(P_HODX, { super: true }), sql: request(S_HODX, T_PHD, ORG_A) },
      ]);
      expect(r.error).toBeNull();
      expect(shape(chainOf(r.rows[1]))).toEqual(['Director', 'hr_head']);
    });

    it('...and so is a request HR files for them, and HR cannot grant it to them directly', async () => {
      const filed = await tx([{ sql: MAKE_HODX_SUPER }, { who: HR2, sql: request(S_HODX, T_PHD, ORG_A) }]);
      expect(filed.error).toBeNull();
      expect(shape(chainOf(filed.rows[1]))).toEqual(['Director', 'hr_head']);
      const granted = await tx([
        { sql: MAKE_HODX_SUPER },
        { who: HR2, sql: request(S_HODX, T_PHD, ORG_A, { granted_directly: 'true' }, 'approved') },
      ]);
      expect(granted.error).toMatch(/one of the approvers for this leave type/);
    });
  });

  it('nobody signed in deletes an eligibility record, not HR, not a super admin', async () => {
    const GRANT = `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly)
       VALUES ('${id(951)}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true)`;
    for (const w of [HRHEAD, { ...HR2, super: true }]) {
      const r = await tx([
        { sql: GRANT },
        { who: w, sql: `DELETE FROM public.hr_leave_eligibilities WHERE id = '${id(951)}' RETURNING id` },
      ]);
      expect(r.error).toMatch(/permission denied/);
    }
  });
});

describe('review round 5', () => {
  type Chain = Record<string, unknown>[];
  const ROW = id(961);

  it('the Director step never lands after the step that grants', async () => {
    const r = await tx([{ who: HOD, sql: request(S_HOD, T_THREE, ORG_A) }]);
    expect(r.error).toBeNull();
    const chain = (r.rows[0][0] as { approval_chain: Chain }).approval_chain;
    expect(chain.map((s) => approverOf(s).approver_user_id === P_DIRECTOR ? 'Director' : approverOf(s).approver_role))
      .toEqual(['Director', 'hr_head', 'hod']);
    expect(chain.map((s) => s.step_type)).toEqual(['review', 'final', 'review']);
  });

  it('a direct grant is recorded as filed by the person recording it', async () => {
    const r = await tx([{ who: HR2, sql: request(S_ASKER, T_PHD, ORG_A,
      { granted_directly: 'true', created_by: `'${P_DIRECTOR}'` }, 'approved') }]);
    expect(r.error).toBeNull();
    expect(r.rows[0][0]).toMatchObject({ created_by: P_HR2 });
  });

  describe('dates on a decided record', () => {
    const approvedRequest = `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, approval_chain, current_step)
       VALUES ('${ROW}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', '${JSON.stringify([roleStep(1, 'hod', true)])}', 0)`;
    const directGrant = `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly)
       VALUES ('${ROW}', '${S_ASKER}', '${T_PHD}', '${ORG_A}', 'approved', true)`;
    const set = (change: string) => `UPDATE public.hr_leave_eligibilities SET ${change} WHERE id = '${ROW}' RETURNING id`;

    it('HR cannot move the start of an approved request', async () => {
      const r = await tx([{ sql: approvedRequest }, { who: HRHEAD, sql: set('valid_from = CURRENT_DATE - 30') }]);
      expect(r.error).toMatch(/A decided eligibility record can only be withdrawn/);
    });

    it('nor its day count: an approved request is withdrawn or left as it is', async () => {
      const r = await tx([{ sql: approvedRequest }, { who: HRHEAD, sql: set('entitled_days = 12') }]);
      expect(r.error).toMatch(/A decided eligibility record can only be withdrawn/);
    });

    it("a direct grant's start stays HR's to set", async () => {
      const r = await tx([{ sql: directGrant }, { who: HRHEAD, sql: set('valid_from = CURRENT_DATE - 30') }]);
      expect(r.error).toBeNull();
    });
  });
});

describe('review round 6', () => {
  const ROW = id(971);
  const REAL = [roleStep(1, 'hod'), roleStep(2, 'hr_head', true)];
  const DECIDED = /A decided eligibility record can only be withdrawn/;
  const set = (change: string) => `UPDATE public.hr_leave_eligibilities SET ${change} WHERE id = '${ROW}' RETURNING id`;
  const revoke = (by: string, reason = `'ended'`) =>
    set(`status = 'revoked', revoked_by = '${by}', revoked_at = now(), revoke_reason = ${reason}, updated_at = now()`);
  const grantFor = (member: string, type = T_PHD) =>
    `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly, entitled_days, valid_from, valid_until)
     VALUES ('${ROW}', '${member}', '${type}', '${ORG_A}', 'approved', true, 10, CURRENT_DATE, CURRENT_DATE + 30)`;

  describe('a decided record: only a withdrawal, or an adjustment of a direct grant', () => {
    it('P1: the HoD rejects; another HR manager cannot set it approved', async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: decide(ROW, P_HOD, { advance: false, approve: false }) },
        { who: HR2, sql: set(`status = 'approved'`) },
      ]);
      expect(r.rows[1]).toMatchObject([{ status: 'rejected' }]);
      expect(r.error).toMatch(DECIDED);
    });

    it("P9: an approval cannot be turned into a rejection", async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { who: HOD, sql: decide(ROW, P_HOD, { advance: true, approve: true }) },
        { who: HRHEAD, sql: decide(ROW, P_HRHEAD, { advance: false, approve: true }) },
        { who: HR2, sql: set(`status = 'rejected'`) },
      ]);
      expect(r.rows[2]).toMatchObject([{ status: 'approved' }]);
      expect(r.error).toMatch(DECIDED);
    });

    it('HR withdraws an approved request under its own name, with a reason', async () => {
      const r = await tx([
        { sql: legacy(ROW, S_ASKER, REAL) },
        { sql: `UPDATE public.hr_leave_eligibilities SET status = 'approved' WHERE id = '${ROW}'` },
        { who: HR2, sql: revoke(P_HR2) },
      ]);
      expect(r.error).toBeNull();
      expect(r.rows[2]).toHaveLength(1);
    });

    it('...but not without a reason', async () => {
      const r = await tx([{ sql: grantFor(S_ASKER) }, { who: HR2, sql: revoke(P_HR2, 'NULL') }]);
      expect(r.error).toMatch(DECIDED);
    });

    it("HR cannot turn the Director's rejection into 'revoked'", async () => {
      const mine = `employee_id = '${S_HRHEAD}'`;
      const r = await tx([
        { who: HRHEAD, sql: request(S_HRHEAD, T_WFH, ORG_A) },
        { who: DIRECTOR, sql: decide('', P_DIRECTOR, { advance: false, approve: false }, mine) },
        { who: HR2, sql: `UPDATE public.hr_leave_eligibilities SET status = 'revoked', revoked_by = '${P_HR2}',
            revoked_at = now(), revoke_reason = 'tidy' WHERE ${mine} RETURNING id` },
      ]);
      expect(r.rows[1]).toMatchObject([{ status: 'rejected' }]);
      expect(r.error).toMatch(DECIDED);
    });

    it('P4/P11: a direct grant held by a HoD the chain reaches cannot be widened', async () => {
      for (const change of ['valid_until = NULL', `valid_from = CURRENT_DATE - 365`, 'entitled_days = 20']) {
        const r = await tx([{ sql: grantFor(S_HOD) }, { who: HR2, sql: set(change) }]);
        expect({ change, error: r.error }).toMatchObject({ change, error: expect.stringMatching(/cannot be widened directly/) });
      }
    });

    it('...but can be narrowed', async () => {
      const r = await tx([{ sql: grantFor(S_HOD) }, { who: HR2, sql: set('valid_until = CURRENT_DATE + 10, entitled_days = 5') }]);
      expect(r.error).toBeNull();
    });

    it("an ordinary team member's direct grant can be widened", async () => {
      const r = await tx([{ sql: grantFor(S_ASKER) }, { who: HR2, sql: set(`valid_until = NULL, valid_from = CURRENT_DATE - 365, entitled_days = 20`) }]);
      expect(r.error).toBeNull();
    });

    it('a direct grant cannot change anything but its dates and day count', async () => {
      const r = await tx([{ sql: grantFor(S_ASKER) }, { who: HR2, sql: set(`reason = 'rewritten'`) }]);
      expect(r.error).toMatch(DECIDED);
    });
  });

  describe('a moving decision names the decider on the row and on the step', () => {
    it('row decided_by left unset on a move: refused', async () => {
      const sql = decide(ROW, P_HOD, { advance: true, approve: true }).replace(`decided_by = '${P_HOD}', decided_at = now(),`, 'decided_at = now(),');
      expect(sql).not.toContain(`decided_by = '${P_HOD}', decided_at`);
      const r = await tx([{ sql: legacy(ROW, S_ASKER, REAL) }, { who: HOD, sql }]);
      expect(r.error).toMatch(/recorded in full under the name/);
    });

    it("the step's decided_by left unset on a move: refused", async () => {
      const sql = decide(ROW, P_HOD, { advance: true, approve: true }).replace(`'decided_by', '${P_HOD}', 'comment', NULL`, `'comment', NULL`);
      expect(sql).not.toContain(`'decided_by', '${P_HOD}', 'comment'`);
      const r = await tx([{ sql: legacy(ROW, S_ASKER, REAL) }, { who: HOD, sql }]);
      expect(r.error).toMatch(/recorded in full under the name/);
    });
  });

  describe('whose row it is cannot be hidden by unlinking the team member record', () => {
    it('the row keeps whose it is', async () => {
      const r = await tx([{ who: ASKER, sql: request(S_ASKER, T_PHD, ORG_A).replace('RETURNING id,', 'RETURNING subject_profile_id, id,') }]);
      expect(r.rows[0][0]).toMatchObject({ subject_profile_id: P_ASKER });
    });

    it('an unlinked team member record is still yours through its email: no direct grant to yourself', async () => {
      const r = await tx([
        { sql: `INSERT INTO auth.users VALUES ('${P_HRHEAD}', 'HR.Head@jkkn.ac.in ', now(), NULL)` },
        { sql: `UPDATE public.staff SET profile_id = NULL, institution_email = 'hr.head@jkkn.ac.in' WHERE id = '${S_HRHEAD}'` },
        { who: HRHEAD, sql: request(S_HRHEAD, T_PHD, ORG_A, { granted_directly: 'true' }, 'approved') },
      ]);
      expect(r.error).toMatch(/cannot grant eligibility to yourself/);
    });

    it('unlinked after the grant: still your own row (the kept owner)', async () => {
      const r = await tx([
        { sql: grantFor(S_HRHEAD, T_WFH) },
        { sql: `UPDATE public.staff SET profile_id = NULL WHERE id = '${S_HRHEAD}'` },
        { who: HRHEAD, sql: set('valid_until = NULL') },
      ]);
      expect(r.error).toMatch(/cannot decide on your own eligibility request/);
    });

    it('an approver cannot rewrite whose row it is', async () => {
      const r = await tx([{ sql: legacy(ROW, S_ASKER, REAL) }, { who: HOD, sql: set(`subject_profile_id = '${P_DEPUTY}'`) }]);
      expect(r.error).toMatch(/can only record a decision/);
    });
  });

  describe('a Director step is decided only by the current decider', () => {
    const mine = `employee_id = '${S_HOD}'`;
    it('the decider was changed after filing: the old one cannot decide', async () => {
      const r = await tx([
        { who: HOD, sql: request(S_HOD, T_PHD, ORG_A) },
        { sql: `UPDATE public.platform_policies SET value = '["${P_DIRECTOR}","${P_DEPUTY}"]'::jsonb WHERE policy_key = 'platform.the_director_profile_ids'` },
        { sql: `UPDATE public.platform_policies SET value = to_jsonb('${P_DEPUTY}'::text) WHERE policy_key = 'hr.leave.eligibility_self_route_profile_id'` },
        { who: DIRECTOR, sql: decide('', P_DIRECTOR, { advance: true, approve: true }, mine) },
      ]);
      expect(r.error).toMatch(/no longer the one set to decide/);
    });

    it('the decider left the Director list: they cannot decide', async () => {
      const r = await tx([
        { who: HOD, sql: request(S_HOD, T_PHD, ORG_A) },
        { sql: `UPDATE public.platform_policies SET value = '["${P_DEPUTY}"]'::jsonb WHERE policy_key = 'platform.the_director_profile_ids'` },
        { who: DIRECTOR, sql: decide('', P_DIRECTOR, { advance: true, approve: true }, mine) },
      ]);
      expect(r.error).toMatch(/no longer the one set to decide/);
    });
  });
});

describe('review round 6 follow-ups', () => {
  const ROW = id(981);
  const set = (change: string) => `UPDATE public.hr_leave_eligibilities SET ${change} WHERE id = '${ROW}' RETURNING id`;
  const UNLINK_ASKER = `UPDATE public.staff SET profile_id = NULL, email = NULL, institution_email = NULL WHERE id = '${S_ASKER}'`;
  const grantFor = (member: string) =>
    `INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, hr_organization_id, status, granted_directly, entitled_days, valid_from, valid_until)
     VALUES ('${ROW}', '${member}', '${T_PHD}', '${ORG_A}', 'approved', true, 10, CURRENT_DATE, CURRENT_DATE + 30)`;
  const NO_IDENTITY = /not linked to any account/;

  describe('a record that resolves to no account', () => {
    it('cannot be granted directly by HR', async () => {
      const r = await tx([{ sql: UNLINK_ASKER }, { who: HR2, sql: request(S_ASKER, T_PHD, ORG_A, { granted_directly: 'true' }, 'approved') }]);
      expect(r.error).toMatch(NO_IDENTITY);
    });

    it('a request for them still works, and a super admin may still grant', async () => {
      const req = await tx([{ sql: UNLINK_ASKER }, { who: HR2, sql: request(S_ASKER, T_PHD, ORG_A) }]);
      expect(req.error).toBeNull();
      const sup = await tx([{ sql: UNLINK_ASKER }, { who: { ...HR2, super: true }, sql: request(S_ASKER, T_PHD, ORG_A, { granted_directly: 'true' }, 'approved') }]);
      expect(sup.error).toBeNull();
    });

    it('its direct grant cannot be widened by HR, but can be narrowed, and a super admin may widen', async () => {
      const filedUnlinked = [{ sql: UNLINK_ASKER }, { sql: grantFor(S_ASKER) }];
      const widen = await tx([...filedUnlinked, { who: HR2, sql: set('valid_until = NULL') }]);
      expect(widen.error).toMatch(NO_IDENTITY);
      const narrow = await tx([...filedUnlinked, { who: HR2, sql: set('entitled_days = 5') }]);
      expect(narrow.error).toBeNull();
      const sup = await tx([...filedUnlinked, { who: { ...HR2, super: true }, sql: set('valid_until = NULL') }]);
      expect(sup.error).toBeNull();
    });
  });

  it("a HoD's direct grant, the record unlinked since, still cannot be widened (the kept owner counts)", async () => {
    const r = await tx([
      { sql: grantFor(S_HOD) },
      { sql: `UPDATE public.staff SET profile_id = NULL WHERE id = '${S_HOD}'` },
      { who: HR2, sql: set('valid_until = NULL') },
    ]);
    expect(r.error).toMatch(/cannot be widened directly\. Ask them to request it/);
  });

  it('a decider cannot change a column the rules do not name (any column added later)', async () => {
    const r = await tx([
      { sql: `ALTER TABLE public.hr_leave_eligibilities ADD COLUMN audit_note text` },
      { sql: legacy(ROW, S_ASKER, [roleStep(1, 'hod'), roleStep(2, 'hr_head', true)]) },
      { who: HOD, sql: set(`audit_note = 'changed'`) },
    ]);
    expect(r.error).toMatch(/can only record a decision/);
  });
});

describe('quorum all is enforced in the database too (W12 review, 7 Oct 2026)', () => {
  const ROW = id(991);
  const QUORUM_MSG = 'Everyone on this step must approve before the request moves on.';
  // One step naming two people, as a parallel flow builds it, then HR's final step.
  const twoOf = (quorum: 'all' | 'any', decisions: unknown[] = []) => ({
    step_order: 1, approver_role: 'hr_approver', approver_user_id: null, quorum,
    approvers: [{ approver_role: null, approver_user_id: P_HOD }, { approver_role: null, approver_user_id: P_HRHEAD }],
    decisions, status: 'pending',
  });
  const chainOf = (step0: unknown) => [step0, roleStep(2, 'hr_head', true)];
  const finalOnly = (quorum: 'all' | 'any', decisions: unknown[] = []) => [{ ...twoOf(quorum, decisions), step_type: 'final' }];
  /** The app's decide(): the caller's decision is ADDED next to the others. */
  const addMine = (by: string, opts: { advance: boolean; grant?: boolean }) => `
    UPDATE public.hr_leave_eligibilities SET
      approval_chain = jsonb_set(approval_chain, ARRAY[current_step::text],
        (approval_chain -> current_step) || jsonb_build_object(
          'decisions', COALESCE(approval_chain -> current_step -> 'decisions', '[]'::jsonb)
                       || jsonb_build_array(jsonb_build_object('by', '${by}', 'at', now()::text, 'decision', 'approved', 'comment', NULL)),
          'decided_at', now()::text, 'decided_by', '${by}', 'comment', NULL)),
      current_step = current_step + ${opts.advance ? 1 : 0},
      status = '${opts.grant ? 'approved' : 'pending'}',
      decided_by = '${by}', decided_at = now(), updated_at = now()
    WHERE id = '${ROW}' RETURNING status, current_step`;
  const hrheadApproved = { by: P_HRHEAD, at: '2026-10-07', decision: 'approved', comment: null };

  it('one of two approvers cannot advance an all step alone', async () => {
    const r = await tx([{ sql: legacy(ROW, S_ASKER, chainOf(twoOf('all'))) }, { who: HOD, sql: addMine(P_HOD, { advance: true }) }]);
    expect(r.error).toBe(QUORUM_MSG);
  });

  it('…nor grant a final all step alone', async () => {
    const r = await tx([{ sql: legacy(ROW, S_ASKER, finalOnly('all')) }, { who: HOD, sql: addMine(P_HOD, { advance: false, grant: true }) }]);
    expect(r.error).toBe(QUORUM_MSG);
  });

  it('…nor does a super admin who is not on the step clear it alone', async () => {
    const r = await tx([{ sql: legacy(ROW, S_ASKER, chainOf(twoOf('all'))) },
      { who: { ...HR2, super: true }, sql: addMine(P_HR2, { advance: true }) }]);
    expect(r.error).toBe(QUORUM_MSG);
  });

  it('recording one approval without moving the request is fine', async () => {
    const r = await tx([{ sql: legacy(ROW, S_ASKER, chainOf(twoOf('all'))) }, { who: HOD, sql: addMine(P_HOD, { advance: false }) }]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toEqual([{ status: 'pending', current_step: 0 }]);
  });

  it('both approvers: the second one advances it, or grants a final step', async () => {
    let r = await tx([
      { sql: legacy(ROW, S_ASKER, chainOf(twoOf('all'))) },
      { who: HRHEAD, sql: addMine(P_HRHEAD, { advance: false }) },
      { who: HOD, sql: addMine(P_HOD, { advance: true }) },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[2]).toEqual([{ status: 'pending', current_step: 1 }]);
    r = await tx([
      { sql: legacy(ROW, S_ASKER, finalOnly('all', [hrheadApproved])) },
      { who: HOD, sql: addMine(P_HOD, { advance: false, grant: true }) },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toEqual([{ status: 'approved', current_step: 0 }]);
  });

  it('a rejection by the other approver does not count towards all', async () => {
    const r = await tx([
      { sql: legacy(ROW, S_ASKER, chainOf(twoOf('all', [{ ...hrheadApproved, decision: 'rejected' }]))) },
      { who: HOD, sql: addMine(P_HOD, { advance: true }) },
    ]);
    expect(r.error).toBe(QUORUM_MSG);
  });

  it('a role slot is covered by one more distinct approver', async () => {
    const step0 = { ...twoOf('all'), approvers: [{ approver_role: null, approver_user_id: P_HOD }, { approver_role: 'hr_head', approver_user_id: null }] };
    const alone = await tx([{ sql: legacy(ROW, S_ASKER, chainOf(step0)) }, { who: HOD, sql: addMine(P_HOD, { advance: true }) }]);
    expect(alone.error).toBe(QUORUM_MSG);
    const covered = await tx([
      { sql: legacy(ROW, S_ASKER, chainOf({ ...step0, decisions: [hrheadApproved] })) },
      { who: HOD, sql: addMine(P_HOD, { advance: true }) },
    ]);
    expect(covered.error).toBeNull();
  });

  it('one person approving twice covers one slot, not two', async () => {
    const step0 = { ...twoOf('all'), approvers: [{ approver_role: 'hod', approver_user_id: null }, { approver_role: 'hod', approver_user_id: null }] };
    const twice = `
      UPDATE public.hr_leave_eligibilities SET
        approval_chain = jsonb_set(approval_chain, '{0}', (approval_chain -> 0) || jsonb_build_object(
          'decisions', jsonb_build_array(
            jsonb_build_object('by', '${P_HOD}', 'at', now()::text, 'decision', 'approved', 'comment', NULL),
            jsonb_build_object('by', '${P_HOD}', 'at', now()::text, 'decision', 'approved', 'comment', 'again')),
          'decided_at', now()::text, 'decided_by', '${P_HOD}', 'comment', NULL)),
        current_step = 1, decided_by = '${P_HOD}', decided_at = now(), updated_at = now()
      WHERE id = '${ROW}' RETURNING status, current_step`;
    const r = await tx([{ sql: legacy(ROW, S_ASKER, chainOf(step0)) }, { who: HOD, sql: twice }]);
    expect(r.error).toBe(QUORUM_MSG);
  });

  it('any steps are unchanged: one approver advances or grants', async () => {
    let r = await tx([{ sql: legacy(ROW, S_ASKER, chainOf(twoOf('any'))) }, { who: HOD, sql: addMine(P_HOD, { advance: true }) }]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toEqual([{ status: 'pending', current_step: 1 }]);
    r = await tx([{ sql: legacy(ROW, S_ASKER, finalOnly('any')) }, { who: HOD, sql: addMine(P_HOD, { advance: false, grant: true }) }]);
    expect(r.error).toBeNull();
    expect(r.rows[1]).toEqual([{ status: 'approved', current_step: 0 }]);
  });
});
