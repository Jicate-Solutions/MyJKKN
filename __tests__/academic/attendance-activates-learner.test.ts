/**
 * Being marked PRESENT for the first time is what makes a learner active.
 * Behavioural proof for
 * supabase/migrations/20260821030000_attendance_activates_learner.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration is applied VERBATIM to a throwaway PostgreSQL. This suite never
 * re-implements the eligibility rule in TypeScript — it writes an attendance row
 * the way the marking screens write one, then reads back what PostgreSQL
 * actually did to the learner. A test that models the SQL only proves the model
 * agrees with itself, and would pass just as happily over a trigger that
 * activates nobody.
 *
 * NON-VACUITY IS PROVED, NOT ASSERTED
 * -----------------------------------
 * Two control triggers are built from the two tempting-but-wrong shapes:
 *   fn_ctl_blocklist  eligibility written as "anything except rejected"
 *   fn_ctl_anymark    fires on ANY mark instead of only on Present
 * Against the SAME fixture the suite shows each control produces an outcome the
 * real function does not — the blocklist activates a waitlisted learner, the
 * any-mark control activates a learner who was marked Absent. If the shipped
 * function ever regressed to either shape, these tests fail. Without the
 * controls, "rejected stayed rejected" could be true simply because nothing
 * activates at all.
 *
 * THE HEADLINE CHECK IS A TRANSITION AND A NON-TRANSITION, TOGETHER
 * ----------------------------------------------------------------
 * Either half alone is satisfiable by a broken trigger: one that activates
 * everybody passes the first, one that activates nobody passes the second.
 *
 * No literal production count is asserted anywhere. Roughly nine sessions write
 * the production database concurrently — the `admitted` population moved 124 →
 * 123 during a single sitting of this work — so a test pinned to a live number
 * would be measuring the clock. Every assertion here is about a fixture this
 * file created, or about a relationship (before/after, presence/absence).
 *
 * REQUIRES a PostgreSQL. This suite IS run by CI: test-suite.yml gates the whole
 * suite by glob minus an explicit quarantine list, and this path is not on it, so
 * the job runs this file against its postgres:16 service container. (An earlier
 * revision of this header said the opposite — true when written, and false from
 * the moment #2724 turned the lights on. Believing it is what left this file
 * connecting as `runner`.) It is deliberately loud rather than skipped when no
 * server is reachable; a silent skip would report green over a suite that never
 * executed.
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/academic/attendance-activates-learner.test.ts
 *
 * Override the server with ACTIVATE_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20260821030000_attendance_activates_learner.sql',
);
/**
 * Repair round 1 (PR #3924). Hardens the 2026-08-11 mechanism:
 *   A — an activation failure can no longer reject the attendance save
 *   C — an UPDATE activates only learners who BECOME present
 * Applied VERBATIM, like MIGRATION, and re-applied before every test so a case
 * that deliberately re-runs the 2026-08-11 file (which CREATE OR REPLACEs the
 * pre-repair body back over it) cannot silently un-harden the rest of the suite.
 */
const HARDEN = path.join(
  REPO,
  'supabase/migrations/20260919005000_harden_first_present_activation.sql',
);
/** The switch. Turns the rule on; refuses to do so over an unhardened body. */
const SWITCH_ON = path.join(
  REPO,
  'supabase/migrations/20260919010000_enable_activate_learner_on_first_present.sql',
);
/** The canonical rebuild file, so "a fresh environment ships it ON" is testable. */
const SETUP_POLICIES = path.join(REPO, 'supabase/setup/03_policies.sql');

const PGHOST = process.env.ACTIVATE_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.ACTIVATE_TEST_PGPORT ?? 5432);
// `process.env.USER` is the right default on a developer's machine — Homebrew's
// postgres creates a role named after the account — and the WRONG one in CI,
// where $USER is `runner` and no such role exists. test-suite.yml documents this
// exact trap ("an unlisted prefix falls back to `runner` and fails with 'role does
// not exist'") and hands the five suites it already knew about a *_TEST_PGUSER.
// This file is the sixth, so it resolves the CI case itself rather than depending
// on an env var somebody must remember to add: the postgres:16 service container
// the job starts always has a `postgres` superuser, with trust auth.
const PGUSER =
  process.env.ACTIVATE_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.ACTIVATE_TEST_PGPASSWORD;

