/**
 * Rehearsal of supabase/migrations/20270613101149_fn_my_desk_waiting_hr_queues.sql
 * on a throwaway PostgreSQL 16.
 *
 * The migration file is applied VERBATIM with psql, TWICE (a re-run must be
 * harmless), onto the smallest stand-ins it needs: the tables and columns the
 * new body reads (its own preflight refuses to apply if any is missing) and the
 * permission helpers, which answer from a persona row for auth.uid().
 * fn_leave_step_approvers is the real definition, read from its migration.
 * fn_hr_leave_scope_admits answers TRUE, so a leave row is never hidden by the
 * per-applicant scope test: whoever does not see one is excluded by the rule
 * this file is about.
 *
 * Then fn_my_desk_waiting() itself is called as each person:
 *   - each of the 11 new HR queues returns a row for a person it admits, and
 *     none of the 11 returns anything for a signed-in outsider;
 *   - a leave eligibility step pinned by name to the Director (an approvers
 *     list of one, no role) is on the Director's desk and nobody else's;
 *   - a 'waiting_director' raise for someone on the Director list shows only to
 *     the profile platform_policies 'hr.salary_revision.list_member_raise_decider_profile_id'
 *     names while that row is on (#4190), and to every approve holder while it
 *     is missing, off or malformed;
 *   - mutation controls: a copy of the migration with the regularisation
 *     admission rule removed, or with the decider filter disabled, must turn
 *     the matching assertions around (proves they are not vacuous).
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 *
 * WHEN IT SKIPS: this file lives under __tests__/lib/, so the lib unit job
 * (lib-unit-suite.yml, no Postgres) collects it too. There, and on a laptop
 * with no server, an unreachable Postgres SKIPS the whole file. It never skips
 * in the Postgres-service job: that job sets the *_TEST_PGUSER overrides, and
 * whenever any is set (or this file's own MYDESK_HR_TEST_PGUSER) the server is
 * required and a missing one fails loudly, as before.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270613101149_fn_my_desk_waiting_hr_queues.sql');
const LADDER = readFileSync(path.join(REPO, 'supabase/migrations/20260831120000_hr_leave_approval_flow_parallel_ladder.sql'), 'utf8');
const PGHOST = process.env.MYDESK_HR_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.MYDESK_HR_TEST_PGPORT ?? '5432';
const PGUSER = process.env.MYDESK_HR_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `mydesk_hrq_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const NEW_QUEUES = [
  'comp_off', 'leave_eligibility', 'regularisation', 'attendance_close', 'salary_revision',
  'payroll_period', 'staff_photo', 'employee_document', 'promotion', 'termination', 'onboarding_step',
] as const;

const u = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
// people
const OPS = u(1);        // HR officer: every operational key, one college, role hr_officer
const SUPER = u(2);      // super admin
const DIRECTOR = u(3);   // on the Director list; holds the approve key
const OUTSIDER = u(4);   // signed in, nothing else
const HR_HEAD = u(5);    // holds only the salary revision approve key
const EMP_P = u(6);      // the employee's own account
const MEMBER_P = u(7);   // another person on the Director list
// records
const ORG = u(101); const INST = u(102); const EMP = u(103); const MEMBER = u(104);
const ROLE_HR = u(105); const LEAVE_TYPE = u(106);
const ELIG_PINNED = u(201); const ELIG_ROLE = u(202); const REV_PLAIN = u(203); const REV_MEMBER = u(204);

function fnBlock(src: string, name: string): string {
  const m = src.match(new RegExp(`^CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?^\\$function\\$;$`, 'm'));
  if (!m) throw new Error(`${name} not found`);
  return m[0];
}

const STANDINS = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text);
CREATE TABLE public.staff (id uuid PRIMARY KEY, first_name text, last_name text, institution_id uuid, profile_id uuid);
CREATE TABLE public.custom_roles (id uuid PRIMARY KEY, role_key text, role_name text, is_active boolean);
CREATE TABLE public.user_roles (user_id uuid, role_id uuid);
CREATE TABLE public.learners_profiles (id uuid PRIMARY KEY, first_name text, last_name text);
CREATE TABLE public.platform_policies (
  policy_key text, scope_type text, scope_id uuid, is_active boolean, value jsonb);
CREATE TABLE public.hr_organizations (id uuid PRIMARY KEY, institution_id uuid, included_in_hr boolean);
CREATE TABLE public.hr_recruitment_candidates (
  id uuid PRIMARY KEY, name text, role_title text, status text, approval_chain jsonb, current_step int,
  hr_organization_id uuid, institution_id uuid, offer_issued_at timestamptz, role_specific_details jsonb,
  submitted_at timestamptz);
CREATE TABLE public.billing_refund_requests (
  id uuid PRIMARY KEY, request_number text, status text, student_id uuid, total_refund_amount numeric,
  flow_snapshot jsonb, current_stage_index int, initiated_at timestamptz, created_at timestamptz);
CREATE TABLE public.hr_leave_applications (
  id uuid PRIMARY KEY, employee_id uuid, status text, approval_chain jsonb, current_step int,
  hr_organization_id uuid, start_date date, end_date date, created_at timestamptz);
CREATE TABLE public.meeting_trigger_events (
  id uuid PRIMARY KEY, metric_key text, subject_label text, status text, director_decision text,
  explanation_deadline timestamptz, created_at timestamptz);
CREATE TABLE public.grievance_tickets (
  id uuid PRIMARY KEY, ticket_number text, subject text, assigned_to uuid, resolved_at timestamptz,
  withdrawn_at timestamptz, created_at timestamptz);
CREATE TABLE public.hr_comp_off_credits (
  id uuid PRIMARY KEY, employee_id uuid, status text, hr_organization_id uuid, worked_date date,
  expires_on date, credit_days numeric, created_at timestamptz DEFAULT now());
CREATE TABLE public.hr_leave_types (id uuid PRIMARY KEY, leave_type_name text);
CREATE TABLE public.hr_leave_eligibilities (
  id uuid PRIMARY KEY, employee_id uuid, leave_type_id uuid, status text, approval_chain jsonb,
  current_step int, hr_organization_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.hr_attendance_regularizations (
  id uuid PRIMARY KEY, employee_id uuid, status text, for_date date, created_at timestamptz DEFAULT now());
CREATE TABLE public.hr_attendance_periods (
  institution_id uuid, period_year int, period_month int, status text, reopened_at timestamptz);
CREATE TABLE public.hr_attendance_records (institution_id uuid, work_date date);
CREATE TABLE public.hr_salary_revision_requests (
  id uuid PRIMARY KEY, staff_id uuid, institution_id uuid, status text, is_cut boolean DEFAULT false,
  asked_monthly_gross numeric, principal_decided_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE public.hr_payroll_periods (
  id uuid PRIMARY KEY, institution_id uuid, hr_organization_id uuid, period_year int, period_month int,
  status text, engine_type text, created_at timestamptz DEFAULT now());
CREATE TABLE public.hr_payroll_period_approvals (period_id uuid, acted_at timestamptz);
CREATE TABLE public.hr_staff_photo_submissions (
  id uuid PRIMARY KEY, staff_id uuid, institution_id uuid, status text, submitted_at timestamptz DEFAULT now());
CREATE TABLE public.hr_employee_documents (
  id uuid PRIMARY KEY, staff_id uuid, institution_id uuid, document_name text, verification_status text,
  expires_at timestamptz, uploaded_at timestamptz DEFAULT now(), replaces_document_id uuid);
CREATE TABLE public.hr_promotion_applications (
  id uuid PRIMARY KEY, staff_id uuid, status text, from_designation_name text, to_designation_name text,
  submitted_at timestamptz DEFAULT now(), sedc_reviewed_at timestamptz);
CREATE TABLE public.hr_offboarding_cases (
  id uuid PRIMARY KEY, staff_id uuid, status text, separation_type text, termination_approval_chain jsonb,
  initiated_at timestamptz DEFAULT now());

-- What each person's helper RPCs answer.
CREATE TABLE public.test_persona (
  uid uuid PRIMARY KEY, super boolean DEFAULT false, perms text[] DEFAULT '{}', org_ids uuid[] DEFAULT '{}',
  staff_ids uuid[] DEFAULT '{}', staff_inst_ids uuid[] DEFAULT '{}', inst_access uuid[] DEFAULT '{}');
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT super FROM public.test_persona WHERE uid = auth.uid()), false) $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
-- Like production: a super admin passes every key.
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT super OR permission_name = ANY (perms) FROM public.test_persona WHERE uid = auth.uid()), false) $$;
CREATE FUNCTION public.fn_my_hr_organization_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT (SELECT org_ids FROM public.test_persona WHERE uid = auth.uid()) $$;
CREATE FUNCTION public.fn_my_designated_hr_org_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$ SELECT ARRAY[]::uuid[] $$;
CREATE FUNCTION public.fn_my_staff_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT (SELECT staff_ids FROM public.test_persona WHERE uid = auth.uid()) $$;
CREATE FUNCTION public.fn_my_staff_institution_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT (SELECT staff_inst_ids FROM public.test_persona WHERE uid = auth.uid()) $$;
CREATE FUNCTION public.role_has_institution_access(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT super OR $1 = ANY (inst_access) FROM public.test_persona WHERE uid = auth.uid()), false) $$;
CREATE FUNCTION public.fn_refund_assignee_match(jsonb, jsonb, uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.fn_hr_leave_scope_admits(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
${fnBlock(LADDER, 'fn_leave_step_approvers')}
`;

const OPS_PERMS = [
  'hr.leave.approve', 'hr.attendance.regularize_approve', 'hr.attendance.period.manage',
  'hr.attendance.period.view', 'hr.payroll.salary_revision.approve', 'hr.staff_photo.review',
  'hr.employees.edit', 'hr.recruitment.edit', 'hr.recruitment.view',
];

const SEED = `
INSERT INTO public.profiles VALUES
  ('${OPS}', 'hr_officer'), ('${SUPER}', 'super_admin'), ('${DIRECTOR}', 'director'), ('${OUTSIDER}', 'staff'),
  ('${HR_HEAD}', 'hr_head'), ('${EMP_P}', 'staff'), ('${MEMBER_P}', 'staff');
INSERT INTO public.test_persona (uid, super, perms, org_ids, staff_ids, staff_inst_ids, inst_access) VALUES
  ('${OPS}', false, ARRAY['${OPS_PERMS.join("','")}'], '{${ORG}}', '{}', '{${INST}}', '{${INST}}'),
  ('${SUPER}', true, '{}', '{}', '{}', '{}', '{}'),
  ('${DIRECTOR}', false, '{hr.payroll.salary_revision.approve}', '{}', '{}', '{}', '{}'),
  ('${OUTSIDER}', false, '{}', '{}', '{}', '{}', '{}'),
  ('${HR_HEAD}', false, '{hr.payroll.salary_revision.approve}', '{}', '{}', '{}', '{}'),
  ('${EMP_P}', false, '{hr.payroll.salary_revision.approve}', '{}', '{${EMP}}', '{${INST}}', '{}');
INSERT INTO public.custom_roles VALUES ('${ROLE_HR}', 'hr_officer', 'HR Officer', true);
INSERT INTO public.user_roles VALUES ('${OPS}', '${ROLE_HR}');

INSERT INTO public.institutions VALUES ('${INST}', 'Arts Demo College');
INSERT INTO public.hr_organizations VALUES ('${ORG}', '${INST}', true);
INSERT INTO public.staff VALUES
  ('${EMP}', 'Kavya', 'Subramani', '${INST}', '${EMP_P}'),
  ('${MEMBER}', 'Isvarya', 'Demo', '${INST}', '${MEMBER_P}');
INSERT INTO public.hr_leave_types VALUES ('${LEAVE_TYPE}', 'Earned leave');
INSERT INTO public.platform_policies VALUES
  ('platform.the_director_profile_ids', 'global', NULL, true, '["${DIRECTOR}", "${MEMBER_P}"]'::jsonb);

-- comp_off
INSERT INTO public.hr_comp_off_credits (id, employee_id, status, hr_organization_id, worked_date, expires_on, credit_days)
VALUES (gen_random_uuid(), '${EMP}', 'pending', '${ORG}', CURRENT_DATE - 3, CURRENT_DATE + 20, 1);
-- leave_eligibility: one routed to the hr_officer role, one pinned by name to the Director
INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, status, approval_chain, current_step, hr_organization_id) VALUES
  ('${ELIG_ROLE}', '${EMP}', '${LEAVE_TYPE}', 'pending', '[{"approvers":[{"approver_role":"hr_officer"}]}]', 0, '${ORG}'),
  ('${ELIG_PINNED}', '${EMP}', '${LEAVE_TYPE}', 'pending',
   '[{"approver_user_id":"${DIRECTOR}","approvers":[{"approver_user_id":"${DIRECTOR}"}]}]', 0, '${ORG}');
-- regularisation
INSERT INTO public.hr_attendance_regularizations (id, employee_id, status, for_date)
VALUES (gen_random_uuid(), '${EMP}', 'pending', CURRENT_DATE - 2);
-- attendance_close: attendance last month, no period row (open)
INSERT INTO public.hr_attendance_records VALUES
  ('${INST}', (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')) - interval '1 month')::date + 3);
-- salary_revision: an ordinary raise and a raise for someone on the Director list
INSERT INTO public.hr_salary_revision_requests (id, staff_id, institution_id, status, asked_monthly_gross) VALUES
  ('${REV_PLAIN}', '${EMP}', '${INST}', 'waiting_director', 52000),
  ('${REV_MEMBER}', '${MEMBER}', '${INST}', 'waiting_director', 90000);
-- payroll_period
INSERT INTO public.hr_payroll_periods (id, institution_id, hr_organization_id, period_year, period_month, status, engine_type)
VALUES (gen_random_uuid(), '${INST}', '${ORG}', 2026, 9, 'draft', 'v2');
-- staff_photo
INSERT INTO public.hr_staff_photo_submissions (id, staff_id, institution_id, status)
VALUES (gen_random_uuid(), '${EMP}', '${INST}', 'pending');
-- employee_document
INSERT INTO public.hr_employee_documents (id, staff_id, institution_id, document_name, verification_status)
VALUES (gen_random_uuid(), '${EMP}', '${INST}', 'Degree certificate', 'pending');
-- promotion
INSERT INTO public.hr_promotion_applications (id, staff_id, status, from_designation_name, to_designation_name)
VALUES (gen_random_uuid(), '${EMP}', 'submitted', 'Grade 1', 'Grade 2');
-- termination
INSERT INTO public.hr_offboarding_cases (id, staff_id, status, separation_type, termination_approval_chain)
VALUES (gen_random_uuid(), '${EMP}', 'open', 'termination', '[{"step":"hr","status":"pending"}]');
-- onboarding_step: an approved candidate with one open, unassigned step (open to HR roles)
INSERT INTO public.hr_recruitment_candidates (id, name, role_title, status, institution_id, role_specific_details, submitted_at)
VALUES (gen_random_uuid(), 'New Joiner', 'Lecturer', 'approved', '${INST}',
        '{"onboarding_steps":[{"step":"Documents","completed":false}]}', now());
`;

const DECIDER_KEY = 'hr.salary_revision.list_member_raise_decider_profile_id';

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** The Postgres-service job (test-suite.yml) sets *_TEST_PGUSER overrides; there a server is required. */
const POSTGRES_REQUIRED = Object.keys(process.env).some((k) => k.endsWith('_TEST_PGUSER'));

