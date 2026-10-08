/**
 * Rehearsal of supabase/migrations/20270613101149_fn_my_desk_waiting_hr_queues.sql
 * and of its review follow-up 20271008110101_fn_my_desk_waiting_scope_fix.sql
 * on a throwaway PostgreSQL 16.
 *
 * Both files are applied VERBATIM with psql, each TWICE (a re-run must be
 * harmless), onto the smallest stand-ins they need: the tables and columns the
 * body reads (the preflights refuse to apply if any is missing) and the
 * permission helpers, which answer from a persona row for auth.uid().
 * role_has_institution_access answers TRUE for a NULL college, as production's
 * does — the hole findings 1 and 3 of the #4155 review are about.
 * fn_leave_step_approvers and the salary-revision helpers the follow-up CALLS
 * (fn_is_the_director, fn_hr_salary_revision_can_approve, the decider row and
 * hr_salary_revision_is_own / _is_unlinked / _is_list_member) are the real
 * definitions, read from their migrations.
 * fn_hr_leave_scope_admits answers TRUE, so a leave row is never hidden by the
 * per-applicant scope test: whoever does not see one is excluded by the rule
 * this file is about.
 *
 * Then fn_my_desk_waiting() itself (as 20271008110101 leaves it) is called as
 * each person:
 *   - each of the 11 new HR queues returns a row for a person it admits, and
 *     none of the 11 returns anything for a signed-in outsider;
 *   - a leave eligibility step pinned by name to the Director (an approvers
 *     list of one, no role) is on the Director's desk and nobody else's;
 *   - a 'waiting_director' raise (amount = pay asked for) shows only to the
 *     Director list (fn_hr_salary_revision_can_approve), never to a super admin
 *     or a holder of the .approve key who is not on it; a raise for someone on
 *     the Director list only to the profile platform_policies
 *     'hr.salary_revision.list_member_raise_decider_profile_id' names, and to
 *     nobody while that row is missing, off or malformed (the decide path
 *     refuses everyone then);
 *   - a hire or a staff photo with a NULL college reaches no college's desk;
 *   - an hr.attendance.approve_team holder sees only their own college's
 *     corrections; a regularize_approve holder still sees every college's;
 *   - no title is NULL when a piece of it is;
 *   - the follow-up refuses to apply when a column its body reads is missing
 *     (preflight) or when its body cannot run (test call), leaving the
 *     function as it was;
 *   - mutation controls: a copy of the follow-up with one of its fixes undone
 *     must turn the matching assertion around (proves none is vacuous).
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
const FIX = path.join(REPO, 'supabase/migrations/20271008110101_fn_my_desk_waiting_scope_fix.sql');
const mig = (name: string) => readFileSync(path.join(REPO, 'supabase/migrations', name), 'utf8');
const LADDER = mig('20260831120000_hr_leave_approval_flow_parallel_ladder.sql');
const DIRECTOR_LIST = mig('20270520090000_the_director_list.sql');
const REV_DIRECTOR_LIST = mig('20270524090000_hr_salary_revision_director_list.sql');
const REV_NO_SELF = mig('20271007150103_hr_salary_revision_no_self_decision.sql');
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
const TEAM_HEAD = u(8);  // head of department: hr.attendance.approve_team only, college A
// records
const ORG = u(101); const INST = u(102); const EMP = u(103); const MEMBER = u(104);
const ROLE_HR = u(105); const LEAVE_TYPE = u(106);
const INST_B = u(110); const ORG_B = u(111); const EMP_B = u(112);   // college B, included in HR
const INST_X = u(113); const ORG_X = u(114);                         // college X, NOT included in HR
const INST_N = u(115); const ORG_N = u(116);                         // a college with no name
const ELIG_PINNED = u(201); const ELIG_ROLE = u(202); const REV_PLAIN = u(203); const REV_MEMBER = u(204);
const HIRE_NULL = u(205); const PHOTO_NULL = u(206); const PHOTO_X = u(207);
const REG_A = u(208); const REG_B = u(209); const REV_COLLEGE = u(210); const HIRE_A = u(211);

/** One `CREATE OR REPLACE FUNCTION public.<name>(…) … $function$;` (or `$$;`) block, whole. */
function fnBlock(src: string, name: string): string {
  const m = src.match(new RegExp(`^CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?^(?:\\$function\\$|\\$\\$);$`, 'm'));
  if (!m) throw new Error(`${name} not found`);
  return m[0];
}