const DBNAME = `activate_first_present_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

// ── Fixture identifiers. Fixed so a failure names a learner, not a random uuid ──
const INST = '00000000-0000-4000-8000-0000000000a1';
const SECTION = '00000000-0000-4000-8000-0000000000c1';
const TIMETABLE = '00000000-0000-4000-8000-0000000000e1';
const MARKER = '00000000-0000-4000-8000-0000000000d1';
/**
 * A signed-in caller with NO `profiles` row. `learners_profile_status_history`
 * .changed_by is `uuid REFERENCES public.profiles(id)` on production, and the
 * trigger writes auth.uid() into it — so this uuid is a REAL way for the audit
 * write to raise a foreign-key violation inside an AFTER trigger. Before repair
 * round 1 that took the whole attendance save down with it.
 */
const GHOST_MARKER = '00000000-0000-4000-8000-0000000000f1';

/** One learner per lifecycle_status the rule has an opinion about. */
const L = {
  reserved: '00000000-0000-4000-8000-000000000001',
  admitted: '00000000-0000-4000-8000-000000000002',
  rejected: '00000000-0000-4000-8000-000000000003',
  waitlisted: '00000000-0000-4000-8000-000000000004',
  enquiry: '00000000-0000-4000-8000-000000000005',
  enquirySubmitted: '00000000-0000-4000-8000-000000000006',
  account: '00000000-0000-4000-8000-000000000007',
  alreadyActive: '00000000-0000-4000-8000-000000000008',
  /** Marked Absent, never Present. The control for "PRESENT is the trigger". */
  reservedAbsent: '00000000-0000-4000-8000-000000000009',
  /** Real production data contains a lowercase 'absent' token, so a lowercase
   *  'present' is a shape the matcher must survive. */
  reservedLowercase: '00000000-0000-4000-8000-00000000000a',
} as const;

const POLICY_KEY = 'learners.activate_on_first_present.enabled';

let admin: Client;
let db: Client;
// Teardown must know what actually opened. `admin` is ASSIGNED before it is
// connected, so a connect failure used to leave afterAll running a query on a
// dead client — surfacing "Connection terminated unexpectedly" as a second,
// louder failure that buried the real one ("role X does not exist").
let adminConnected = false;
let dbConnected = false;

/**
 * The slice of the production estate this migration touches, rebuilt from the
 * LIVE catalog (read 2026-08-11), not from a schema file. Only the columns the
 * migration reads or writes are present — a fuller copy would drift.
 */
const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase's roles. anon must exist for the migration's own has_function_privilege
-- assertion to be meaningful rather than error.
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supabase grants EXECUTE on new functions to anon by default. Reproduced so the
-- migration's REVOKE has something real to revoke — without this the anon
-- assertion passes for the wrong reason.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

-- The marker's identity. Returns NULL when unset, exactly like a service-role
-- or SQL write with no JWT.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TYPE public.lifecycle_status AS ENUM (
  'admitted','pending','approved','account','rejected','waitlisted','active',
  'inactive','exited','graduated','alumni','enquiry','enquiry_submitted',
  'reserved','withdrawal_pending');

CREATE TABLE public.learners_profiles (
  id                uuid PRIMARY KEY,
  lifecycle_status  public.lifecycle_status NOT NULL,
  section_id        uuid,
  institution_id    uuid,
  activated_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now());

-- The identity the audit row's changed_by points at. Only the column the FK
-- needs — a fuller copy would drift. Present because the FK below is the single
-- most reachable way for the AFTER trigger to raise on a real estate.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY);

CREATE TABLE public.learners_profile_status_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id          uuid NOT NULL,
  from_status         public.lifecycle_status,
  to_status           public.lifecycle_status NOT NULL,
  reason_code         text,
  paid_pct_at_change  numeric,
  threshold_at_change numeric,
  -- The live constraint, from 20260517000005 and re-stated by 20260517000012.
  -- Omitting it is what made the pre-repair suite unable to see risk A at all.
  changed_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  metadata            jsonb DEFAULT '{}'::jsonb);

CREATE TABLE public.student_attendance (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_date  date  NOT NULL,
  institution_id   uuid  NOT NULL,
  timetable_id     uuid  NOT NULL,
  section_id       uuid  NOT NULL,
  attendance_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- NOT NULL on production and carries no default there; the DEFAULT here only
  -- spares every fixture INSERT in this file from restating the same marker.
  marked_by        uuid  NOT NULL DEFAULT '${MARKER}'::uuid,
  semester_id      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.platform_policies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key        text  NOT NULL,
  scope_type        text  NOT NULL,
  scope_id          uuid,
  value             jsonb NOT NULL,
  description       text,
  data_type         text  NOT NULL,
  enum_options      jsonb,
  validation_schema jsonb,
  is_system         boolean DEFAULT false,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  updated_by        uuid,
  classification    text NOT NULL DEFAULT 'major',
  draft_value       jsonb,
  publication_state text NOT NULL DEFAULT 'published',
  ui_widget         text,
  ui_options        jsonb,
  ui_consequence    text,
  ui_cascade        jsonb,
  ui_category       text,
  published_at      timestamptz,
  published_by      uuid);

-- The exact live index, including the COALESCE expression the migration's
-- ON CONFLICT clause targets. A plain UNIQUE(policy_key, scope_type, scope_id)
-- would NOT match that clause and the migration would fail to apply.
CREATE UNIQUE INDEX uq_platform_policies_key_scope
  ON public.platform_policies
  (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE OR REPLACE FUNCTION public.fn_policy_gate_observe(p_key text, p_result boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ BEGIN RETURN; END $$;

CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text, p_scope_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT value FROM public.platform_policies
   WHERE policy_key = p_key AND is_active = true
     AND COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.fn_get_policy_bool(
  p_key text, p_default boolean, p_scope_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_result boolean;
BEGIN
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))::boolean, p_default) INTO v_result;
  PERFORM public.fn_policy_gate_observe(p_key, v_result);
  RETURN v_result;
END $$;

-- The pre-existing BEFORE trigger that stamps activated_at. Present so the test
-- can show the migration cooperates with the cascade already on the table
-- rather than duplicating it.
CREATE OR REPLACE FUNCTION public.set_learner_activated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lifecycle_status = 'active'
     AND OLD.lifecycle_status IS DISTINCT FROM 'active'
     AND NEW.activated_at IS NULL THEN
    NEW.activated_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_set_learner_activated_at
BEFORE UPDATE OF lifecycle_status ON public.learners_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_learner_activated_at();

-- The four canonical authorization predicates. Present ONLY so the repair
-- migration's RLS policy on learner_activation_failures compiles; this suite
-- proves activation behaviour, never who may read a row. They deliberately
-- return false, so a policy that depended on them passing would show up as an
-- empty read rather than a false green.
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.user_has_permission(p_permission text) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.role_has_institution_access(p_institution_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
`;