function postgresReachable(): boolean {
  try {
    execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', 'postgres', '-tAc', 'SELECT 1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
    });
    return true;
  } catch {
    return false;
  }
}

const PG_READY = POSTGRES_REQUIRED || postgresReachable();
if (!PG_READY) {
  console.warn(`[my-desk-hr-queues.pg] no PostgreSQL at ${PGHOST}:${PGPORT} (or no psql) — skipping this file`);
}

let client: Client;
let scratch: string;

type Row = { source: string; item_id: string; detail: string };
async function desk(uid: string): Promise<Row[]> {
  await client.query(`SELECT set_config('test.uid', $1, false)`, [uid]);
  return (await client.query('SELECT source, item_id::text, detail FROM public.fn_my_desk_waiting()')).rows;
}
const of = (rows: Row[], source: string) => rows.filter((r) => r.source === source).map((r) => r.item_id);

async function setDecider(value: string | null, active = true) {
  await client.query(`DELETE FROM public.platform_policies WHERE policy_key = $1`, [DECIDER_KEY]);
  if (value !== null) {
    await client.query(
      `INSERT INTO public.platform_policies VALUES ($1, 'global', NULL, $2, $3::jsonb)`,
      [DECIDER_KEY, active, value],
    );
  }
}

/** Apply a copy of the migration with one exact text swapped (must occur once). */
function applyMutant(from: string, to: string) {
  const src = readFileSync(MIGRATION, 'utf8');
  expect(src.split(from).length - 1).toBe(1);
  const file = path.join(scratch, 'mutant.sql');
  writeFileSync(file, src.replace(from, to));
  psql(['-d', DBNAME, '-f', file]);
}

