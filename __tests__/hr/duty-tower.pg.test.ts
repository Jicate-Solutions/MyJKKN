/**
 * Behavioural proof for supabase/migrations/20271007161151_hr_duty_tower_and_reliability.sql,
 * part 1: the HR duty item facts and the weekly tower readings.
 *
 * The migration is applied VERBATIM with psql onto a throwaway database (its own
 * DO-block asserts run too), after a prelude that stands in for the production
 * tables it reads. fn_is_the_director is copied verbatim from 20270520090000.
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
const DBNAME = `hdt_tower_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

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

// ---------------------------------------------------------------------------
// Fixtures. T0 is a Tuesday; the IST week that holds every due time starts
// Monday 2026-08-31.
// ---------------------------------------------------------------------------
const T0 = '2026-09-01T10:00:00+05:30';
const WEEK = '2026-08-31';
const at = (hours: number) => new Date(Date.parse(T0) + hours * 3_600_000).toISOString();

const INST = '00000000-0000-4000-8000-0000000000a1';
const MEMBER_ROW = '00000000-0000-4000-8000-0000000000b1';
const APPROVER = '00000000-0000-4000-8000-0000000000c1';
const LV_LATE = '00000000-0000-4000-8000-000000000101';
const LV_EDGE = '00000000-0000-4000-8000-000000000102';
const LV_OPEN = '00000000-0000-4000-8000-000000000103';
const LV_REVOKED = '00000000-0000-4000-8000-000000000104';
const LV_TWO_STEP = '00000000-0000-4000-8000-000000000105';
const LV_ORIGINAL = '00000000-0000-4000-8000-000000000106';
const LV_CANCEL_COPY = '00000000-0000-4000-8000-000000000107';
const LV_REVOKED_TWO = '00000000-0000-4000-8000-000000000108';
const LV_SUPERSEDED = '00000000-0000-4000-8000-000000000109';
const LV_NOT_DUE = '00000000-0000-4000-8000-00000000010a';
const LV_SELF = '00000000-0000-4000-8000-00000000010b';
// A second team member who also holds an approver's profile (SELF_PROFILE).
const SELF_ROW = '00000000-0000-4000-8000-0000000000b2';
const SELF_PROFILE = '00000000-0000-4000-8000-0000000000c9';
const APPROVER2 = '00000000-0000-4000-8000-0000000000c2';
const UPLOADER = '00000000-0000-4000-8000-0000000000c3';
const A3_DIRECT = '00000000-0000-4000-8000-000000000201';
const A3_WAITED = '00000000-0000-4000-8000-000000000202';
const S2_OK = '00000000-0000-4000-8000-000000000301';
const S2_SELF_SUBJECT = '00000000-0000-4000-8000-000000000302';
const S2_SELF_UPLOADER = '00000000-0000-4000-8000-000000000303';
const S3_OK = '00000000-0000-4000-8000-000000000401';
const S3_RESUBMIT = '00000000-0000-4000-8000-000000000402';
const L2_OK = '00000000-0000-4000-8000-000000000501';
const L2_AUTO = '00000000-0000-4000-8000-000000000502';
const L2_GRANT = '00000000-0000-4000-8000-000000000503';
const G2_TWO = '00000000-0000-4000-8000-000000000601';
const G2_SELF = '00000000-0000-4000-8000-000000000602';
const R5_SELF = '00000000-0000-4000-8000-000000000701';
const APPROVER3 = '00000000-0000-4000-8000-0000000000c4';
const L2_BACKDATED = '00000000-0000-4000-8000-000000000504';
const DIRECTOR = '00000000-0000-4000-8000-0000000000d1';
// A second, small college: one L1 leave decided by one person.
const INST2 = '00000000-0000-4000-8000-0000000000a2';
const MEMBER2_ROW = '00000000-0000-4000-8000-0000000000b3';
const LV_SMALL = '00000000-0000-4000-8000-00000000010c';
const L2_REVOKED = '00000000-0000-4000-8000-000000000505';
const L2_FILER = '00000000-0000-4000-8000-000000000506';
const S3_FILER = '00000000-0000-4000-8000-000000000403';
const SUPER = '00000000-0000-4000-8000-0000000000d2';

/** One approval-chain step with the keys main writes (types/hr.ts LeaveApprovalStep). */
const step = (over: Record<string, unknown>) => ({
  step_order: 1, approver_role: 'hod', status: 'approved', escalate_after_hours: 48, ...over,
});

let client: Client;