/** Reset every learner and clear all history + attendance between tests. */
const RESET = `
TRUNCATE public.student_attendance;
TRUNCATE public.learners_profile_status_history;
TRUNCATE public.learner_activation_failures;
DELETE FROM public.learners_profiles;
INSERT INTO public.profiles (id) VALUES ('${MARKER}') ON CONFLICT DO NOTHING;
DELETE FROM public.profiles WHERE id = '${GHOST_MARKER}';
INSERT INTO public.learners_profiles (id, lifecycle_status, section_id, institution_id) VALUES
  ('${L.reserved}',          'reserved',          '${SECTION}', '${INST}'),
  ('${L.admitted}',          'admitted',          '${SECTION}', '${INST}'),
  ('${L.rejected}',          'rejected',          '${SECTION}', '${INST}'),
  ('${L.waitlisted}',        'waitlisted',        '${SECTION}', '${INST}'),
  ('${L.enquiry}',           'enquiry',           '${SECTION}', '${INST}'),
  ('${L.enquirySubmitted}',  'enquiry_submitted', '${SECTION}', '${INST}'),
  ('${L.account}',           'account',           '${SECTION}', '${INST}'),
  ('${L.alreadyActive}',     'active',            '${SECTION}', '${INST}'),
  ('${L.reservedAbsent}',    'reserved',          '${SECTION}', '${INST}'),
  ('${L.reservedLowercase}', 'reserved',          '${SECTION}', '${INST}');
-- Self-healing: two cases below DELETE the policy row on purpose (one re-seeds
-- it from the migration, one from supabase/setup/). Without this, a row deleted
-- by an earlier case would be missing for every later one and the failures would
-- point at the wrong test.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system)
VALUES ('${POLICY_KEY}', 'global', NULL, 'true'::jsonb, 'fixture', 'boolean', true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;
UPDATE public.platform_policies SET value = 'true'::jsonb WHERE policy_key = '${POLICY_KEY}';
`;

/**
 * Write an attendance row the way the marking screens write one: a JSONB object
 * keyed by period, each period holding a `students` array of
 * { status, student_id } — the shape measured on production 2026-08-11.
 */
function markPayload(marks: Array<[string, string]>, periodKey = 'P1'): string {
  return JSON.stringify({
    [periodKey]: {
      students: marks.map(([student_id, status]) => ({
        status,
        student_id,
        section_id: SECTION,
        marked_at: new Date().toISOString(),
      })),
    },
  });
}

async function mark(marks: Array<[string, string]>, date = '2026-08-11'): Promise<string> {
  const res = await db.query(
    `INSERT INTO public.student_attendance
       (attendance_date, institution_id, timetable_id, section_id, attendance_data)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
    [date, INST, TIMETABLE, SECTION, markPayload(marks)],
  );
  return res.rows[0].id;
}

async function statusOf(learnerId: string): Promise<string> {
  const r = await db.query(
    'SELECT lifecycle_status FROM public.learners_profiles WHERE id = $1',
    [learnerId],
  );
  return r.rows[0].lifecycle_status;
}

async function historyCount(learnerId?: string): Promise<number> {
  const r = learnerId
    ? await db.query(
        `SELECT count(*)::int n FROM public.learners_profile_status_history
          WHERE reason_code = 'first_present_attendance' AND learner_id = $1`,
        [learnerId],
      )
    : await db.query(
        `SELECT count(*)::int n FROM public.learners_profile_status_history
          WHERE reason_code = 'first_present_attendance'`,
      );
  return r.rows[0].n;
}

beforeAll(async () => {
  admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: 'postgres' });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(
      `Cannot reach PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}. This suite ` +
        `proves behaviour against a real engine and is USELESS without one, so it ` +
        `fails rather than skipping. Start one with: brew services start postgresql@16\n${e}`,
    );
  }
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${DBNAME}`);

  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  dbConnected = true;
  await db.query(SCHEMA);

  // THE MIGRATIONS ARE APPLIED VERBATIM. Nothing is edited, reordered or
  // inlined — what runs here is the artifact the PR ships.
  await db.query(readFileSync(MIGRATION, 'utf8'));
  await db.query(readFileSync(HARDEN, 'utf8'));
}, 60_000);

afterAll(async () => {
  if (dbConnected) await db.end();
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
    await admin.end();
  }
});

beforeEach(async () => {
  // Re-applied every test on purpose. Two cases below deliberately re-run the
  // 2026-08-11 migration, which CREATE OR REPLACEs the PRE-REPAIR body back over
  // the hardened one; without this, every later case would quietly be testing
  // the body the repair replaced — green, and measuring the wrong artifact.
  await db.query(readFileSync(HARDEN, 'utf8'));
  await db.query(RESET);
});

describe('the migration installs a switch that ships OFF', () => {
  it('seeds the master switch as false', async () => {
    // Read from a connection that has NOT run RESET's arming UPDATE: re-assert
    // the shipped default by rewriting the row to what the migration inserted.
    await db.query(`DELETE FROM public.platform_policies WHERE policy_key = $1`, [POLICY_KEY]);
    await db.query(readFileSync(MIGRATION, 'utf8'));
    const r = await db.query(
      `SELECT (value #>> '{}')::boolean AS enabled FROM public.platform_policies
        WHERE policy_key = $1`,
      [POLICY_KEY],
    );
    expect(r.rows[0].enabled).toBe(false);
  });

  it('re-applying does not switch OFF a switch someone turned ON', async () => {
    await db.query(`UPDATE public.platform_policies SET value='true'::jsonb WHERE policy_key=$1`, [POLICY_KEY]);
    await db.query(readFileSync(MIGRATION, 'utf8'));
    const r = await db.query(
      `SELECT (value #>> '{}')::boolean AS enabled FROM public.platform_policies WHERE policy_key=$1`,
      [POLICY_KEY],
    );
    expect(r.rows[0].enabled).toBe(true);
  });

  it('does nothing at all while the switch is off', async () => {
    await db.query(`UPDATE public.platform_policies SET value='false'::jsonb WHERE policy_key=$1`, [POLICY_KEY]);
    await mark([[L.reserved, 'Present']]);
    expect(await statusOf(L.reserved)).toBe('reserved');
    expect(await historyCount()).toBe(0);
  });
});