beforeAll(async () => {
  if (!PG_READY) return;
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  scratch = mkdtempSync(path.join(tmpdir(), 'mydesk-hrq-'));
  writeFileSync(path.join(scratch, 'standins.sql'), STANDINS + SEED);
  psql(['-d', DBNAME, '-f', path.join(scratch, 'standins.sql')]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
});
afterAll(async () => {
  if (!PG_READY) return;
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe.skipIf(!PG_READY)('20270613101149 applies, and applies again', () => {
  it('first apply succeeds (its preflight finds everything it reads)', () => {
    expect(() => psql(['-d', DBNAME, '-f', MIGRATION])).not.toThrow();
  });
  it('second apply is harmless', async () => {
    expect(() => psql(['-d', DBNAME, '-f', MIGRATION])).not.toThrow();
    const n = await client.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'fn_my_desk_waiting'`);
    expect(n.rows[0].n).toBe(1);
  });
});

describe.skipIf(!PG_READY)('each new HR queue: a row for a person it admits, none for an outsider', () => {
  const admittedBy: Record<(typeof NEW_QUEUES)[number], string> = {
    comp_off: OPS, leave_eligibility: OPS, regularisation: OPS, attendance_close: OPS,
    salary_revision: OPS, staff_photo: OPS, employee_document: OPS, onboarding_step: OPS,
    payroll_period: SUPER, promotion: SUPER, termination: SUPER,
  };
  it.each(NEW_QUEUES.map((q) => [q]))('%s', async (q) => {
    expect(of(await desk(admittedBy[q]), q).length).toBeGreaterThan(0);
    expect(of(await desk(OUTSIDER), q)).toEqual([]);
  });
  it('the outsider has an empty desk overall', async () => {
    expect(await desk(OUTSIDER)).toEqual([]);
  });
});

describe.skipIf(!PG_READY)('leave_eligibility — a step pinned by name to the Director', () => {
  it("is on the Director's desk, marked as pinned to them", async () => {
    expect((await desk(DIRECTOR)).filter((r) => r.source === 'leave_eligibility'))
      .toEqual([{ source: 'leave_eligibility', item_id: ELIG_PINNED, detail: 'pinned to you by name' }]);
  });
  it("is on nobody else's (HR officer, super admin, HR head, the employee)", async () => {
    for (const uid of [OPS, SUPER, HR_HEAD, EMP_P]) expect(of(await desk(uid), 'leave_eligibility')).not.toContain(ELIG_PINNED);
  });
  it('control: the HR officer does see the request routed to their role', async () => {
    expect(of(await desk(OPS), 'leave_eligibility')).toEqual([ELIG_ROLE]);
  });
});

describe.skipIf(!PG_READY)('salary_revision — the decider row for raises of people on the Director list (#4190)', () => {
  const approvers = [OPS, SUPER, DIRECTOR, HR_HEAD];

  it('row missing: every approve holder sees both raises; nobody sees their own', async () => {
    await setDecider(null);
    for (const uid of approvers) expect(of(await desk(uid), 'salary_revision').sort()).toEqual([REV_PLAIN, REV_MEMBER].sort());
    expect(of(await desk(EMP_P), 'salary_revision')).toEqual([REV_MEMBER]);
    expect(of(await desk(OUTSIDER), 'salary_revision')).toEqual([]);
  });

  it('row present: the list member\'s raise only on the named decider\'s desk; the ordinary raise unchanged', async () => {
    await setDecider(`"${DIRECTOR}"`);
    expect(of(await desk(DIRECTOR), 'salary_revision').sort()).toEqual([REV_PLAIN, REV_MEMBER].sort());
    for (const uid of [OPS, SUPER, HR_HEAD]) expect(of(await desk(uid), 'salary_revision')).toEqual([REV_PLAIN]);
    expect(of(await desk(EMP_P), 'salary_revision')).toEqual([]);
  });

  it('row switched off or malformed: treated as missing', async () => {
    for (const [value, active] of [[`"${DIRECTOR}"`, false], ['"not-a-uuid"', true], [`["${DIRECTOR}"]`, true]] as const) {
      await setDecider(value, active);
      expect(of(await desk(HR_HEAD), 'salary_revision').sort()).toEqual([REV_PLAIN, REV_MEMBER].sort());
    }
    await setDecider(null);
  });
});

describe.skipIf(!PG_READY)('mutation controls (each mutant applied over the real one, then the real one restored)', () => {
  it('without the regularisation admission rule, the outsider would see the queue', async () => {
    applyMutant('    WHERE v_has_regularise\n', '    WHERE true\n');
    try {
      expect(of(await desk(OUTSIDER), 'regularisation').length).toBeGreaterThan(0);
    } finally {
      psql(['-d', DBNAME, '-f', MIGRATION]);
    }
    expect(of(await desk(OUTSIDER), 'regularisation')).toEqual([]);
  });

  it('without the decider filter, the HR head would see the list member\'s raise while the row is on', async () => {
    await setDecider(`"${DIRECTOR}"`);
    applyMutant('        AND v_list_raise_decider IS NOT NULL\n', '        AND false\n');
    try {
      expect(of(await desk(HR_HEAD), 'salary_revision')).toContain(REV_MEMBER);
    } finally {
      psql(['-d', DBNAME, '-f', MIGRATION]);
    }
    expect(of(await desk(HR_HEAD), 'salary_revision')).toEqual([REV_PLAIN]);
    await setDecider(null);
  });
});