async function insertLeave(id: string, chain: unknown[], extra: Record<string, unknown> = {}) {
  const row = {
    id, employee_id: MEMBER_ROW, approval_chain: JSON.stringify(chain), current_step: 0,
    status: 'approved', created_at: T0, ...extra,
  };
  const cols = Object.keys(row);
  await client.query(
    `INSERT INTO public.hr_leave_applications (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
    Object.values(row),
  );
}

async function facts(): Promise<Array<Record<string, any>>> {
  const r = await client.query(
    `SELECT * FROM public.fn_hr_duty_item_facts('2026-08-25'::timestamptz, '2026-09-25'::timestamptz)
      ORDER BY item_id, due_at`);
  return r.rows;
}

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-c', directorFunctionSql()]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();

  await client.query(`INSERT INTO public.profiles VALUES ($1, 'Approver One')`, [APPROVER]);
  await client.query(`INSERT INTO public.staff VALUES ($1, $2, NULL)`, [MEMBER_ROW, INST]);
  // A per-step override of 24 h, decided at 36 h: late (would be on time under the 48 h default).
  await insertLeave(LV_LATE, [step({ escalate_after_hours: 24, decided_at: at(36), decided_by: APPROVER })]);
  // Decided exactly at its 24 h due time: on time.
  await insertLeave(LV_EDGE, [step({ escalate_after_hours: 24, decided_at: at(24), decided_by: APPROVER3 })]);
  // Still waiting, long past its 48 h due time: late and open.
  await insertLeave(LV_OPEN, [step({ status: 'pending' })], { status: 'pending' });
  // Approved in 1 h, later revoked (applyRevocation sets the step to 'revoked').
  await insertLeave(LV_REVOKED, [step({ status: 'revoked', decided_at: at(1), decided_by: APPROVER, revoked_at: at(120) })],
    { status: 'rejected', revoked_at: at(120) });
  // Step 2 waits from step 1's decision (10 h), not from filing: decided at 50 h, due 58 h.
  await insertLeave(LV_TWO_STEP, [
    step({ decided_at: at(10), decided_by: APPROVER }),
    step({ step_order: 2, decided_at: at(50), decided_by: APPROVER }),
  ], { current_step: 1 });
  // An approved leave the applicant cancelled: cancelApplication copies the
  // decided chain onto a 'cancelled' row and points the original at it.
  await insertLeave(LV_CANCEL_COPY, [step({ decided_at: at(2), decided_by: APPROVER })],
    { status: 'cancelled', created_at: at(200) });
  await insertLeave(LV_ORIGINAL, [step({ decided_at: at(2), decided_by: APPROVER })],
    { superseded_by: LV_CANCEL_COPY });
  // Two steps, the second settled it and was later revoked: only the second is reversed.
  await insertLeave(LV_REVOKED_TWO, [
    step({ decided_at: at(5), decided_by: APPROVER }),
    step({ step_order: 2, status: 'revoked', decided_at: at(20), decided_by: APPROVER2 }),
  ], { status: 'rejected', current_step: 1, revoked_at: at(100) });
  // A pending leave already replaced by another row (superseded_by set): not open.
  await insertLeave(LV_SUPERSEDED, [step({ status: 'pending' })],
    { status: 'pending', superseded_by: LV_CANCEL_COPY });
  // Filed an hour ago and still waiting: not past due, so not counted yet.
  await insertLeave(LV_NOT_DUE, [step({ status: 'pending' })],
    { status: 'pending', created_at: new Date(Date.now() - 3_600_000).toISOString() });

  await client.query(`INSERT INTO public.profiles VALUES ($1, 'Approver Two'), ($2, 'Self Approver'), ($3, 'Uploader'),
      ($4, 'Approver Three'), ($5, 'The Director'), ($6, 'Super Admin')`,
    [APPROVER2, SELF_PROFILE, UPLOADER, APPROVER3, DIRECTOR, SUPER]);
  await client.query(
    `INSERT INTO public.platform_policies (policy_key, scope_type, value, data_type, classification)
     VALUES ('platform.the_director_profile_ids', 'global', $1::jsonb, 'array', 'major')`,
    [JSON.stringify([DIRECTOR])]);
  await client.query(`INSERT INTO public.staff VALUES ($1, $2, $3)`, [SELF_ROW, INST, SELF_PROFILE]);
  await client.query(`INSERT INTO public.staff VALUES ($1, $2, NULL)`, [MEMBER2_ROW, INST2]);
  await insertLeave(LV_SMALL, [step({ decided_at: at(2), decided_by: APPROVER })], { employee_id: MEMBER2_ROW });
  // A leave its own applicant decided.
  await insertLeave(LV_SELF, [step({ decided_at: at(3), decided_by: SELF_PROFILE })], { employee_id: SELF_ROW });

  // A3: a direct correction is written already approved (approved_at = created_at).
  await client.query(
    `INSERT INTO public.hr_attendance_regularizations (id, employee_id, status, approver_id, approved_at, created_at)
     VALUES ($1, $3, 'approved', $4, $5, $5), ($2, $3, 'approved', $4, $6, $7)`,
    [A3_DIRECT, A3_WAITED, MEMBER_ROW, APPROVER, at(5), at(10), T0]);
  // S2: verified by someone else; by the document's own team member; by its uploader.
  await client.query(
    `INSERT INTO public.hr_employee_documents
       (id, institution_id, staff_id, verification_status, verified_by, verified_at, uploaded_by, uploaded_at)
     VALUES ($1, $4, $5, 'verified', $7, $9, $8, $10),
            ($2, $4, $6, 'verified', $11, $9, $11, $10),
            ($3, $4, $5, 'verified', $8, $9, $8, $10)`,
    [S2_OK, S2_SELF_SUBJECT, S2_SELF_UPLOADER, INST, MEMBER_ROW, SELF_ROW, APPROVER, UPLOADER, at(5), T0, SELF_PROFILE]);
  // S3: reviewed by a person; and an older photo closed by the team member's
  // own resubmission (status 'rejected', reviewed_at set, no reviewer).
  await client.query(
    `INSERT INTO public.hr_staff_photo_submissions (id, institution_id, staff_id, status, reviewed_by, reviewed_at, submitted_at)
     VALUES ($1, $3, $4, 'approved', $5, $6, $7), ($2, $3, $4, 'rejected', NULL, $6, $7)`,
    [S3_OK, S3_RESUBMIT, INST, MEMBER_ROW, APPROVER, at(5), T0]);
  // L2: a claim decided by a person; one auto-rejected at night (approved_at, no
  // approved_by); and an HR grant, which is not a claim. Due: 2026-09-04 00:00 IST.
  await client.query(
    `INSERT INTO public.hr_comp_off_credits (id, employee_id, expires_on, source, status, approved_by, approved_at, created_at)
     VALUES ($1, $4, '2026-09-10', 'claim', 'approved', $5, $6, $7),
            ($2, $4, '2026-09-10', 'claim', 'rejected', NULL, $6, $7),
            ($3, $4, '2026-09-10', 'grant', 'approved', $5, $6, $7)`,
    [L2_OK, L2_AUTO, L2_GRANT, MEMBER_ROW, APPROVER, at(5), T0]);
  // L2: approved_at says 5 h (on time), but the server recorded the decision at
  // 100 h, after the 62 h due time: the server's time wins.
  await client.query(
    `INSERT INTO public.hr_comp_off_credits (id, employee_id, expires_on, source, status, approved_by, approved_at, created_at)
     VALUES ($1, $2, '2026-09-10', 'claim', 'approved', $3, $4, $5)`,
    [L2_BACKDATED, MEMBER_ROW, APPROVER, at(5), T0]);
  await client.query(
    `INSERT INTO public.hr_decision_emails (comp_off_credit_id, employee_id, decision, created_at) VALUES ($1, $2, 'approved', $3)`,
    [L2_BACKDATED, MEMBER_ROW, at(100)]);
  // L2: approved on time, later revoked (reversed); and a claim decided by the
  // person who filed it (created_by), which is left out.
  await client.query(
    `INSERT INTO public.hr_comp_off_credits
       (id, employee_id, expires_on, source, status, approved_by, approved_at, revoked_at, created_by, created_at)
     VALUES ($1, $3, '2026-09-10', 'claim', 'rejected', $4, $6, $7, NULL, $8),
            ($2, $3, '2026-09-10', 'claim', 'approved', $5, $6, NULL, $5, $8)`,
    [L2_REVOKED, L2_FILER, MEMBER_ROW, APPROVER, APPROVER2, at(5), at(50), T0]);
  // S3: a photo reviewed by the person who submitted it (submitted_by), left out.
  await client.query(
    `INSERT INTO public.hr_staff_photo_submissions (id, institution_id, staff_id, status, reviewed_by, reviewed_at, submitted_by, submitted_at)
     VALUES ($1, $2, $3, 'approved', $4, $5, $4, $6)`,
    [S3_FILER, INST, MEMBER_ROW, UPLOADER, at(5), T0]);
  // G2: two steps — the second starts waiting at the first's decision (10 h);
  // and a form approved by the person who filed it.
  await client.query(
    `INSERT INTO public.hr_form_submissions (id, institution_id, status, approval_history, submitted_by, created_at)
     VALUES ($1, $3, 'approved', $4::jsonb, $5, $7), ($2, $3, 'approved', $6::jsonb, $8, $7)`,
    [G2_TWO, G2_SELF, INST,
     JSON.stringify([
       { action: 'approve', at: at(10), actor_id: APPROVER },
       { action: 'approve', at: at(30), actor_id: APPROVER2 },
     ]),
     UPLOADER,
     JSON.stringify([{ action: 'approve', at: at(4), actor_id: SELF_PROFILE }]),
     T0, SELF_PROFILE]);
  // R5: a candidate approved by the person who submitted them.
  await client.query(
    `INSERT INTO public.hr_recruitment_candidates
       (id, institution_id, status, current_step, approval_chain, final_decided_at, submitted_by, submitted_at)
     VALUES ($1, $2, 'approved', 0, $3::jsonb, $4, $5, $6)`,
    [R5_SELF, INST, JSON.stringify([step({ decided_at: at(4), decided_by: SELF_PROFILE })]), at(4), SELF_PROFILE, T0]);
});

afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('the leave chain keys this file reads are the ones main writes', () => {
  it('types/hr.ts LeaveApprovalStep carries decided_at, decided_by, escalate_after_hours and skipped_at', () => {
    const src = fs.readFileSync(path.join(REPO, 'types/hr.ts'), 'utf8');
    const block = src.slice(src.indexOf('export interface LeaveApprovalStep'), src.indexOf('export interface LeaveApprovalStep') + 4000);
    for (const key of ['decided_at?:', 'decided_by?:', 'escalate_after_hours:', 'skipped_at?:']) {
      expect(block).toContain(key);
    }
    // fn_decide_recruitment_candidate (R5) writes the same per-step keys.
    const rc = fs.readFileSync(path.join(REPO, 'supabase/migrations/20260909230000_fn_decide_recruitment_candidate.sql'), 'utf8');
    expect(rc).toContain("'decided_at'");
    expect(rc).toContain("'decided_by'");
  });
});

describe('fn_hr_duty_item_facts — leave approval steps (L1)', () => {
  it("a step decided after its own escalate_after_hours counts late; one decided at the due time counts on time", async () => {
    const rows = await facts();
    const late = rows.find((r) => r.item_id === LV_LATE);
    const edge = rows.find((r) => r.item_id === LV_EDGE);
    expect(late).toMatchObject({ duty_code: 'L1', actor_id: APPROVER, on_time: false, institution_id: INST });
    expect(new Date(late!.due_at).toISOString()).toBe(at(24));
    expect(edge).toMatchObject({ on_time: true, actor_id: APPROVER3 });
  });

  it('a later step starts waiting when the step below it was decided', async () => {
    const rows = (await facts()).filter((r) => r.item_id === LV_TWO_STEP);
    expect(rows).toHaveLength(2);
    const second = rows.find((r) => new Date(r.done_at).toISOString() === at(50));
    expect(new Date(second!.arrived_at).toISOString()).toBe(at(10));
    expect(second!.on_time).toBe(true);
  });

  it('an open item past its due time counts as late and open, against no team member', async () => {
    const open = (await facts()).find((r) => r.item_id === LV_OPEN);
    expect(open).toMatchObject({ done_at: null, on_time: false, actor_id: null, reversed: false });
  });

  it('a revoked leave counts as reversed', async () => {
    const rows = await facts();
    expect(rows.find((r) => r.item_id === LV_REVOKED)).toMatchObject({ reversed: true, on_time: true, actor_id: APPROVER });
    expect(rows.find((r) => r.item_id === LV_EDGE)).toMatchObject({ reversed: false });
  });

  it("a leave the applicant cancelled is counted once, not again through its cancellation copy", async () => {
    const rows = await facts();
    expect(rows.filter((r) => r.item_id === LV_ORIGINAL)).toHaveLength(1);
    expect(rows.filter((r) => r.item_id === LV_CANCEL_COPY)).toHaveLength(0);
  });
});

describe('fn_hr_duty_tower_compute — the weekly reading', () => {
  it('is idempotent per week: a second compute changes nothing and adds no row', async () => {
    await client.query('BEGIN');
    try {
      const first = await client.query(`SELECT * FROM public.fn_hr_duty_tower_compute($1::date)`, [WEEK]);
      const snap1 = await client.query(
        `SELECT duty_code, institution_id, items, on_time, late, open_overdue, reversed, on_time_rate, reversal_rate, deciders,
                has_small_college
           FROM public.hr_duty_tower_readings ORDER BY duty_code, institution_id NULLS FIRST`);
      const second = await client.query(`SELECT * FROM public.fn_hr_duty_tower_compute($1::date)`, [WEEK]);
      const snap2 = await client.query(
        `SELECT duty_code, institution_id, items, on_time, late, open_overdue, reversed, on_time_rate, reversal_rate, deciders,
                has_small_college
           FROM public.hr_duty_tower_readings ORDER BY duty_code, institution_id NULLS FIRST`);
      expect(second.rows).toEqual(first.rows);
      expect(snap2.rows).toEqual(snap1.rows);
      expect(first.rows).toHaveLength(7);

      // L1: late, edge, open, revoked, two steps, original, and the two steps of
      // the revoked two-step leave = 9 items; on time: edge, revoked, both steps
      // of the two-step leave, the original and both revoked-two steps = 7. The
      // superseded, not-yet-due and self-decided leaves add nothing.
      const l1All = snap1.rows.find((r) => r.duty_code === 'L1' && r.institution_id === null);
      // + the small college's one leave (on time)
      expect(l1All).toMatchObject({ items: 10, late: 1, open_overdue: 1, reversed: 2, has_small_college: true });
      expect(l1All!.on_time).toBe(8);
      const l1College = snap1.rows.find((r) => r.duty_code === 'L1' && r.institution_id === INST);
      expect(l1College).toMatchObject({ items: 9, on_time: 7 });
      // three different people decided L1 items, so the tower gets the rate
      expect(l1All!.deciders).toBe(3);
      // ...but a small college sits under L1, so the tower still gets no rate
      expect(first.rows.find((r) => r.duty_code === 'L1').on_time_rate).toBeNull();
      // one person decided every S3 item: the tower gets no rate from it
      expect(first.rows.find((r) => r.duty_code === 'S3').on_time_rate).toBeNull();

      // S3: the photo closed by a resubmission is neither late, on time nor open.
      const s3All = snap1.rows.find((r) => r.duty_code === 'S3' && r.institution_id === null);
      expect(s3All).toMatchObject({ items: 1, on_time: 1, late: 0, open_overdue: 0 });
      // L2: the night's auto-reject and the HR grant are not counted.
      const l2All = snap1.rows.find((r) => r.duty_code === 'L2' && r.institution_id === null);
      // ok + back-dated (late) + revoked (on time, reversed); the filer's own claim is left out
      expect(l2All).toMatchObject({ items: 3, on_time: 2, late: 1, open_overdue: 0, reversed: 1 });
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('fn_hr_duty_item_facts — leave filters that must hold', () => {
  it('a revoked leave charges the reversal to the step that settled it, not the step below', async () => {
    const rows = (await facts()).filter((r) => r.item_id === LV_REVOKED_TWO);
    expect(rows).toHaveLength(2);
    const first = rows.find((r) => r.actor_id === APPROVER);
    const settling = rows.find((r) => r.actor_id === APPROVER2);
    expect(first).toMatchObject({ reversed: false });
    expect(settling).toMatchObject({ reversed: true });
  });

  it('a pending leave already superseded by another row is not an open item', async () => {
    expect((await facts()).filter((r) => r.item_id === LV_SUPERSEDED)).toHaveLength(0);
  });

  it('an open item that is not yet past due is not counted', async () => {
    const r = await client.query(
      `SELECT item_id FROM public.fn_hr_duty_item_facts(now() - interval '1 day', now() + interval '10 days')`);
    expect(r.rows.map((x) => x.item_id)).not.toContain(LV_NOT_DUE);
  });
});

describe('fn_hr_duty_item_facts — only items a person really decided, for someone else', () => {
  it('an attendance correction written already approved (it never waited) is left out', async () => {
    const ids = (await facts()).map((r) => r.item_id);
    expect(ids).not.toContain(A3_DIRECT);
    expect(ids).toContain(A3_WAITED);
  });

  it("a document verified by its own team member, or by the person who uploaded it, is left out", async () => {
    const ids = (await facts()).map((r) => r.item_id);
    expect(ids).toContain(S2_OK);
    expect(ids).not.toContain(S2_SELF_SUBJECT);
    expect(ids).not.toContain(S2_SELF_UPLOADER);
  });

  it('a leave decided by its own applicant, a form approved by its filer and a candidate approved by its submitter are left out', async () => {
    const ids = (await facts()).map((r) => r.item_id);
    expect(ids).not.toContain(LV_SELF);
    expect(ids).not.toContain(G2_SELF);
    expect(ids).not.toContain(R5_SELF);
  });

  it('a photo closed by a resubmission (no reviewer) is closed with no decision: not counted at all', async () => {
    const ids = (await facts()).map((r) => r.item_id);
    expect(ids).toContain(S3_OK);
    expect(ids).not.toContain(S3_RESUBMIT);
  });

  it('a comp-off claim auto-rejected at night (no decider) is not counted; only claims count, never a grant', async () => {
    const rows = await facts();
    expect(rows.find((r) => r.item_id === L2_OK)).toMatchObject({ duty_code: 'L2', actor_id: APPROVER, on_time: true });
    expect(rows.map((r) => r.item_id)).not.toContain(L2_AUTO);
    expect(rows.map((r) => r.item_id)).not.toContain(L2_GRANT);
  });

  it("an HR form's second step starts waiting at the first step's decision", async () => {
    const rows = (await facts()).filter((r) => r.item_id === G2_TWO);
    expect(rows).toHaveLength(2);
    const second = rows.find((r) => r.actor_id === APPROVER2);
    expect(new Date(second!.arrived_at).toISOString()).toBe(at(10));
  });
});

describe('working days skip Sundays (IST)', () => {
  it('one working day after a Saturday is the Monday, and three after a Thursday is the Monday too', async () => {
    const r = await client.query(
      `SELECT public.fn_hr_duty_tower_add_working_days('2026-09-05T10:00:00+05:30', 1) AS sat1,
              public.fn_hr_duty_tower_add_working_days('2026-09-03T10:00:00+05:30', 3) AS thu3`);
    expect(new Date(r.rows[0].sat1).toISOString()).toBe(new Date('2026-09-07T10:00:00+05:30').toISOString());
    expect(new Date(r.rows[0].thu3).toISOString()).toBe(new Date('2026-09-07T10:00:00+05:30').toISOString());
  });
});

describe('who may call the facts function', () => {
  it('a signed-in team member cannot call fn_hr_duty_item_facts (service role only)', async () => {
    for (const role of ['authenticated', 'anon']) {
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(
          client.query(`SELECT * FROM public.fn_hr_duty_item_facts(now() - interval '1 day', now())`),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await client.query('ROLLBACK');
      }
    }
  });

  it('nor fn_hr_duty_tower_compute', async () => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE authenticated');
      await expect(client.query(`SELECT * FROM public.fn_hr_duty_tower_compute($1::date)`, [WEEK]))
        .rejects.toThrow(/permission denied/);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('the readings are desk numbers, shown by college access', () => {
  it('a team member with hr.dashboard.manage sees the all-college rows and their own college only', async () => {
    await client.query('BEGIN');
    try {
      await client.query(`SELECT * FROM public.fn_hr_duty_tower_compute($1::date)`, [WEEK]);
      await client.query(`SELECT set_config('test.perms', 'hr.dashboard.manage', true), set_config('test.insts', '', true)`);
      await client.query('SET LOCAL ROLE authenticated');
      const noCollege = await client.query(`SELECT institution_id FROM public.hr_duty_tower_readings`);
      expect(noCollege.rows.every((r) => r.institution_id === null)).toBe(true);
      expect(noCollege.rows).toHaveLength(7);
      await client.query('RESET ROLE');
      await client.query(`SELECT set_config('test.perms', '', true)`);
      await client.query('SET LOCAL ROLE authenticated');
      const none = await client.query(`SELECT 1 FROM public.hr_duty_tower_readings`);
      expect(none.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('comp-off timing comes from the server where it can', () => {
  it("a claim whose approved_at was written earlier than the server's own record is judged by the server's time", async () => {
    const rows = await facts();
    const back = rows.find((r) => r.item_id === L2_BACKDATED);
    expect(new Date(back!.done_at).toISOString()).toBe(at(100));
    expect(back!.on_time).toBe(false);
    // no server record: approved_at is the fallback
    expect(new Date(rows.find((r) => r.item_id === L2_OK)!.done_at).toISOString()).toBe(at(5));
  });
});

/** Run sql as a signed-in caller; always rolled back. */
async function as(who: { uid?: string; superAdmin?: boolean; admin?: boolean; perms?: string; insts?: string },
                  sql: string, setup?: string) {
  await client.query('BEGIN');
  try {
    if (setup) await client.query(setup);
    await client.query(
      `SELECT set_config('test.uid', $1, true), set_config('test.super', $2, true), set_config('test.admin', $3, true),
              set_config('test.perms', $4, true), set_config('test.insts', $5, true), set_config('test.role', 'authenticated', true)`,
      [who.uid ?? '', who.superAdmin ? 'on' : '', who.admin ? 'on' : '', who.perms ?? '', who.insts ?? '']);
    await client.query('SET LOCAL ROLE authenticated');
    const r = await client.query(sql);
    return { rows: r.rows as Array<Record<string, any>>, error: null as string | null };
  } catch (e) {
    return { rows: [] as Array<Record<string, any>>, error: (e as Error).message };
  } finally {
    await client.query('ROLLBACK');
  }
}

describe('small readings (fewer than 3 deciders) are not a per-person view', () => {
  const compute = `SELECT public.fn_hr_duty_tower_compute('${WEEK}'::date)`;
  const read = `SELECT duty_code, institution_id, deciders FROM public.hr_duty_tower_readings`;

  it('an admin without hr.dashboard.manage sees only readings with at least 3 deciders', async () => {
    const r = await as({ uid: SUPER, admin: true }, read, compute);
    expect(r.error).toBeNull();
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.deciders >= 3)).toBe(true);
    expect(r.rows.map((x) => x.duty_code)).toContain('L1');
    expect(r.rows.map((x) => x.duty_code)).not.toContain('S3');
  });

  it('an hr.dashboard.manage holder with access to the college sees the small readings too', async () => {
    const r = await as({ uid: SUPER, perms: 'hr.dashboard.manage', insts: INST }, read, compute);
    expect(r.rows.some((x) => x.duty_code === 'S3' && x.institution_id === INST)).toBe(true);
  });

  it('the Director passes the readings rule with no HR permission and no admin role', async () => {
    await client.query('BEGIN');
    let total = 0;
    try {
      await client.query(compute);
      total = (await client.query(`SELECT count(*)::int AS n FROM public.hr_duty_tower_readings`)).rows[0].n;
    } finally {
      await client.query('ROLLBACK');
    }
    expect(total).toBeGreaterThan(7);
    const r = await as({ uid: DIRECTOR }, read, compute);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(total); // every reading, small ones included
  });
});

describe('the duty due rules: every insert audited, Director list only', () => {
  const update = `UPDATE public.hr_duty_tower_duties SET due_hours = 24, change_reason = 'test' WHERE duty_code = 'A3' RETURNING due_hours`;
  const insert = `INSERT INTO public.hr_duty_tower_duties
      (config_key, duty_code, display_name, loop_key, due_hours, source, is_active, change_reason)
    VALUES ('A4', 'A4', 'Test duty', 'hr-duty-a4', 24, 'test', false, 'test insert') RETURNING id`;

  it('a super admin who is not the Director cannot change, add or remove a duty', async () => {
    for (const sql of [update, insert]) {
      const r = await as({ uid: SUPER, superAdmin: true }, sql);
      expect(r.error).toMatch(/Only the Director/);
    }
    // signed-in callers hold no DELETE grant on the table at all
    const del = await as({ uid: SUPER, superAdmin: true }, `DELETE FROM public.hr_duty_tower_duties WHERE duty_code = 'A3'`);
    expect(del.error).toMatch(/permission denied|Only the Director/);
  });

  it('the Director can, and an insert is audited like an update', async () => {
    const r = await as({ uid: DIRECTOR, superAdmin: true }, `WITH a AS (${insert}) SELECT id FROM a`);
    expect(r.error).toBeNull();
    await client.query('BEGIN');
    try {
      await client.query(`SELECT set_config('test.uid', $1, true), set_config('test.super', 'on', true),
                                 set_config('test.role', 'authenticated', true)`, [DIRECTOR]);
      await client.query('SET LOCAL ROLE authenticated');
      const ins = await client.query(insert);
      const upd = await client.query(update);
      await client.query('RESET ROLE');
      expect(upd.rows[0].due_hours).toBe(24);
      const audit = await client.query(
        `SELECT old_value IS NULL AS was_insert, changed_by, change_reason FROM public.hr_duty_tower_duties_audit
          WHERE changed_by = $1 ORDER BY changed_at, was_insert DESC`, [DIRECTOR]);
      expect(audit.rows).toEqual([
        { was_insert: true, changed_by: DIRECTOR, change_reason: 'test insert' },
        { was_insert: false, changed_by: DIRECTOR, change_reason: 'test' },
      ]);
      expect(ins.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('the seven seeded duties were audited when the migration inserted them', async () => {
    const r = await client.query(
      `SELECT count(*)::int AS n FROM public.hr_duty_tower_duties_audit a WHERE a.old_value IS NULL`);
    expect(r.rows[0].n).toBe(7);
  });
});

describe('the filer rule covers comp-off created_by and photo submitted_by; a revoked claim is reversed', () => {
  it('a claim decided by its filer, and a photo reviewed by its submitter, are left out', async () => {
    const ids = (await facts()).map((r) => r.item_id);
    expect(ids).not.toContain(L2_FILER);
    expect(ids).not.toContain(S3_FILER);
  });

  it('a revoked comp-off claim counts as reversed', async () => {
    expect((await facts()).find((r) => r.item_id === L2_REVOKED)).toMatchObject({ reversed: true, actor_id: APPROVER });
  });
});

describe('no subtraction: a plain admin cannot rebuild a hidden small college from the all-colleges row', () => {
  const compute = `SELECT public.fn_hr_duty_tower_compute('${WEEK}'::date)`;
  const l1 = `SELECT institution_id, deciders FROM public.hr_duty_tower_readings WHERE duty_code = 'L1'`;

  it('with one small and one large college, an admin sees the large college only, not the all-colleges row', async () => {
    const r = await as({ uid: SUPER, admin: true }, l1, compute);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ institution_id: INST, deciders: 3 }]);
  });

  it('the Director sees all three L1 rows', async () => {
    const r = await as({ uid: DIRECTOR }, l1, compute);
    expect(r.rows.map((x) => x.institution_id).sort()).toEqual([INST, INST2, null].sort());
  });

  it('positive control: with no small college under it, the admin does see the all-colleges row', async () => {
    const r = await as({ uid: SUPER, admin: true }, l1,
      `DELETE FROM public.hr_leave_applications WHERE id = '${LV_SMALL}'; ${compute}`);
    expect(r.rows.map((x) => x.institution_id)).toContain(null);
  });
});

describe('the tower never carries a rate the readings would hide', () => {
  const compute = `SELECT duty_code, on_time_rate FROM public.fn_hr_duty_tower_compute('${WEEK}'::date)`;
  /** One approved R5 candidate decided by `who` at 10 h, at college `inst` (or none). */
  const candidate = (inst: string | null, who: string) => `
    INSERT INTO public.hr_recruitment_candidates
      (id, institution_id, status, current_step, approval_chain, final_decided_at, submitted_at)
    VALUES (gen_random_uuid(), ${inst ? `'${inst}'` : 'NULL'}, 'approved', 0,
            jsonb_build_array(jsonb_build_object('status', 'approved', 'decided_at', '${at(10)}',
              'decided_by', '${who}', 'escalate_after_hours', 72)),
            '${at(10)}', '${T0}')`;
  /** Three R5 candidates at INST, each decided by a different person; plus, optionally, one with no college. */
  const r5 = (withNoCollege: boolean) =>
    [candidate(INST, APPROVER), candidate(INST, APPROVER2), candidate(INST, APPROVER3),
     ...(withNoCollege ? [candidate(null, UPLOADER)] : [])].join(';');

  async function run(setup: string) {
    await client.query('BEGIN');
    try {
      await client.query(setup);
      const tower = await client.query(compute);
      const all = await client.query(
        `SELECT duty_code, has_small_college FROM public.hr_duty_tower_readings
          WHERE week_start = $1 AND institution_id IS NULL`, [WEEK]);
      return { tower: tower.rows, all: all.rows };
    } finally {
      await client.query('ROLLBACK');
    }
  }

  it('L1 has a small college under it: compute returns no rate for L1, and the rate comes back once it is gone', async () => {
    const withSmall = await run('SELECT 1');
    expect(withSmall.tower.find((r) => r.duty_code === 'L1').on_time_rate).toBeNull();
    const without = await run(`DELETE FROM public.hr_leave_applications WHERE id = '${LV_SMALL}'`);
    expect(without.tower.find((r) => r.duty_code === 'L1').on_time_rate).toBe('0.7778');
  });

  it('items with no college and fewer than 3 deciders mark the all-colleges row small, and keep its rate off the tower', async () => {
    const large = await run(r5(false));
    expect(large.all.find((r) => r.duty_code === 'R5')).toMatchObject({ has_small_college: false });
    expect(large.tower.find((r) => r.duty_code === 'R5').on_time_rate).toBe('1.0000');

    const withNoCollege = await run(r5(true));
    expect(withNoCollege.all.find((r) => r.duty_code === 'R5')).toMatchObject({ has_small_college: true });
    expect(withNoCollege.tower.find((r) => r.duty_code === 'R5').on_time_rate).toBeNull();
  });
});