describe('the rule: the FIRST Present mark activates the learner', () => {
  it('moves a reserved learner to active', async () => {
    expect(await statusOf(L.reserved)).toBe('reserved');
    await mark([[L.reserved, 'Present']]);
    expect(await statusOf(L.reserved)).toBe('active');
  });

  it('moves an admitted learner to active', async () => {
    await mark([[L.admitted, 'Present']]);
    expect(await statusOf(L.admitted)).toBe('active');
  });

  it('does NOT move a learner who was only ever marked Absent', async () => {
    // The whole point of the ruling: attending is the event, not being rostered.
    await mark([[L.reservedAbsent, 'Absent']]);
    expect(await statusOf(L.reservedAbsent)).toBe('reserved');
    expect(await historyCount(L.reservedAbsent)).toBe(0);
  });

  it('matches a lowercase present token', async () => {
    // Production already contains a lowercase 'absent'; an exact-case compare
    // would silently miss a future lowercase writer and activate nobody.
    await mark([[L.reservedLowercase, 'present']]);
    expect(await statusOf(L.reservedLowercase)).toBe('active');
  });

  it('activates across periods, not only the first one in the payload', async () => {
    await db.query(
      `INSERT INTO public.student_attendance
         (attendance_date, institution_id, timetable_id, section_id, attendance_data)
       VALUES ($1,$2,$3,$4, $5::jsonb || $6::jsonb)`,
      [
        '2026-08-11', INST, TIMETABLE, SECTION,
        markPayload([[L.rejected, 'Present']], 'FN'),
        markPayload([[L.reserved, 'Present']], 'AN'),
      ],
    );
    expect(await statusOf(L.reserved)).toBe('active');
  });
});

describe('eligibility is an allowlist of exactly two statuses', () => {
  it.each([
    ['rejected', L.rejected],
    ['waitlisted', L.waitlisted],
    ['enquiry', L.enquiry],
    ['enquiry_submitted', L.enquirySubmitted],
    ['account', L.account],
  ])('never auto-activates a %s learner marked Present', async (status, id) => {
    await mark([[id, 'Present']]);
    expect(await statusOf(id)).toBe(status);
    expect(await historyCount(id)).toBe(0);
  });

  it('activates the eligible and refuses the ineligible in ONE payload', async () => {
    // Both halves together. A trigger that activates everybody passes the first
    // assertion; one that activates nobody passes the second.
    await mark([
      [L.reserved, 'Present'],
      [L.admitted, 'Present'],
      [L.rejected, 'Present'],
      [L.waitlisted, 'Present'],
      [L.enquiry, 'Present'],
      [L.enquirySubmitted, 'Present'],
      [L.account, 'Present'],
      [L.reservedAbsent, 'Absent'],
    ]);
    expect(await statusOf(L.reserved)).toBe('active');
    expect(await statusOf(L.admitted)).toBe('active');
    expect(await statusOf(L.rejected)).toBe('rejected');
    expect(await statusOf(L.waitlisted)).toBe('waitlisted');
    expect(await statusOf(L.enquiry)).toBe('enquiry');
    expect(await statusOf(L.enquirySubmitted)).toBe('enquiry_submitted');
    expect(await statusOf(L.account)).toBe('account');
    expect(await statusOf(L.reservedAbsent)).toBe('reserved');
    expect(await historyCount()).toBe(2);
  });
});

describe('idempotency — re-marking must not thrash the learner row', () => {
  it('leaves an already-active learner untouched and writes no history', async () => {
    await mark([[L.alreadyActive, 'Present']]);
    expect(await statusOf(L.alreadyActive)).toBe('active');
    expect(await historyCount(L.alreadyActive)).toBe(0);
  });

  it('re-saving an identical payload writes no second history row', async () => {
    const id = await mark([[L.reserved, 'Present']]);
    expect(await historyCount(L.reserved)).toBe(1);
    await db.query('UPDATE public.student_attendance SET attendance_data = attendance_data WHERE id = $1', [id]);
    expect(await historyCount(L.reserved)).toBe(1);
  });

  it('a CHANGED payload marking the same learner Present again writes no second row', async () => {
    // The stronger claim. The no-change guard cannot help here — the payload
    // really did change — so this proves the status allowlist is what stops it.
    const id = await mark([[L.reserved, 'Present']]);
    await db.query(
      `UPDATE public.student_attendance
          SET attendance_data = attendance_data || $2::jsonb WHERE id = $1`,
      [id, markPayload([[L.reserved, 'Present']], 'P2')],
    );
    expect(await historyCount(L.reserved)).toBe(1);
    expect(await statusOf(L.reserved)).toBe('active');
  });

  it('being marked present on many later days still yields exactly one activation', async () => {
    for (const d of ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']) {
      await mark([[L.reserved, 'Present']], d);
    }
    expect(await historyCount(L.reserved)).toBe(1);
  });
});

describe('the audit trail names what caused the activation', () => {
  it('records from/to, the reason code, and the attendance row', async () => {
    const attendanceId = await mark([[L.reserved, 'Present']]);
    const r = await db.query(
      `SELECT from_status, to_status, reason_code, metadata
         FROM public.learners_profile_status_history WHERE learner_id = $1`,
      [L.reserved],
    );
    expect(r.rowCount).toBe(1);
    const row = r.rows[0];
    expect(row.from_status).toBe('reserved');
    expect(row.to_status).toBe('active');
    expect(row.reason_code).toBe('first_present_attendance');
    expect(row.metadata.source).toBe('fn_activate_learner_on_first_present');
    expect(row.metadata.student_attendance_id).toBe(attendanceId);
    expect(row.metadata.section_id).toBe(SECTION);
    expect(row.metadata.from_status).toBe('admitted' === row.from_status ? 'admitted' : 'reserved');
    // The money consequence is recorded in the row itself, not only in prose.
    expect(row.metadata.fee_thresholds_bypassed).toBe(true);
  });

  it('records the marker when there is a session, and NULL when there is not', async () => {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [MARKER]);
    await mark([[L.reserved, 'Present']]);
    const withJwt = await db.query(
      'SELECT changed_by FROM public.learners_profile_status_history WHERE learner_id = $1',
      [L.reserved],
    );
    expect(withJwt.rows[0].changed_by).toBe(MARKER);

    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
    await mark([[L.admitted, 'Present']]);
    const noJwt = await db.query(
      'SELECT changed_by FROM public.learners_profile_status_history WHERE learner_id = $1',
      [L.admitted],
    );
    expect(noJwt.rows[0].changed_by).toBeNull();
  });

  it('cooperates with the pre-existing activated_at trigger instead of duplicating it', async () => {
    await mark([[L.reserved, 'Present']]);
    const r = await db.query(
      'SELECT activated_at FROM public.learners_profiles WHERE id = $1',
      [L.reserved],
    );
    expect(r.rows[0].activated_at).not.toBeNull();
  });
});