const STANDINS = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA auth;
-- test.uid for the tests below; request.jwt.claim.sub as Supabase's own reads
-- it, for the follow-up's apply-time test call.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(nullif(current_setting('test.uid', true), ''),
                  nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text);
CREATE TABLE public.staff (id uuid PRIMARY KEY, first_name text, last_name text, institution_id uuid, profile_id uuid,
  email text, institution_email text, is_active boolean DEFAULT true);
CREATE VIEW public.v_hr_staff AS SELECT id, is_active FROM public.staff;
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
  asked_monthly_gross numeric, principal_decided_at timestamptz, created_at timestamptz DEFAULT now(),
  subject_profile_id uuid, subject_was_list_member boolean DEFAULT false);
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
-- Like production: an empty array, never NULL, for someone with no staff record.
CREATE FUNCTION public.fn_my_staff_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT staff_ids FROM public.test_persona WHERE uid = auth.uid()), '{}') $$;
CREATE FUNCTION public.fn_my_staff_institution_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT (SELECT staff_inst_ids FROM public.test_persona WHERE uid = auth.uid()) $$;
-- Like production: a NULL college is "accessible" to everyone.
CREATE FUNCTION public.role_has_institution_access(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT $1 IS NULL
      OR COALESCE((SELECT super OR $1 = ANY (inst_access) FROM public.test_persona WHERE uid = auth.uid()), false) $$;
CREATE FUNCTION public.fn_refund_assignee_match(jsonb, jsonb, uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.fn_hr_leave_scope_admits(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
${fnBlock(LADDER, 'fn_leave_step_approvers')}
${fnBlock(DIRECTOR_LIST, 'fn_is_the_director')}
${fnBlock(REV_DIRECTOR_LIST, 'hr_salary_revision_director_ids')}
${fnBlock(REV_DIRECTOR_LIST, 'fn_hr_salary_revision_can_approve')}
${[
  'hr_salary_revision_list_member_raise_decider_id', 'hr_salary_revision_configured_decider_id',
  'hr_salary_revision_email_profile_ids_for', 'hr_salary_revision_email_profile_ids',
  'hr_salary_revision_request_identity', 'hr_salary_revision_is_own', 'hr_salary_revision_is_list_member',
  'hr_salary_revision_is_unlinked',
].map((n) => fnBlock(REV_NO_SELF, n)).join('\n')}
`;

// OPS holds the .approve key on purpose: since 20270524090000 it opens nothing
// (the final yes is the Director list), and the desk must agree.
const OPS_PERMS = [
  'hr.leave.approve', 'hr.attendance.regularize_approve', 'hr.attendance.period.manage',
  'hr.attendance.period.view', 'hr.payroll.salary_revision.approve', 'hr.payroll.salary_revision.college_check',
  'hr.staff_photo.review', 'hr.employees.edit', 'hr.recruitment.edit', 'hr.recruitment.view',
];

const SEED = `
INSERT INTO public.profiles VALUES
  ('${OPS}', 'hr_officer'), ('${SUPER}', 'super_admin'), ('${DIRECTOR}', 'director'), ('${OUTSIDER}', 'staff'),
  ('${HR_HEAD}', 'hr_head'), ('${EMP_P}', 'staff'), ('${MEMBER_P}', 'staff'), ('${TEAM_HEAD}', 'hod');
INSERT INTO public.test_persona (uid, super, perms, org_ids, staff_ids, staff_inst_ids, inst_access) VALUES
  ('${OPS}', false, ARRAY['${OPS_PERMS.join("','")}'], '{${ORG},${ORG_N}}', '{}', '{${INST}}', '{${INST},${INST_X},${INST_N}}'),
  ('${TEAM_HEAD}', false, '{hr.attendance.approve_team}', '{${ORG}}', '{}', '{${INST}}', '{${INST}}'),
  ('${SUPER}', true, '{}', '{}', '{}', '{}', '{}'),
  ('${DIRECTOR}', false, '{hr.payroll.salary_revision.approve}', '{}', '{}', '{}', '{}'),
  ('${OUTSIDER}', false, '{}', '{}', '{}', '{}', '{}'),
  ('${HR_HEAD}', false, '{hr.payroll.salary_revision.approve}', '{}', '{}', '{}', '{}'),
  ('${EMP_P}', false, '{hr.payroll.salary_revision.approve}', '{}', '{${EMP}}', '{${INST}}', '{}');
INSERT INTO public.custom_roles VALUES ('${ROLE_HR}', 'hr_officer', 'HR Officer', true);
INSERT INTO public.user_roles VALUES ('${OPS}', '${ROLE_HR}');

INSERT INTO public.institutions VALUES
  ('${INST}', 'Arts Demo College'), ('${INST_B}', 'Pharmacy Demo College'), ('${INST_X}', 'Excluded Demo School'),
  ('${INST_N}', NULL);
INSERT INTO public.hr_organizations VALUES
  ('${ORG}', '${INST}', true), ('${ORG_B}', '${INST_B}', true), ('${ORG_X}', '${INST_X}', false), ('${ORG_N}', '${INST_N}', true);
INSERT INTO public.staff (id, first_name, last_name, institution_id, profile_id) VALUES
  ('${EMP}', 'Kavya', 'Subramani', '${INST}', '${EMP_P}'),
  ('${MEMBER}', 'Isvarya', 'Demo', '${INST}', '${MEMBER_P}'),
  ('${EMP_B}', 'Ramya', 'Demo', '${INST_B}', NULL);
INSERT INTO public.hr_leave_types VALUES ('${LEAVE_TYPE}', 'Earned leave');
INSERT INTO public.platform_policies VALUES
  ('platform.the_director_profile_ids', 'global', NULL, true, '["${DIRECTOR}", "${MEMBER_P}"]'::jsonb);

-- comp_off (the second has no worked date: its title must not go NULL)
INSERT INTO public.hr_comp_off_credits (id, employee_id, status, hr_organization_id, worked_date, expires_on, credit_days)
VALUES (gen_random_uuid(), '${EMP}', 'pending', '${ORG}', CURRENT_DATE - 3, CURRENT_DATE + 20, 1),
       (gen_random_uuid(), '${EMP}', 'pending', '${ORG}', NULL, CURRENT_DATE + 20, 1);
-- leave_eligibility: one routed to the hr_officer role, one pinned by name to the Director
INSERT INTO public.hr_leave_eligibilities (id, employee_id, leave_type_id, status, approval_chain, current_step, hr_organization_id) VALUES
  ('${ELIG_ROLE}', '${EMP}', '${LEAVE_TYPE}', 'pending', '[{"approvers":[{"approver_role":"hr_officer"}]}]', 0, '${ORG}'),
  ('${ELIG_PINNED}', '${EMP}', '${LEAVE_TYPE}', 'pending',
   '[{"approver_user_id":"${DIRECTOR}","approvers":[{"approver_user_id":"${DIRECTOR}"}]}]', 0, '${ORG}');
-- regularisation: one in college A, one in college B
INSERT INTO public.hr_attendance_regularizations (id, employee_id, status, for_date) VALUES
  ('${REG_A}', '${EMP}', 'pending', CURRENT_DATE - 2),
  ('${REG_B}', '${EMP_B}', 'pending', CURRENT_DATE - 2);
-- attendance_close: attendance last month, no period row (open); INST_N has no name
INSERT INTO public.hr_attendance_records VALUES
  ('${INST}', (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')) - interval '1 month')::date + 3),
  ('${INST_N}', (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')) - interval '1 month')::date + 3);
-- salary_revision: an ordinary raise and a raise for someone on the Director list
-- (and one waiting for college A's principal check)
INSERT INTO public.hr_salary_revision_requests (id, staff_id, institution_id, status, asked_monthly_gross, subject_profile_id) VALUES
  ('${REV_PLAIN}', '${EMP}', '${INST}', 'waiting_director', 52000, '${EMP_P}'),
  ('${REV_MEMBER}', '${MEMBER}', '${INST}', 'waiting_director', 90000, '${MEMBER_P}'),
  ('${REV_COLLEGE}', '${EMP}', '${INST}', 'waiting_principal', 51000, '${EMP_P}');
-- payroll_period
INSERT INTO public.hr_payroll_periods (id, institution_id, hr_organization_id, period_year, period_month, status, engine_type)
VALUES (gen_random_uuid(), '${INST}', '${ORG}', 2026, 9, 'draft', 'v2');
-- staff_photo: college A; NO college (college B's team member); a college not included in HR
INSERT INTO public.hr_staff_photo_submissions (id, staff_id, institution_id, status) VALUES
  (gen_random_uuid(), '${EMP}', '${INST}', 'pending'),
  ('${PHOTO_NULL}', '${EMP_B}', NULL, 'pending'),
  ('${PHOTO_X}', '${EMP_B}', '${INST_X}', 'pending');
-- employee_document (the second has no name: its title must not go NULL)
INSERT INTO public.hr_employee_documents (id, staff_id, institution_id, document_name, verification_status) VALUES
  (gen_random_uuid(), '${EMP}', '${INST}', 'Degree certificate', 'pending'),
  (gen_random_uuid(), '${EMP}', '${INST}', NULL, 'pending');
-- promotion (the second has no designations: its title must not go NULL)
INSERT INTO public.hr_promotion_applications (id, staff_id, status, from_designation_name, to_designation_name) VALUES
  (gen_random_uuid(), '${EMP}', 'submitted', 'Grade 1', 'Grade 2'),
  (gen_random_uuid(), '${EMP}', 'submitted', NULL, NULL);
-- termination
INSERT INTO public.hr_offboarding_cases (id, staff_id, status, separation_type, termination_approval_chain)
VALUES (gen_random_uuid(), '${EMP}', 'open', 'termination', '[{"step":"hr","status":"pending"}]');
-- onboarding_step: approved candidates with one open, unassigned step (open to HR roles) —
-- one in college A, one with NO college (hired into college B's HR organisation)
INSERT INTO public.hr_recruitment_candidates (id, name, role_title, status, institution_id, hr_organization_id, role_specific_details, submitted_at) VALUES
  ('${HIRE_A}', 'New Joiner', 'Lecturer', 'approved', '${INST}', '${ORG}',
   '{"onboarding_steps":[{"step":"Documents","completed":false}]}', now()),
  ('${HIRE_NULL}', 'Unplaced Joiner', 'Lecturer', 'approved', NULL, '${ORG_B}',
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

type Row = { source: string; item_id: string; detail: string; title: string | null };
async function desk(uid: string): Promise<Row[]> {
  await client.query(`SELECT set_config('test.uid', $1, false)`, [uid]);
  return (await client.query('SELECT source, item_id::text, detail, title FROM public.fn_my_desk_waiting()')).rows;
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

/** The body md5 the drift checks compare (prosrc, CR-free, trimmed). */
async function bodyMd5(): Promise<string> {
  const r = await client.query(
    `SELECT md5(btrim(replace(prosrc, E'\\r', ''), E' \\t\\n')) AS m FROM pg_proc WHERE oid = to_regprocedure('public.fn_my_desk_waiting()')`,
  );
  return r.rows[0].m;
}

/** Put the real function back: 20270613101149 (DROP + CREATE), then the follow-up. */
function restore() {
  psql(['-d', DBNAME, '-f', MIGRATION]);
  psql(['-1', '-d', DBNAME, '-f', FIX]);
}

/** Apply, in one transaction, a copy of the follow-up with one exact text swapped (must occur once). */
function applyMutant(from: string, to: string) {
  const src = readFileSync(FIX, 'utf8');
  expect(src.split(from).length - 1).toBe(1);
  const file = path.join(scratch, 'mutant.sql');
  writeFileSync(file, src.replace(from, to));
  psql(['-1', '-d', DBNAME, '-f', file]);
}

/** Undo one fix, check the assertion turns around, then restore the real function. */
async function withMutant(from: string, to: string, check: () => Promise<void>) {
  applyMutant(from, to);
  try {
    await check();
  } finally {
    restore();
  }
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

describe.skipIf(!PG_READY)('20270613101149 applies, and applies again; 20271008110101 applies over it, and again', () => {
  it('first apply succeeds (its preflight finds everything it reads)', () => {
    expect(() => psql(['-d', DBNAME, '-f', MIGRATION])).not.toThrow();
  });
  it('second apply is harmless', async () => {
    expect(() => psql(['-d', DBNAME, '-f', MIGRATION])).not.toThrow();
    const n = await client.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'fn_my_desk_waiting'`);
    expect(n.rows[0].n).toBe(1);
  });
  it("the follow-up's drift check accepts production's body (20270613101149's), and the follow-up applies", async () => {
    expect(await bodyMd5()).toBe('95bdef9d97c60dedd2a685515802fad9');
    expect(() => psql(['-1', '-d', DBNAME, '-f', FIX])).not.toThrow();
    expect(await bodyMd5()).not.toBe('95bdef9d97c60dedd2a685515802fad9');
  });
  it('the follow-up re-applied over itself is harmless (its drift check accepts its own body)', async () => {
    const before = await bodyMd5();
    expect(() => psql(['-1', '-d', DBNAME, '-f', FIX])).not.toThrow();
    expect(await bodyMd5()).toBe(before);
    expect(readFileSync(FIX, 'utf8')).toContain(`'${before}'`);
  });
  it('the follow-up keeps the grants: authenticated may call it, anon and PUBLIC may not', async () => {
    const r = await client.query(`SELECT has_function_privilege('anon', 'public.fn_my_desk_waiting()', 'EXECUTE') AS anon,
                                         has_function_privilege('authenticated', 'public.fn_my_desk_waiting()', 'EXECUTE') AS auth`);
    expect(r.rows[0]).toEqual({ anon: false, auth: true });
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
    expect((await desk(DIRECTOR)).filter((r) => r.source === 'leave_eligibility').map(({ source, item_id, detail }) => ({ source, item_id, detail })))
      .toEqual([{ source: 'leave_eligibility', item_id: ELIG_PINNED, detail: 'pinned to you by name' }]);
  });
  it("is on nobody else's (HR officer, super admin, HR head, the employee)", async () => {
    for (const uid of [OPS, SUPER, HR_HEAD, EMP_P]) expect(of(await desk(uid), 'leave_eligibility')).not.toContain(ELIG_PINNED);
  });
  it('control: the HR officer does see the request routed to their role', async () => {
    expect(of(await desk(OPS), 'leave_eligibility')).toEqual([ELIG_ROLE]);
  });
});

describe.skipIf(!PG_READY)('salary_revision — the final yes is the Director list, and raise amounts reach nobody else (finding 2)', () => {
  const notOnTheList = [OPS, SUPER, HR_HEAD, EMP_P, OUTSIDER, TEAM_HEAD];
  const waitingDirector = (rows: Row[]) => of(rows, 'salary_revision').filter((id) => id !== REV_COLLEGE);

  it('a super admin who is not on the Director list sees NO raise waiting for the Director, and no amount', async () => {
    await setDecider(`"${DIRECTOR}"`);
    const rows = await desk(SUPER);
    expect(rows.filter((r) => r.source === 'salary_revision')).toEqual([]);
    await setDecider(null);
  });

  it('the Director sees the ordinary raise waiting for him', async () => {
    expect(waitingDirector(await desk(DIRECTOR))).toEqual([REV_PLAIN]);
  });

  it('holders of the .approve key who are not on the list (HR officer, HR head) see none either', async () => {
    for (const uid of notOnTheList) expect(waitingDirector(await desk(uid))).toEqual([]);
  });

  it('decider row on: the list member\'s raise only on the named decider\'s desk', async () => {
    await setDecider(`"${DIRECTOR}"`);
    expect(waitingDirector(await desk(DIRECTOR)).sort()).toEqual([REV_PLAIN, REV_MEMBER].sort());
    // On the Director list, but not the decider — and it is their own raise anyway.
    expect(waitingDirector(await desk(MEMBER_P))).toEqual([REV_PLAIN]);
    for (const uid of notOnTheList) expect(waitingDirector(await desk(uid))).toEqual([]);
    await setDecider(null);
  });

  it('decider row missing, off or malformed: the list member\'s raise is on nobody\'s desk (the decide path refuses everyone)', async () => {
    for (const [value, active] of [[null, true], [`"${DIRECTOR}"`, false], ['"not-a-uuid"', true], [`["${DIRECTOR}"]`, true]] as const) {
      await setDecider(value, active);
      expect(waitingDirector(await desk(DIRECTOR))).toEqual([REV_PLAIN]);
    }
    await setDecider(null);
  });

  it("the college check: the principal of college A (not a super admin) sees college A's request", async () => {
    expect(of(await desk(OPS), 'salary_revision')).toEqual([REV_COLLEGE]);
    expect(of(await desk(SUPER), 'salary_revision')).toEqual([]);
  });

  it('control: with the old copied rule (super admin OR .approve) the super admin would see the raise', async () => {
    await withMutant(
      "  v_can_rev_approve    := COALESCE(public.fn_hr_salary_revision_can_approve(), false);\n",
      "  v_can_rev_approve    := v_is_super OR COALESCE(public.user_has_permission('hr.payroll.salary_revision.approve'), false);\n",
      async () => { expect(waitingDirector(await desk(SUPER))).toContain(REV_PLAIN); },
    );
    expect(waitingDirector(await desk(SUPER))).toEqual([]);
  });
});

describe.skipIf(!PG_READY)('a NULL college reaches no other college (findings 1 and 3)', () => {
  it("onboarding_step: a hire with no college is on no recruitment editor's desk; college A's hire still is", async () => {
    const mine = of(await desk(OPS), 'onboarding_step');
    expect(mine).toContain(HIRE_A);
    expect(mine).not.toContain(HIRE_NULL);
  });
  it('control: without the guard, college A\'s HR officer would get the no-college hire', async () => {
    await withMutant(
      '              THEN c.institution_id IS NOT NULL\n                   AND c.hr_organization_id = ANY (v_org_ids)\n                   AND public.role_has_institution_access(c.institution_id)',
      '              THEN public.role_has_institution_access(c.institution_id)',
      async () => { expect(of(await desk(OPS), 'onboarding_step')).toContain(HIRE_NULL); },
    );
    expect(of(await desk(OPS), 'onboarding_step')).not.toContain(HIRE_NULL);
  });
  it("staff_photo: a photo with no college, or from a college not in HR, is on no reviewer's desk", async () => {
    const mine = of(await desk(OPS), 'staff_photo');
    expect(mine.length).toBe(1);
    expect(mine).not.toContain(PHOTO_NULL);
    expect(mine).not.toContain(PHOTO_X);
  });
  it('control: without the guard, the reviewer would get both', async () => {
    await withMutant(
      '              THEN ps.institution_id IS NOT NULL\n                   AND EXISTS (SELECT 1 FROM public.hr_organizations o\n                                WHERE o.institution_id = ps.institution_id AND o.included_in_hr)\n                   AND public.role_has_institution_access(ps.institution_id)',
      '              THEN public.role_has_institution_access(ps.institution_id)',
      async () => {
        const mine = of(await desk(OPS), 'staff_photo');
        expect(mine).toContain(PHOTO_NULL);
        expect(mine).toContain(PHOTO_X);
      },
    );
  });
});

describe.skipIf(!PG_READY)('regularisation — approve_team reaches the holder\'s own college only (finding 4)', () => {
  it("a head of department with approve_team sees college A's correction, not college B's", async () => {
    const rows = (await desk(TEAM_HEAD)).filter((r) => r.source === 'regularisation');
    expect(rows.map((r) => r.item_id)).toEqual([REG_A]);
    expect(rows[0].detail).toBe("attendance correction — you approve corrections for your team's college");
  });
  it('a regularize_approve holder still sees every college (the module is group-wide for that key)', async () => {
    expect(of(await desk(OPS), 'regularisation').sort()).toEqual([REG_A, REG_B].sort());
  });
  it('control: without the college test, the head of department would see college B too', async () => {
    await withMutant(
      '            WHEN v_has_approve_team\n              THEN st.institution_id IS NOT NULL\n                   AND public.role_has_institution_access(st.institution_id)',
      '            WHEN v_has_approve_team THEN true',
      async () => { expect(of(await desk(TEAM_HEAD), 'regularisation')).toContain(REG_B); },
    );
    expect(of(await desk(TEAM_HEAD), 'regularisation')).toEqual([REG_A]);
  });
});

describe.skipIf(!PG_READY)('titles never go NULL when one piece is NULL (finding 6)', () => {
  it('no row on any desk has a NULL or empty title', async () => {
    for (const uid of [OPS, SUPER, DIRECTOR, TEAM_HEAD]) {
      for (const r of await desk(uid)) expect(r.title ?? '', `${r.source} ${r.item_id}`).not.toBe('');
    }
  });
  it('the fallbacks read plainly', async () => {
    const ops = await desk(OPS);
    expect(ops.some((r) => r.source === 'attendance_close' && r.title?.startsWith('institution — '))).toBe(true);
    expect(ops.some((r) => r.source === 'employee_document' && r.title?.startsWith('document — '))).toBe(true);
    expect(ops.some((r) => r.source === 'comp_off' && r.title === 'Kavya Subramani')).toBe(true);
    expect((await desk(SUPER)).some((r) => r.source === 'promotion' && r.title?.endsWith('current post to new post'))).toBe(true);
  });
  it('control: without the COALESCE, the promotion with no designations has a NULL title', async () => {
    await withMutant(
      "        || ' — ' || COALESCE(NULLIF(pa.from_designation_name, ''), 'current post')\n        || ' to ' || COALESCE(NULLIF(pa.to_designation_name, ''), 'new post')  AS title,",
      "        || ' — ' || pa.from_designation_name || ' to ' || pa.to_designation_name  AS title,",
      async () => { expect((await desk(SUPER)).some((r) => r.source === 'promotion' && r.title === null)).toBe(true); },
    );
  });
});

describe.skipIf(!PG_READY)('the follow-up refuses to apply rather than break every desk (finding 5)', () => {
  it('a column the old one-per-table preflight never checked is missing: the preflight names it, nothing changes', async () => {
    const before = await bodyMd5();
    await client.query('BEGIN');
    try {
      await client.query('ALTER TABLE public.hr_employee_documents DROP COLUMN verification_status');
      await expect(client.query(readFileSync(FIX, 'utf8'))).rejects.toThrow(
        /not applied — missing hr_employee_documents\.verification_status/,
      );
    } finally {
      await client.query('ROLLBACK');
    }
    expect(await bodyMd5()).toBe(before);
  });
  it('a helper the body calls is missing: the preflight names it', async () => {
    await client.query('BEGIN');
    try {
      await client.query('DROP FUNCTION public.hr_salary_revision_is_unlinked(uuid, uuid)');
      await expect(client.query(readFileSync(FIX, 'utf8'))).rejects.toThrow(
        /missing .*public\.hr_salary_revision_is_unlinked\(uuid,uuid\)/,
      );
    } finally {
      await client.query('ROLLBACK');
    }
  });
  it('a body that cannot run (a column the preflight does not list) fails the test call, and the replace is undone', async () => {
    const before = await bodyMd5();
    expect(() => applyMutant(
      '      ps.submitted_at                                      AS waiting_since,',
      '      ps.no_such_column                                    AS waiting_since,',
    )).toThrow(/fails when called/);
    expect(await bodyMd5()).toBe(before);
  });
  it('a definition that is neither production\'s nor the follow-up\'s is refused by the drift check', async () => {
    await client.query('BEGIN');
    try {
      await client.query(`ALTER FUNCTION public.fn_my_desk_waiting() RESET search_path`);
      await expect(client.query(readFileSync(FIX, 'utf8'))).rejects.toThrow(/Drift: public\.fn_my_desk_waiting\(\)/);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
