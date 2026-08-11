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
 * REQUIRES a local PostgreSQL. It is NOT run by CI — no workflow in
 * .github/workflows names this path, and this repo has no test glob: every
 * guard suite is invoked by explicit filename. It is deliberately loud rather
 * than skipped when no server is reachable; a silent skip would report green
 * over a suite that never executed.
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

const PGHOST = process.env.ACTIVATE_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.ACTIVATE_TEST_PGPORT ?? 5432);
const PGUSER = process.env.ACTIVATE_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const PGPASSWORD = process.env.ACTIVATE_TEST_PGPASSWORD;

const DBNAME = `activate_first_present_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

// ── Fixture identifiers. Fixed so a failure names a learner, not a random uuid ──
const INST = '00000000-0000-4000-8000-0000000000a1';
const SECTION = '00000000-0000-4000-8000-0000000000c1';
const TIMETABLE = '00000000-0000-4000-8000-0000000000e1';
const MARKER = '00000000-0000-4000-8000-0000000000d1';

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

CREATE TABLE public.learners_profile_status_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id          uuid NOT NULL,
  from_status         public.lifecycle_status,
  to_status           public.lifecycle_status NOT NULL,
  reason_code         text,
  paid_pct_at_change  numeric,
  threshold_at_change numeric,
  changed_by          uuid,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  metadata            jsonb DEFAULT '{}'::jsonb);

CREATE TABLE public.student_attendance (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_date  date  NOT NULL,
  institution_id   uuid  NOT NULL,
  timetable_id     uuid  NOT NULL,
  section_id       uuid  NOT NULL,
  attendance_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
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
`;

/** Reset every learner and clear all history + attendance between tests. */
const RESET = `
TRUNCATE public.student_attendance;
TRUNCATE public.learners_profile_status_history;
DELETE FROM public.learners_profiles;
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
  await admin.query(`CREATE DATABASE ${DBNAME}`);

  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  await db.query(SCHEMA);

  // THE MIGRATION IS APPLIED VERBATIM. Nothing is edited, reordered or inlined —
  // what runs here is the artifact the PR ships.
  await db.query(readFileSync(MIGRATION, 'utf8'));
}, 60_000);

afterAll(async () => {
  if (db) await db.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
    await admin.end();
  }
});

beforeEach(async () => {
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