describe('malformed payloads cannot break a teaching session', () => {
  it.each([
    ['a period with no learner array at all', '{"P1": {"end_time": "12:55 PM"}}'],
    ['a learner array that is not an array', '{"P1": {"students": {"oops": true}}}'],
    ['an empty object', '{}'],
    ['a mark with no student_id', '{"P1": {"students": [{"status": "Present"}]}}'],
    ['a student_id that is not a uuid', '{"P1": {"students": [{"status":"Present","student_id":"not-a-uuid"}]}}'],
  ])('accepts the attendance write when the payload has %s', async (_label, payload) => {
    // An AFTER trigger that raised here would lose a whole session's marks.
    await expect(
      db.query(
        `INSERT INTO public.student_attendance
           (attendance_date, institution_id, timetable_id, section_id, attendance_data)
         VALUES ('2026-08-11', $1, $2, $3, $4::jsonb)`,
        [INST, TIMETABLE, SECTION, payload],
      ),
    ).resolves.toBeTruthy();
    expect(await historyCount()).toBe(0);
  });
});

describe('anon holds no EXECUTE on the trigger function', () => {
  it('is revoked despite the Supabase default grant', async () => {
    const r = await db.query(
      `SELECT has_function_privilege('anon',
         'public.fn_activate_learner_on_first_present()', 'EXECUTE') AS granted`,
    );
    expect(r.rows[0].granted).toBe(false);
  });
});

/**
 * NON-VACUITY. Each control is a shape a reasonable person might have written.
 * The suite shows the SHIPPED function behaves differently from both on the same
 * fixture — so these tests can tell right from wrong, rather than passing over
 * anything at all.
 */
describe('controls prove the assertions can fail', () => {
  beforeEach(async () => {
    await db.query(`
      CREATE OR REPLACE FUNCTION public.fn_ctl_blocklist() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $ctl$
      BEGIN
        UPDATE public.learners_profiles lp SET lifecycle_status='active'
         WHERE lp.id IN (
           SELECT (s.rec->>'student_id')::uuid
           FROM jsonb_each(NEW.attendance_data) per(k,v),
                jsonb_array_elements(COALESCE(per.v->'students','[]'::jsonb)) s(rec)
           WHERE lower(COALESCE(s.rec->>'status','')) = 'present')
           AND lp.lifecycle_status::text <> 'rejected';   -- a BLOCKLIST
        RETURN NULL;
      END $ctl$;

      CREATE OR REPLACE FUNCTION public.fn_ctl_anymark() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $ctl$
      BEGIN
        UPDATE public.learners_profiles lp SET lifecycle_status='active'
         WHERE lp.id IN (
           SELECT (s.rec->>'student_id')::uuid
           FROM jsonb_each(NEW.attendance_data) per(k,v),
                jsonb_array_elements(COALESCE(per.v->'students','[]'::jsonb)) s(rec))
           AND lp.lifecycle_status::text IN ('reserved','admitted');  -- ANY mark
        RETURN NULL;
      END $ctl$;
    `);
  });

  async function swapTo(fn: string) {
    await db.query('DROP TRIGGER IF EXISTS trg_activate_learner_on_first_present ON public.student_attendance');
    await db.query(
      `CREATE TRIGGER trg_ctl AFTER INSERT OR UPDATE OF attendance_data
         ON public.student_attendance FOR EACH ROW EXECUTE FUNCTION public.${fn}()`,
    );
  }
  async function dropControl() {
    await db.query('DROP TRIGGER IF EXISTS trg_ctl ON public.student_attendance');
  }

  it('the blocklist control WOULD activate a waitlisted learner — the shipped one does not', async () => {
    await swapTo('fn_ctl_blocklist');
    await mark([[L.waitlisted, 'Present']]);
    expect(await statusOf(L.waitlisted)).toBe('active'); // control is wrong…
    await dropControl();

    await db.query(RESET);
    await db.query(
      `CREATE TRIGGER trg_activate_learner_on_first_present
         AFTER INSERT OR UPDATE OF attendance_data ON public.student_attendance
         FOR EACH ROW EXECUTE FUNCTION public.fn_activate_learner_on_first_present()`,
    );
    await mark([[L.waitlisted, 'Present']]);
    expect(await statusOf(L.waitlisted)).toBe('waitlisted'); // …and shipped is right
  });

  it('the any-mark control WOULD activate an ABSENT learner — the shipped one does not', async () => {
    await swapTo('fn_ctl_anymark');
    await mark([[L.reservedAbsent, 'Absent']]);
    expect(await statusOf(L.reservedAbsent)).toBe('active'); // control is wrong…
    await dropControl();

    await db.query(RESET);
    await db.query(
      `CREATE TRIGGER trg_activate_learner_on_first_present
         AFTER INSERT OR UPDATE OF attendance_data ON public.student_attendance
         FOR EACH ROW EXECUTE FUNCTION public.fn_activate_learner_on_first_present()`,
    );
    await mark([[L.reservedAbsent, 'Absent']]);
    expect(await statusOf(L.reservedAbsent)).toBe('reserved'); // …and shipped is right
  });
});

/* ===========================================================================
 * REPAIR ROUND 1 (PR #3924) — the three risks a blind reviewer raised.
 *
 *   A  an activation or audit failure could reject the WHOLE
 *      attendance save. REAL. Fixed in 20260919005000.
 *   B  a wrong Present mark activates an unpaid learner and nothing undoes it.
 *      The Director's answer is that the OFFICE reverses it by hand, so the
 *      requirement is traceability, not automation. Mostly already true; one
 *      field added (`marked_by`).
 *   C  editing an OLD attendance row could activate learners whose Present
 *      marks predate the switch. REAL. Fixed in 20260919005000.
 *
 * Each risk gets a CONTROL built from the pre-repair shape, so these cases can
 * be seen to fail against the body they replaced rather than passing over
 * anything at all.
 * ======================================================================== */

/** Rows in the failure table, newest first. */
async function failures(): Promise<Array<Record<string, unknown>>> {
  const r = await db.query(
    'SELECT * FROM public.learner_activation_failures ORDER BY occurred_at DESC',
  );
  return r.rows;
}

/** Mark attendance as a specific signed-in caller (auth.uid()). */
async function markAs(
  jwtSub: string | null,
  marks: Array<[string, string]>,
  date = '2026-08-11',
): Promise<string> {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [jwtSub ?? '']);
  try {
    return await mark(marks, date);
  } finally {
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  }
}

describe('A — an activation failure must never reject the attendance save', () => {
  /**
   * NON-VACUITY FIRST. This control is the shipped 2026-08-11 promote-and-audit
   * with no exception handling — i.e. exactly the body this repair replaced. On
   * the SAME fixture it loses the marked attendance. If the shipped function ever
   * regressed to that shape, every case below would fail.
   */
  it('CONTROL: the pre-repair shape LOSES the attendance row when the audit write raises', async () => {
    await db.query(`
      CREATE OR REPLACE FUNCTION public.fn_ctl_unguarded() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $ctl$
      BEGIN
        WITH eligible AS (
          SELECT lp.id, lp.lifecycle_status AS from_status
          FROM public.learners_profiles lp
          WHERE lp.id = ANY(public.fn_present_learner_ids(NEW.attendance_data))
            AND lp.lifecycle_status::text IN ('reserved','admitted')),
        promoted AS (
          UPDATE public.learners_profiles lp SET lifecycle_status = 'active'
            FROM eligible e WHERE lp.id = e.id
          RETURNING lp.id AS learner_id, e.from_status)
        INSERT INTO public.learners_profile_status_history
          (learner_id, from_status, to_status, reason_code, changed_by)
        SELECT p.learner_id, p.from_status, 'active', 'first_present_attendance', auth.uid()
        FROM promoted p;
        RETURN NULL;
      END $ctl$;
    `);
    await db.query('DROP TRIGGER IF EXISTS trg_activate_learner_on_first_present ON public.student_attendance');
    await db.query(`CREATE TRIGGER trg_ctl AFTER INSERT OR UPDATE OF attendance_data
        ON public.student_attendance FOR EACH ROW EXECUTE FUNCTION public.fn_ctl_unguarded()`);

    // A signed-in caller with no profiles row → FK violation inside the AFTER
    // trigger → the INSERT that fired it is rolled back.
    await expect(markAs(GHOST_MARKER, [[L.reserved, 'Present']])).rejects.toThrow();
    const rows = await db.query('SELECT count(*)::int n FROM public.student_attendance');
    expect(rows.rows[0].n).toBe(0); // the marked attendance are GONE

    await db.query('DROP TRIGGER IF EXISTS trg_ctl ON public.student_attendance');
    await db.query(`CREATE TRIGGER trg_activate_learner_on_first_present
        AFTER INSERT OR UPDATE OF attendance_data ON public.student_attendance
        FOR EACH ROW EXECUTE FUNCTION public.fn_activate_learner_on_first_present()`);
  });

  it('A1 — a failing activation still saves the attendance, and the failure is recorded', async () => {
    const attendanceId = await markAs(GHOST_MARKER, [[L.reserved, 'Present']]);

    // The save itself survived.
    const saved = await db.query(
      'SELECT attendance_data FROM public.student_attendance WHERE id = $1',
      [attendanceId],
    );
    expect(saved.rowCount).toBe(1);

    // The learner was NOT activated — the activation genuinely failed.
    expect(await statusOf(L.reserved)).toBe('reserved');
    expect(await historyCount(L.reserved)).toBe(0);

    // And it is written down where a human will find it, not only warned about.
    const f = await failures();
    expect(f).toHaveLength(1);
    expect(f[0].sqlstate).toBe('23503');              // foreign_key_violation
    expect(f[0].student_attendance_id).toBe(attendanceId);
    expect(f[0].learner_ids).toContain(L.reserved);
    expect(f[0].trigger_op).toBe('INSERT');
    expect(f[0].marked_by).toBe(MARKER);              // who marked, always known
    expect(f[0].attempted_by).toBe(GHOST_MARKER);     // who the db thought called
    expect(String(f[0].error_message).length).toBeGreaterThan(0);
  });

  it('A1 — a cascading trigger that raises is caught too, not only the audit FK', async () => {
    // Any of the five triggers watching the learners_profiles UPDATE could do
    // this. The repair must not be a patch for one known failure path.
    await db.query(`
      CREATE OR REPLACE FUNCTION public.fn_ctl_explode() RETURNS trigger
      LANGUAGE plpgsql AS $ctl$
      BEGIN RAISE EXCEPTION 'a cascading trigger blew up'; END $ctl$;
    `);
    await db.query(`CREATE TRIGGER trg_ctl_explode BEFORE UPDATE OF lifecycle_status
        ON public.learners_profiles FOR EACH ROW EXECUTE FUNCTION public.fn_ctl_explode()`);
    try {
      const attendanceId = await mark([[L.reserved, 'Present']]);
      expect(attendanceId).toBeTruthy();
      expect(await statusOf(L.reserved)).toBe('reserved');
      const f = await failures();
      expect(f).toHaveLength(1);
      expect(String(f[0].error_message)).toContain('a cascading trigger blew up');
    } finally {
      await db.query('DROP TRIGGER IF EXISTS trg_ctl_explode ON public.learners_profiles');
    }
  });

  it('A1 — even a broken failure RECORDER cannot reject the attendance save', async () => {
    // The handler's own INSERT has its own handler. Without that nesting, the
    // fix would have reintroduced the defect one layer down.
    await db.query('DROP TABLE public.learner_activation_failures');
    try {
      const attendanceId = await markAs(GHOST_MARKER, [[L.reserved, 'Present']]);
      expect(attendanceId).toBeTruthy();
      expect(await statusOf(L.reserved)).toBe('reserved');
    } finally {
      // beforeEach re-applies HARDEN, which recreates the table; do it here too
      // so a failure in this case cannot cascade into the next one.
      await db.query(readFileSync(HARDEN, 'utf8'));
    }
  });

  it('A2 — the normal path is unchanged: the learner activates and history is written', async () => {
    const attendanceId = await markAs(MARKER, [[L.reserved, 'Present']]);
    expect(await statusOf(L.reserved)).toBe('active');
    expect(await historyCount(L.reserved)).toBe(1);
    expect(await failures()).toHaveLength(0);
    const r = await db.query(
      'SELECT activated_at FROM public.learners_profiles WHERE id = $1',
      [L.reserved],
    );
    expect(r.rows[0].activated_at).not.toBeNull();
    expect(attendanceId).toBeTruthy();
  });
});

describe('B — every activation is traceable by hand, because nothing undoes it', () => {
  it('B1 — the history row names the reason, the attendance row and who marked it', async () => {
    const attendanceId = await markAs(MARKER, [[L.admitted, 'Present']]);
    const r = await db.query(
      `SELECT from_status, to_status, reason_code, changed_by, metadata
         FROM public.learners_profile_status_history WHERE learner_id = $1`,
      [L.admitted],
    );
    expect(r.rowCount).toBe(1);
    const row = r.rows[0];

    // "this came from first-present attendance"
    expect(row.reason_code).toBe('first_present_attendance');
    expect(row.metadata.source).toBe('fn_activate_learner_on_first_present');
    expect(row.metadata.trigger_op).toBe('INSERT');

    // "…on this attendance record"
    expect(row.metadata.student_attendance_id).toBe(attendanceId);
    expect(row.metadata.attendance_date).toBe('2026-08-11');
    expect(row.metadata.section_id).toBe(SECTION);
    expect(row.metadata.timetable_id).toBe(TIMETABLE);

    // "…marked by this person". changed_by is auth.uid() and is NULL on every
    // service-role / SQL write path, so marked_by is the field that is always
    // answerable — added in repair round 1.
    expect(row.changed_by).toBe(MARKER);
    expect(row.metadata.marked_by).toBe(MARKER);

    // "…and it went round the fee gate"
    expect(row.from_status).toBe('admitted');
    expect(row.to_status).toBe('active');
    expect(row.metadata.fee_thresholds_bypassed).toBe(true);
  });

  it('B1 — marked_by survives a write with no JWT at all, where changed_by cannot', async () => {
    await mark([[L.reserved, 'Present']]); // no request.jwt.claim.sub set
    const r = await db.query(
      'SELECT changed_by, metadata FROM public.learners_profile_status_history WHERE learner_id = $1',
      [L.reserved],
    );
    expect(r.rows[0].changed_by).toBeNull();           // the old "who" is blank…
    expect(r.rows[0].metadata.marked_by).toBe(MARKER); // …and the new one is not
  });
});

describe('C — editing an old attendance row must not activate anybody retroactively', () => {
  /**
   * The scenario the reviewer described, built end to end: a Present mark is
   * recorded while the rule is OFF, the rule is switched ON, and then somebody
   * edits that row for an unrelated reason.
   */
  async function markedBeforeTheSwitch(): Promise<string> {
    await db.query(`UPDATE public.platform_policies SET value='false'::jsonb WHERE policy_key=$1`, [POLICY_KEY]);
    const id = await mark([[L.reserved, 'Present'], [L.admitted, 'Absent']]);
    expect(await statusOf(L.reserved)).toBe('reserved'); // inert while OFF
    await db.query(`UPDATE public.platform_policies SET value='true'::jsonb WHERE policy_key=$1`, [POLICY_KEY]);
    return id;
  }

  it('C1 — an edit that moves nobody into Present activates nobody', async () => {
    const id = await markedBeforeTheSwitch();
    // The office adds a second period. Nobody's Present status changes.
    await db.query(
      `UPDATE public.student_attendance
          SET attendance_data = attendance_data || $2::jsonb WHERE id = $1`,
      [id, markPayload([[L.admitted, 'Absent']], 'P2')],
    );
    expect(await statusOf(L.reserved)).toBe('reserved');
    expect(await historyCount()).toBe(0);
    expect(await failures()).toHaveLength(0);
  });

  it('C2 — an edit that moves a learner from Absent to Present activates exactly that learner', async () => {
    const id = await markedBeforeTheSwitch();
    // The marker corrects ONE learner's mark. The other was already present
    // before the switch existed and must stay where they are.
    await db.query(
      `UPDATE public.student_attendance SET attendance_data = $2::jsonb WHERE id = $1`,
      [id, markPayload([[L.reserved, 'Present'], [L.admitted, 'Present']])],
    );
    expect(await statusOf(L.admitted)).toBe('active');   // BECAME present
    expect(await statusOf(L.reserved)).toBe('reserved'); // was already present
    expect(await historyCount()).toBe(1);
    const r = await db.query(
      `SELECT metadata FROM public.learners_profile_status_history WHERE learner_id = $1`,
      [L.admitted],
    );
    expect(r.rows[0].metadata.trigger_op).toBe('UPDATE');
  });

  it('CONTROL: the pre-repair "everyone present in NEW" shape WOULD activate them both', async () => {
    const id = await markedBeforeTheSwitch();
    await db.query(`
      CREATE OR REPLACE FUNCTION public.fn_ctl_all_present() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $ctl$
      BEGIN
        UPDATE public.learners_profiles lp SET lifecycle_status = 'active'
         WHERE lp.id = ANY(public.fn_present_learner_ids(NEW.attendance_data))
           AND lp.lifecycle_status::text IN ('reserved','admitted');
        RETURN NULL;
      END $ctl$;
    `);
    await db.query('DROP TRIGGER IF EXISTS trg_activate_learner_on_first_present ON public.student_attendance');
    await db.query(`CREATE TRIGGER trg_ctl AFTER INSERT OR UPDATE OF attendance_data
        ON public.student_attendance FOR EACH ROW EXECUTE FUNCTION public.fn_ctl_all_present()`);

    await db.query(
      `UPDATE public.student_attendance SET attendance_data = $2::jsonb WHERE id = $1`,
      [id, markPayload([[L.reserved, 'Present'], [L.admitted, 'Present']])],
    );
    // The control activates the learner whose Present mark predates the switch —
    // the exact retroactive activation risk C describes.
    expect(await statusOf(L.reserved)).toBe('active');

    await db.query('DROP TRIGGER IF EXISTS trg_ctl ON public.student_attendance');
    await db.query(`CREATE TRIGGER trg_activate_learner_on_first_present
        AFTER INSERT OR UPDATE OF attendance_data ON public.student_attendance
        FOR EACH ROW EXECUTE FUNCTION public.fn_activate_learner_on_first_present()`);
  });

  it('C3 — repeat saves stay idempotent: identical, changed, and on later days', async () => {
    const id = await mark([[L.reserved, 'Present']]);
    expect(await historyCount(L.reserved)).toBe(1);

    // identical re-save
    await db.query('UPDATE public.student_attendance SET attendance_data = attendance_data WHERE id = $1', [id]);
    // a CHANGED payload that marks the same learner present again
    await db.query(
      `UPDATE public.student_attendance
          SET attendance_data = attendance_data || $2::jsonb WHERE id = $1`,
      [id, markPayload([[L.reserved, 'Present']], 'P2')],
    );
    // and again on later days
    for (const d of ['2026-08-12', '2026-08-13']) await mark([[L.reserved, 'Present']], d);

    expect(await historyCount(L.reserved)).toBe(1);
    expect(await statusOf(L.reserved)).toBe('active');
    expect(await failures()).toHaveLength(0);
  });
});

describe('the switch migration turns the rule on, and refuses to do so blindly', () => {
  it('leaves the policy row enabled after the migration runs', async () => {
    await db.query(`UPDATE public.platform_policies SET value='false'::jsonb WHERE policy_key=$1`, [POLICY_KEY]);
    await db.query(readFileSync(SWITCH_ON, 'utf8'));
    const r = await db.query(
      `SELECT (value #>> '{}')::boolean AS enabled FROM public.platform_policies WHERE policy_key=$1`,
      [POLICY_KEY],
    );
    expect(r.rows[0].enabled).toBe(true);
  });

  it('a FRESH environment rebuilt from supabase/setup/ ships the row enabled', async () => {
    // Not a text assertion about the file: the seed statement is lifted out of
    // 03_policies.sql and EXECUTED, because a seed that ships `false` would read
    // exactly the same to a grep of the surrounding prose.
    const text = readFileSync(SETUP_POLICIES, 'utf8');
    // The QUOTED key — the SQL literal inside the VALUES list. Searching for the
    // bare key finds the section comment above the statement first, and the
    // lastIndexOf below then walks back past this INSERT into an unrelated one.
    const keyAt = text.indexOf(`'${POLICY_KEY}'`);
    expect(keyAt).toBeGreaterThan(-1);
    const start = text.lastIndexOf('INSERT INTO platform_policies', keyAt);
    const end = text.indexOf('DO NOTHING;', keyAt);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const seed = text.slice(start, end + 'DO NOTHING;'.length);

    await db.query(`DELETE FROM public.platform_policies WHERE policy_key=$1`, [POLICY_KEY]);
    await db.query(seed);
    const r = await db.query(
      `SELECT (value #>> '{}')::boolean AS enabled FROM public.platform_policies WHERE policy_key=$1`,
      [POLICY_KEY],
    );
    expect(r.rows[0].enabled).toBe(true);
  });

  it('REFUSES to switch on over the unhardened trigger body', async () => {
    // A body with no exception handler is the one thing that must never be
    // switched on: it can reject a whole attendance save.
    await db.query(`
      CREATE OR REPLACE FUNCTION public.fn_activate_learner_on_first_present() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $stub$
      BEGIN RETURN NULL; END $stub$;
    `);
    await db.query(`UPDATE public.platform_policies SET value='false'::jsonb WHERE policy_key=$1`, [POLICY_KEY]);
    await expect(db.query(readFileSync(SWITCH_ON, 'utf8'))).rejects.toThrow(/UNHARDENED/i);
    const r = await db.query(
      `SELECT (value #>> '{}')::boolean AS enabled FROM public.platform_policies WHERE policy_key=$1`,
      [POLICY_KEY],
    );
    expect(r.rows[0].enabled).toBe(false); // still off
  });

  it('REFUSES to switch on when the trigger is not installed at all', async () => {
    await db.query('DROP TRIGGER IF EXISTS trg_activate_learner_on_first_present ON public.student_attendance');
    try {
      await expect(db.query(readFileSync(SWITCH_ON, 'utf8'))).rejects.toThrow(/not installed/i);
    } finally {
      await db.query(`CREATE TRIGGER trg_activate_learner_on_first_present
          AFTER INSERT OR UPDATE OF attendance_data ON public.student_attendance
          FOR EACH ROW EXECUTE FUNCTION public.fn_activate_learner_on_first_present()`);
    }
  });
});

describe('the failure table is locked the way every new table must be', () => {
  it('has RLS on and gives anon nothing', async () => {
    const rls = await db.query(
      `SELECT c.relrowsecurity AS enabled FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname='learner_activation_failures'`,
    );
    expect(rls.rows[0].enabled).toBe(true);
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const r = await db.query(
        `SELECT has_table_privilege('anon','public.learner_activation_failures',$1) AS granted`,
        [priv],
      );
      expect(r.rows[0].granted).toBe(false);
    }
  });

  it('the shared activation core is callable by nobody but its owner', async () => {
    for (const role of ['anon', 'authenticated']) {
      const r = await db.query(
        `SELECT has_function_privilege($1,
           'public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text)',
           'EXECUTE') AS granted`,
        [role],
      );
      expect(r.rows[0].granted).toBe(false);
    }
  });
});
