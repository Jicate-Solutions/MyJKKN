/**
 * Behavioural proof for supabase/migrations/20271007161139_hr_duty_playbooks_and_lessons.sql
 * (HR staff harness — playbooks, the lessons log and credited authorship).
 *
 * The file is applied VERBATIM with psql onto a throwaway database — its own
 * DO-block guards run too. Functions are called as `authenticated` (auth.uid()
 * answered from a test setting) or as `service_role` (the weekly cron).
 *
 * The permission helpers are stubs whose answer each test sets: 'true',
 * 'false' or 'null' — a NULL answer is how a missing role row reaches a guard
 * in production, and `IF NOT (a OR b)` lets it through.
 *
 * The prelude mirrors Supabase's default privileges (every new function is
 * executable by anon and authenticated unless the migration revokes it), so
 * the grant checks below prove the migration's own REVOKEs.
 *
 * HRPB_TEST_MIGRATION overrides the migration path (used for mutation runs).
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = process.env.HRPB_TEST_MIGRATION
  ?? path.join(REPO, 'supabase/migrations/20271007161139_hr_duty_playbooks_and_lessons.sql');
const PGHOST = process.env.HRPB_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HRPB_TEST_PGPORT ?? '5432';
const PGUSER = process.env.HRPB_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `hrpb_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const ANIL = '00000000-0000-4000-8000-0000000a0001'; // a team member, suggests
const ZARA = '00000000-0000-4000-8000-0000000a0002'; // a team member who holds the manage key
const NOBODY = '00000000-0000-4000-8000-0000000a0003'; // signed in, no team member row (a learner or parent)
const INST = '00000000-0000-4000-8000-0000000b0001';
const S_ANIL = '00000000-0000-4000-8000-0000000c0001';
const S_ZARA = '00000000-0000-4000-8000-0000000c0002';

const flag = (name: string) => `
  SELECT CASE current_setting('test.${name}', true)
           WHEN 'true' THEN true WHEN 'null' THEN NULL ELSE false END`;

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ ${flag('sa')} $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ ${flag('admin')} $$;
CREATE FUNCTION public.user_has_permission(text) RETURNS boolean LANGUAGE sql STABLE AS $$ ${flag('perm')} $$;
CREATE FUNCTION public.role_has_institution_access(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ ${flag('inst')} $$;
GRANT EXECUTE ON FUNCTION auth.uid(), public.is_super_admin(), public.is_admin(),
  public.user_has_permission(text), public.role_has_institution_access(uuid) TO anon, authenticated, service_role;

-- Supabase's default: every function created from here on is executable by anon and authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text);
CREATE TABLE public.staff (id uuid PRIMARY KEY, profile_id uuid, institution_id uuid);
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_key text NOT NULL, scope_type text NOT NULL,
  scope_id uuid, value jsonb, description text, data_type text, classification text, ui_category text,
  is_system boolean, is_active boolean NOT NULL DEFAULT true, publication_state text);
CREATE TABLE public.ai_routine_schedules (
  routine_id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true, managed boolean NOT NULL DEFAULT true,
  days_of_week smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', minute_of_day smallint NOT NULL DEFAULT 0);
-- The six reason sources, only the columns the harvest reads (repo migrations + setup, 2026-10-07),
-- including who decided: final_approver_id / revoked_by, approved_by / revoked_by, approver_id,
-- verified_by, reviewed_by, and the history entry's actor_id.
CREATE TABLE public.hr_leave_applications (
  id uuid PRIMARY KEY, employee_id uuid, status text, rejection_reason text, revoke_reason text,
  revoked_at timestamptz, revoked_by uuid, final_approver_id uuid, final_decided_at timestamptz,
  updated_at timestamptz DEFAULT now());
CREATE TABLE public.hr_comp_off_credits (
  id uuid PRIMARY KEY, employee_id uuid, status text, rejection_reason text, revoke_reason text,
  revoked_at timestamptz, revoked_by uuid, approved_by uuid, approved_at timestamptz,
  updated_at timestamptz DEFAULT now());
CREATE TABLE public.hr_attendance_regularizations (
  id uuid PRIMARY KEY, employee_id uuid, status text, rejection_reason text,
  approver_id uuid, approved_at timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE public.hr_employee_documents (
  id uuid PRIMARY KEY, institution_id uuid, verification_status text, verification_notes text,
  verified_by uuid, verified_at timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE public.hr_staff_photo_submissions (
  id uuid PRIMARY KEY, institution_id uuid, status text, review_note text,
  reviewed_by uuid, reviewed_at timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE public.hr_form_submissions (
  id uuid PRIMARY KEY, institution_id uuid, status text, approval_history jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now());

INSERT INTO public.profiles VALUES ('${ANIL}', 'Anil Kumar'), ('${ZARA}', 'Zara Begum'), ('${NOBODY}', 'Not A Member');
INSERT INTO public.staff VALUES ('${S_ANIL}', '${ANIL}', '${INST}'), ('${S_ZARA}', '${ZARA}', '${INST}');
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

type Who = { uid?: string | null; sa?: string; admin?: string; perm?: string; inst?: string };

/** Switch the current transaction to `authenticated` as `who`. */
async function asUser(who: Who) {
  await client.query('RESET ROLE');
  await client.query(
    `SELECT set_config('test.uid', $1, true), set_config('test.sa', $2, true), set_config('test.admin', $3, true),
            set_config('test.perm', $4, true), set_config('test.inst', $5, true)`,
    [who.uid ?? '', who.sa ?? 'false', who.admin ?? 'false', who.perm ?? 'false', who.inst ?? 'false'],
  );
  await client.query('SET LOCAL ROLE authenticated');
}
async function asService() {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('test.uid', '', true)`);
  await client.query('SET LOCAL ROLE service_role');
}
async function asOwner() {
  await client.query('RESET ROLE');
}

/** Run `fn` inside a transaction that is always rolled back. */
async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function err(sql: string, params: unknown[] = []): Promise<string | null> {
  await client.query('SAVEPOINT s');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT s');
    return null;
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT s');
    return (e as Error).message;
  }
}

/** Seed `n` harvested lessons for a duty/code, inside the last few days. */
async function seedLessons(duty: string, code: string, n: number, daysAgo = 2) {
  await asOwner();
  for (let i = 0; i < n; i++) {
    await client.query(
      `INSERT INTO public.hr_duty_lessons (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
       VALUES ($1, $2, 'hr_leave_applications', gen_random_uuid(), 'reject', $3, 'harvest',
               now() - make_interval(days => $4) - make_interval(mins => $5))`,
      [duty, INST, code, daysAgo, i],
    );
  }
}

async function propose(): Promise<number> {
  await asService();
  const r = await client.query('SELECT public.fn_hr_playbook_propose_from_lessons() AS n');
  return r.rows[0].n as number;
}

async function openPatternProposals(duty: string, code: string): Promise<number> {
  await asOwner();
  const r = await client.query(
    `SELECT count(*)::int AS n FROM public.hr_playbook_line_proposals
      WHERE duty_code = $1 AND reason_code = $2 AND source = 'lesson_pattern' AND status = 'proposed'`,
    [duty, code],
  );
  return r.rows[0].n as number;
}

async function suggest(uid: string, duty: string, text: string): Promise<string> {
  await asUser({ uid });
  const r = await client.query('SELECT public.fn_hr_playbook_suggest($1, $2) AS id', [duty, text]);
  return r.rows[0].id as string;
}

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
}, 60_000);

afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('fn_hr_playbook_decide — who may accept a line', () => {
  it('a team member who suggested a line cannot accept it, even holding the manage key', async () => {
    await tx(async () => {
      const id = await suggest(ZARA, 'L1', 'Open the attached certificate before deciding anything.');
      await asUser({ uid: ZARA, perm: 'true' });
      const e = await err(`SELECT public.fn_hr_playbook_decide($1, 'accept', NULL, NULL)`, [id]);
      expect(e).toMatch(/cannot decide your own suggestion/);
      await asOwner();
      const lines = await client.query('SELECT count(*)::int AS n FROM public.hr_playbook_lines');
      expect(lines.rows[0].n).toBe(0);
    });
  });

  it('refuses when both permission checks answer NULL', async () => {
    await tx(async () => {
      const id = await suggest(ANIL, 'L1', 'Open the attached certificate before deciding anything.');
      await asUser({ uid: ZARA, sa: 'null', perm: 'null' });
      const e = await err(`SELECT public.fn_hr_playbook_decide($1, 'accept', NULL, NULL)`, [id]);
      expect(e).toMatch(/Only the HR head can decide/);
    });
  });

  it('refuses a team member without the manage key', async () => {
    await tx(async () => {
      const id = await suggest(ANIL, 'L1', 'Open the attached certificate before deciding anything.');
      await asUser({ uid: ZARA });
      expect(await err(`SELECT public.fn_hr_playbook_decide($1, 'accept', NULL, NULL)`, [id]))
        .toMatch(/Only the HR head can decide/);
    });
  });

  it('accepting a suggestion credits the team member who suggested it, not the decider', async () => {
    await tx(async () => {
      const id = await suggest(ANIL, 'L1', 'Open the attached certificate before deciding anything.');
      await asUser({ uid: ZARA, perm: 'true' });
      await client.query(`SELECT public.fn_hr_playbook_decide($1, 'accept', NULL, NULL)`, [id]);
      await asOwner();
      const r = await client.query('SELECT authored_by, accepted_by, source, status FROM public.hr_playbook_lines');
      expect(r.rows).toEqual([{ authored_by: ANIL, accepted_by: ZARA, source: 'suggestion', status: 'active' }]);
    });
  });

  it('accepting a drafted line credits the decider and keeps how many reasons it came from', async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 4);
      expect(await propose()).toBe(1);
      await asOwner();
      const p = await client.query(`SELECT id FROM public.hr_playbook_line_proposals WHERE source = 'lesson_pattern'`);
      await asUser({ uid: ZARA, perm: 'true' });
      await client.query(`SELECT public.fn_hr_playbook_decide($1, 'accept', 'Check the notice period of the leave type first.', NULL)`,
        [p.rows[0].id]);
      await asOwner();
      const r = await client.query('SELECT authored_by, accepted_by, lesson_count, line_text FROM public.hr_playbook_lines');
      expect(r.rows).toEqual([{ authored_by: ZARA, accepted_by: ZARA, lesson_count: 4,
        line_text: 'Check the notice period of the leave type first.' }]);
    });
  });

  it('a decline needs a note', async () => {
    await tx(async () => {
      const id = await suggest(ANIL, 'L1', 'Open the attached certificate before deciding anything.');
      await asUser({ uid: ZARA, perm: 'true' });
      expect(await err(`SELECT public.fn_hr_playbook_decide($1, 'decline', NULL, '  ')`, [id])).toMatch(/note/);
      expect(await err(`SELECT public.fn_hr_playbook_decide($1, 'decline', NULL, 'Already covered by line 2')`, [id]))
        .toBeNull();
      expect(await err(`SELECT public.fn_hr_playbook_decide($1, 'accept', NULL, NULL)`, [id]))
        .toMatch(/already declined/);
    });
  });
});

describe('fn_hr_playbook_suggest', () => {
  it('needs a signed-in team member', async () => {
    await tx(async () => {
      await asUser({ uid: null });
      expect(await err(`SELECT public.fn_hr_playbook_suggest('L1', 'A perfectly fine line of text.')`)).toMatch(/sign in/);
      await asUser({ uid: NOBODY });
      expect(await err(`SELECT public.fn_hr_playbook_suggest('L1', 'A perfectly fine line of text.')`)).toMatch(/team member/);
    });
  });

  it('allows at most 5 waiting suggestions per team member', async () => {
    await tx(async () => {
      for (let i = 0; i < 5; i++) await suggest(ANIL, 'L1', `Suggestion number ${i} for this duty.`);
      await asUser({ uid: ANIL });
      expect(await err(`SELECT public.fn_hr_playbook_suggest('L1', 'The sixth suggestion is refused.')`))
        .toMatch(/5 suggestions waiting/);
    });
  });
});

describe('fn_hr_playbook_propose_from_lessons — reasons become proposed lines', () => {
  it('stays silent when the threshold policy is missing', async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 5);
      await asOwner();
      await client.query(`DELETE FROM public.platform_policies WHERE policy_key = 'hr.harness.playbooks.pattern_threshold'`);
      expect(await propose()).toBe(0);
      expect(await openPatternProposals('L1', 'late_application')).toBe(0);
    });
  });

  it("stays silent when the threshold policy holds 'abc'", async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 5);
      await asOwner();
      await client.query(`UPDATE public.platform_policies SET value = '"abc"'
                           WHERE policy_key = 'hr.harness.playbooks.pattern_threshold'`);
      expect(await propose()).toBe(0);
      expect(await openPatternProposals('L1', 'late_application')).toBe(0);
    });
  });

  it('stays silent when the window policy is a draft or zero', async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 5);
      await asOwner();
      await client.query(`UPDATE public.platform_policies SET value = '0'
                           WHERE policy_key = 'hr.harness.playbooks.pattern_window_days'`);
      expect(await propose()).toBe(0);
      await asOwner();
      await client.query(`UPDATE public.platform_policies SET value = '30', publication_state = 'draft'
                           WHERE policy_key = 'hr.harness.playbooks.pattern_window_days'`);
      expect(await propose()).toBe(0);
    });
  });

  it('3 matching reasons in 30 days give exactly one proposal, and a second run adds none', async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 3);
      expect(await propose()).toBe(1);
      expect(await propose()).toBe(0);
      expect(await openPatternProposals('L1', 'late_application')).toBe(1);
      await asOwner();
      const r = await client.query(`SELECT proposed_text, evidence FROM public.hr_playbook_line_proposals`);
      expect(r.rows[0].proposed_text).toMatch(/notice period/);
      expect(Object.keys(r.rows[0].evidence).sort()).toEqual(['count', 'first_at', 'last_at', 'window_days']);
      expect(r.rows[0].evidence).toMatchObject({ count: 3, window_days: 30 });
    });
  });

  it('2 reasons give none', async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 2);
      expect(await propose()).toBe(0);
    });
  });

  it('reasons older than the window are not counted', async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 5, 40);
      expect(await propose()).toBe(0);
    });
  });

  it("'other' never proposes, even when someone gave it a line", async () => {
    await tx(async () => {
      await asOwner();
      await client.query(`UPDATE public.hr_duty_reason_codes SET suggested_line = 'A line nobody should ever see proposed.'
                           WHERE config_key = 'L1.other'`);
      await seedLessons('L1', 'other', 6);
      expect(await propose()).toBe(0);
      expect(await openPatternProposals('L1', 'other')).toBe(0);
    });
  });

  it('a line accepted in the last 90 days is not proposed again; after 90 days it can be', async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 3);
      expect(await propose()).toBe(1);
      await asOwner();
      const p = await client.query(`SELECT id FROM public.hr_playbook_line_proposals`);
      await asUser({ uid: ZARA, perm: 'true' });
      await client.query(`SELECT public.fn_hr_playbook_decide($1, 'accept', NULL, NULL)`, [p.rows[0].id]);
      await seedLessons('L1', 'late_application', 3, 1);
      expect(await propose()).toBe(0);
      await asOwner();
      await client.query(`UPDATE public.hr_playbook_lines SET accepted_at = now() - interval '100 days'`);
      expect(await propose()).toBe(1);
    });
  });

  it('a line declined in the last 90 days is not proposed again', async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 3);
      expect(await propose()).toBe(1);
      await asOwner();
      const p = await client.query(`SELECT id FROM public.hr_playbook_line_proposals`);
      await asUser({ uid: ZARA, perm: 'true' });
      await client.query(`SELECT public.fn_hr_playbook_decide($1, 'decline', NULL, 'Not how we work')`, [p.rows[0].id]);
      expect(await propose()).toBe(0);
    });
  });
});

describe('fn_hr_duty_lessons_harvest — gathering reasons', () => {
  async function seedSources() {
    await asOwner();
    await client.query(`
      INSERT INTO public.hr_leave_applications (id, employee_id, status, rejection_reason, final_approver_id, final_decided_at) VALUES
        (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Medical certificate not attached', '${ZARA}', now() - interval '1 day'),
        (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Applied late, after the deadline', '${ZARA}', now() - interval '2 days'),
        (gen_random_uuid(), '${S_ANIL}', 'approved', NULL, '${ZARA}', now() - interval '2 days'),
        (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Not this week', '${ZARA}', NULL);
      INSERT INTO public.hr_leave_applications (id, employee_id, status, rejection_reason, revoke_reason, revoked_at, revoked_by, final_approver_id, final_decided_at) VALUES
        (gen_random_uuid(), '${S_ZARA}', 'rejected', 'Exam duty clash', 'Exam duty clash', now() - interval '3 hours', '${ANIL}', '${ANIL}', now() - interval '3 hours');
      INSERT INTO public.hr_comp_off_credits (id, employee_id, status, rejection_reason, approved_by, approved_at) VALUES
        (gen_random_uuid(), '${S_ANIL}', 'rejected', 'No biometric punch on that day', '${ZARA}', now() - interval '1 day');
      INSERT INTO public.hr_attendance_regularizations (id, employee_id, status, rejection_reason, approver_id, approved_at) VALUES
        (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Wrong time asked for', '${ZARA}', now() - interval '1 day');
      INSERT INTO public.hr_employee_documents (id, institution_id, verification_status, verification_notes, verified_by, verified_at) VALUES
        (gen_random_uuid(), '${INST}', 'rejected', 'Scan is blurred', '${ZARA}', now() - interval '1 day');
      INSERT INTO public.hr_staff_photo_submissions (id, institution_id, status, review_note, reviewed_by, reviewed_at) VALUES
        (gen_random_uuid(), '${INST}', 'rejected', 'Background is not plain', '${ZARA}', now() - interval '1 day');
      INSERT INTO public.hr_form_submissions (id, institution_id, status, approval_history) VALUES
        (gen_random_uuid(), '${INST}', 'rejected', jsonb_build_array(
          jsonb_build_object('step', 1, 'action', 'submit', 'actor_id', '${ANIL}', 'reason', 'x', 'at', now() - interval '2 days'),
          jsonb_build_object('step', 1, 'action', 'reject', 'actor_id', '${ZARA}', 'reason', 'Proof not attached', 'at', now() - interval '1 day'),
          jsonb_build_object('step', 1, 'action', 'reject', 'actor_id', '${ZARA}', 'reason', 'bad time', 'at', 'yesterday-ish')));
    `);
  }

  async function harvest() {
    await asService();
    const r = await client.query(`SELECT public.fn_hr_duty_lessons_harvest(now() - interval '35 days') AS out`);
    return r.rows[0].out as Record<string, unknown>;
  }

  it('reads all six sources and sorts each reason into a code', async () => {
    await tx(async () => {
      await seedSources();
      const out = await harvest();
      expect(out).toEqual({ L1: 3, L2: 1, A3: 1, S2: 1, S3: 1, G2: 1 });
      await asOwner();
      const r = await client.query(
        `SELECT duty_code, kind, reason_code, institution_id FROM public.hr_duty_lessons ORDER BY duty_code, reason_code`);
      expect(r.rows.map((x) => `${x.duty_code}:${x.kind}:${x.reason_code}`)).toEqual([
        'A3:reject:wrong_details',
        'G2:reject:missing_attachment',
        'L1:reject:document_missing',
        'L1:reject:late_application',
        'L1:reversal:no_cover',
        'L2:reject:no_proof',
        'S2:reject:unreadable',
        'S3:reject:background',
      ]);
      expect(r.rows.every((x) => x.institution_id === INST)).toBe(true);
    });
  });

  it('a rejection the system wrote is not a lesson, and three of them draft no line', async () => {
    await tx(async () => {
      await asOwner();
      // The automatic leave rejection (20261005100000) stamps the CAO as the decider, so only the text tells it apart.
      await client.query(`
        INSERT INTO public.hr_leave_applications (id, employee_id, status, rejection_reason, final_approver_id, final_decided_at)
        SELECT gen_random_uuid(), '${S_ANIL}', 'rejected',
               'No leave balance available. Casual Leave: 0 day(s) available as of 05/10/2026; this request needs 1.',
               '${ZARA}', now() - make_interval(hours => g) FROM generate_series(1, 3) g;
        INSERT INTO public.hr_leave_applications (id, employee_id, status, rejection_reason, final_approver_id, final_decided_at) VALUES
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'No Casual Leave balance available for October 2026 (0 day(s) available as of 01 Oct 2026; this request needs 1).', '${ZARA}', now() - interval '1 day'),
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (Pharmacy Teaching/Non-Teaching sheets). Corrected to 0 days for this month; superseded by the payroll-verified figure.', '${ZARA}', now() - interval '1 day'),
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Leave balance exhausted for this month', '${ZARA}', now() - interval '1 day'),
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'No casual leave balance available for those days', '${ZARA}', now() - interval '1 day');
        INSERT INTO public.hr_comp_off_credits (id, employee_id, status, rejection_reason, approved_by, approved_at) VALUES
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Automatically rejected: not approved before the credit''s one-month expiry on 01/10/2026.', '${ZARA}', now() - interval '1 day'),
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Month closed over outstanding claims: payroll run', '${ZARA}', now() - interval '1 day');
        INSERT INTO public.hr_staff_photo_submissions (id, institution_id, status, review_note, reviewed_by, reviewed_at) VALUES
          (gen_random_uuid(), '${INST}', 'rejected', 'Superseded by a newer photograph from the same person', '${ZARA}', now() - interval '1 day'),
          (gen_random_uuid(), '${INST}', 'rejected', '  Refused automatically (BUG-006144): the stored photograph is not under this person''s own folder.', '${ZARA}', now() - interval '1 day');
      `);
      const out = await harvest();
      // Only the two reasons a person wrote are lessons.
      expect(out).toMatchObject({ L1: 2, L2: 0, S3: 0 });
      await asOwner();
      const r = await client.query(`SELECT reason_code FROM public.hr_duty_lessons`);
      expect(r.rows).toEqual([{ reason_code: 'no_balance' }, { reason_code: 'no_balance' }]);
      expect(await propose()).toBe(0);
      expect(await openPatternProposals('L1', 'no_balance')).toBe(0);
    });
  });

  it('a rejection with no decider recorded is not a lesson', async () => {
    await tx(async () => {
      await asOwner();
      await client.query(`
        INSERT INTO public.hr_leave_applications (id, employee_id, status, rejection_reason, final_approver_id, final_decided_at) VALUES
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Medical certificate not attached', NULL, now() - interval '1 day');
        INSERT INTO public.hr_leave_applications (id, employee_id, status, rejection_reason, revoke_reason, revoked_at, revoked_by, final_approver_id, final_decided_at) VALUES
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Exam duty clash', 'Exam duty clash', now() - interval '3 hours', NULL, '${ZARA}', now() - interval '3 hours');
        INSERT INTO public.hr_comp_off_credits (id, employee_id, status, rejection_reason, approved_by, approved_at) VALUES
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'No biometric punch on that day', NULL, now() - interval '1 day');
        INSERT INTO public.hr_comp_off_credits (id, employee_id, status, rejection_reason, revoke_reason, revoked_at, revoked_by, approved_by, approved_at) VALUES
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'No biometric punch', 'No biometric punch', now() - interval '2 hours', NULL, '${ZARA}', now() - interval '3 days');
        INSERT INTO public.hr_attendance_regularizations (id, employee_id, status, rejection_reason, approver_id, approved_at) VALUES
          (gen_random_uuid(), '${S_ANIL}', 'rejected', 'Wrong time asked for', NULL, now() - interval '1 day');
        INSERT INTO public.hr_employee_documents (id, institution_id, verification_status, verification_notes, verified_by, verified_at) VALUES
          (gen_random_uuid(), '${INST}', 'rejected', 'Scan is blurred', NULL, now() - interval '1 day');
        INSERT INTO public.hr_staff_photo_submissions (id, institution_id, status, review_note, reviewed_by, reviewed_at) VALUES
          (gen_random_uuid(), '${INST}', 'rejected', 'Background is not plain', NULL, now() - interval '1 day');
        INSERT INTO public.hr_form_submissions (id, institution_id, status, approval_history) VALUES
          (gen_random_uuid(), '${INST}', 'rejected', jsonb_build_array(
            jsonb_build_object('step', 1, 'action', 'reject', 'reason', 'Proof not attached', 'at', now() - interval '1 day'),
            jsonb_build_object('step', 2, 'action', 'reject', 'actor_id', null, 'reason', 'Proof not attached', 'at', now() - interval '2 days')));
      `);
      expect(await harvest()).toEqual({ L1: 0, L2: 0, A3: 0, S2: 0, S3: 0, G2: 0 });
    });
  });

  it('is idempotent: a second run adds nothing', async () => {
    await tx(async () => {
      await seedSources();
      await harvest();
      const again = await harvest();
      expect(again).toEqual({ L1: 0, L2: 0, A3: 0, S2: 0, S3: 0, G2: 0 });
      await asOwner();
      const r = await client.query('SELECT count(*)::int AS n FROM public.hr_duty_lessons');
      expect(r.rows[0].n).toBe(8);
    });
  });

  it('a later edit to a rejected record does not log it twice', async () => {
    await tx(async () => {
      await seedSources();
      await harvest();
      await asOwner();
      await client.query(`UPDATE public.hr_leave_applications SET updated_at = now() + interval '1 minute'`);
      expect((await harvest()).L1).toBe(0);
    });
  });

  it('a source that is missing reports an error and the others still run', async () => {
    await tx(async () => {
      await seedSources();
      await asOwner();
      await client.query('DROP TABLE public.hr_staff_photo_submissions');
      const out = await harvest();
      expect(out.S3).toMatchObject({ error: expect.stringMatching(/does not exist/) });
      expect(out.L1).toBe(3);
    });
  });
});

describe('grants — the cron functions are service-role only', () => {
  it.each([
    [`SELECT public.fn_hr_duty_lessons_harvest(now())`],
    [`SELECT public.fn_hr_playbook_propose_from_lessons()`],
  ])('a signed-in team member cannot call %s', async (sql) => {
    await tx(async () => {
      await asUser({ uid: ZARA, sa: 'true', perm: 'true' });
      expect(await err(sql)).toMatch(/permission denied/);
    });
  });

  it('no function in the migration is executable by anon', async () => {
    const r = await client.query(`
      SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND (p.proname LIKE 'fn_hr_playbook%' OR p.proname LIKE 'fn_hr_duty_%')
       ORDER BY 1`);
    expect(r.rows.length).toBeGreaterThanOrEqual(11);
    expect(r.rows.filter((x) => x.anon_exec).map((x) => x.proname)).toEqual([]);
  });
});

describe('reading playbooks', () => {
  async function acceptLines(author: string, decider: string, texts: string[]) {
    for (const t of texts) {
      const id = await suggest(author, 'L1', t);
      await asUser({ uid: decider, perm: 'true' });
      await client.query(`SELECT public.fn_hr_playbook_decide($1, 'accept', NULL, NULL)`, [id]);
    }
  }

  it('the contributors list is ordered by name, not by how many lines', async () => {
    await tx(async () => {
      await acceptLines(ZARA, ANIL, ['Zara line one for this duty.', 'Zara line two for this duty.', 'Zara line three for this duty.']);
      await acceptLines(ANIL, ZARA, ['Anil line one for this duty.']);
      await asUser({ uid: ANIL });
      const r = await client.query('SELECT author_name, line_count FROM public.fn_hr_playbook_contributors()');
      expect(r.rows).toEqual([
        { author_name: 'Anil Kumar', line_count: 1 },
        { author_name: 'Zara Begum', line_count: 3 },
      ]);
    });
  });

  it('a team member reads a duty playbook with author names from profiles', async () => {
    await tx(async () => {
      await acceptLines(ANIL, ZARA, ['Anil line one for this duty.']);
      await asOwner();
      await client.query(`UPDATE public.profiles SET full_name = 'Anil K. (renamed)' WHERE id = '${ANIL}'`);
      await asUser({ uid: ZARA });
      const r = await client.query(`SELECT line_text, author_name, accepted_by_name, source FROM public.fn_hr_playbook_for_duty('L1')`);
      expect(r.rows).toEqual([{ line_text: 'Anil line one for this duty.', author_name: 'Anil K. (renamed)',
        accepted_by_name: 'Zara Begum', source: 'suggestion' }]);
      await asUser({ uid: null });
      expect(await err(`SELECT * FROM public.fn_hr_playbook_for_duty('L1')`)).toMatch(/team members only/);
    });
  });

  it.each([
    ['fn_hr_playbook_for_duty', `SELECT * FROM public.fn_hr_playbook_for_duty('L1')`],
    ['fn_hr_playbook_contributors', `SELECT * FROM public.fn_hr_playbook_contributors()`],
    ['fn_hr_playbook_open_proposals', `SELECT * FROM public.fn_hr_playbook_open_proposals()`],
  ])('a signed-in learner or parent (no team member row) is refused by %s', async (_name, sql) => {
    await tx(async () => {
      await acceptLines(ANIL, ZARA, ['Anil line one for this duty.']);
      await asUser({ uid: NOBODY });
      expect(await err(sql)).toMatch(/team members only/);
      // NULL from every permission check is still a no.
      await asUser({ uid: NOBODY, sa: 'null', admin: 'null', perm: 'null' });
      expect(await err(sql)).toMatch(/team members only/);
      // A team member is let in.
      await asUser({ uid: ANIL });
      expect(await err(sql)).toBeNull();
    });
  });

  it('a learner or parent reading the lines table directly gets no rows; a team member does', async () => {
    await tx(async () => {
      await acceptLines(ANIL, ZARA, ['Anil line one for this duty.']);
      await asUser({ uid: NOBODY });
      expect((await client.query('SELECT authored_by FROM public.hr_playbook_lines')).rows).toEqual([]);
      await asUser({ uid: ANIL });
      expect((await client.query('SELECT authored_by FROM public.hr_playbook_lines')).rows).toEqual([{ authored_by: ANIL }]);
    });
  });

  it('a super admin or a holder of the manage key reads playbooks without a team member row', async () => {
    await tx(async () => {
      await acceptLines(ANIL, ZARA, ['Anil line one for this duty.']);
      await asUser({ uid: NOBODY, sa: 'true' });
      expect((await client.query(`SELECT * FROM public.fn_hr_playbook_for_duty('L1')`)).rows).toHaveLength(1);
      await asUser({ uid: NOBODY, perm: 'true' });
      expect((await client.query(`SELECT * FROM public.fn_hr_playbook_for_duty('L1')`)).rows).toHaveLength(1);
    });
  });

  it('a team member without the key sees only their OWN waiting suggestions through fn_hr_playbook_open_proposals', async () => {
    await tx(async () => {
      await suggest(ANIL, 'L1', 'Anil suggestion for this duty.');
      await suggest(ZARA, 'L1', 'Zara suggestion for this duty.');
      await seedLessons('L1', 'late_application', 3);
      expect(await propose()).toBe(1);
      await asUser({ uid: ANIL });
      const mine = await client.query('SELECT suggested_by, source FROM public.fn_hr_playbook_open_proposals()');
      expect(mine.rows).toEqual([{ suggested_by: ANIL, source: 'suggestion' }]);
      await asUser({ uid: ZARA, perm: 'true' });
      expect((await client.query('SELECT * FROM public.fn_hr_playbook_open_proposals()')).rows).toHaveLength(3);
    });
  });

  it('edited before accepting: the line names the suggester AND the editor', async () => {
    await tx(async () => {
      const id = await suggest(ANIL, 'L1', 'Open the attached certificate before deciding anything.');
      await asUser({ uid: ZARA, perm: 'true' });
      await client.query(`SELECT public.fn_hr_playbook_decide($1, 'accept', 'Open every attached certificate before you decide.', NULL)`, [id]);
      await asUser({ uid: ANIL });
      const r = await client.query(
        `SELECT line_text, authored_by, author_name, edited_by, edited_by_name FROM public.fn_hr_playbook_for_duty('L1')`);
      expect(r.rows).toEqual([{ line_text: 'Open every attached certificate before you decide.',
        authored_by: ANIL, author_name: 'Anil Kumar', edited_by: ZARA, edited_by_name: 'Zara Begum' }]);
    });
  });

  it('accepted word for word (or with the same text sent back): no editor is named', async () => {
    await tx(async () => {
      const a = await suggest(ANIL, 'L1', 'Open the attached certificate before deciding anything.');
      const b = await suggest(ANIL, 'L1', 'Check the leave balance before deciding anything.');
      await asUser({ uid: ZARA, perm: 'true' });
      await client.query(`SELECT public.fn_hr_playbook_decide($1, 'accept', NULL, NULL)`, [a]);
      await client.query(`SELECT public.fn_hr_playbook_decide($1, 'accept', '  Check the leave balance before deciding anything. ', NULL)`, [b]);
      await asOwner();
      const r = await client.query('SELECT authored_by, edited_by FROM public.hr_playbook_lines');
      expect(r.rows).toEqual([{ authored_by: ANIL, edited_by: null }, { authored_by: ANIL, edited_by: null }]);
    });
  });

  it('a retired line leaves the playbook; retiring needs the key and a note', async () => {
    await tx(async () => {
      await acceptLines(ANIL, ZARA, ['Anil line one for this duty.']);
      await asOwner();
      const l = await client.query('SELECT id FROM public.hr_playbook_lines');
      await asUser({ uid: ANIL });
      expect(await err(`SELECT public.fn_hr_playbook_retire_line($1, 'old')`, [l.rows[0].id])).toMatch(/Only the HR head/);
      await asUser({ uid: ZARA, perm: 'true' });
      expect(await err(`SELECT public.fn_hr_playbook_retire_line($1, '')`, [l.rows[0].id])).toMatch(/note/);
      expect(await err(`SELECT public.fn_hr_playbook_retire_line($1, 'No longer applies')`, [l.rows[0].id])).toBeNull();
      expect((await client.query(`SELECT * FROM public.fn_hr_playbook_for_duty('L1')`)).rows).toEqual([]);
    });
  });

  it('team members cannot write playbook tables directly', async () => {
    await tx(async () => {
      await asUser({ uid: ZARA, sa: 'true', perm: 'true' });
      expect(await err(`INSERT INTO public.hr_playbook_lines (duty_code, line_text, authored_by, source, accepted_by)
                        VALUES ('L1', 'Sneaked in without a decision.', '${ZARA}', 'hr_head', '${ZARA}')`))
        .toMatch(/permission denied/);
    });
  });

  it('a team member sees only their own suggestions; the lessons log needs the key', async () => {
    await tx(async () => {
      await suggest(ANIL, 'L1', 'Anil suggestion for this duty.');
      await suggest(ZARA, 'L1', 'Zara suggestion for this duty.');
      await seedLessons('L1', 'late_application', 1);
      await asUser({ uid: ANIL });
      const mine = await client.query('SELECT suggested_by FROM public.hr_playbook_line_proposals');
      expect(mine.rows).toEqual([{ suggested_by: ANIL }]);
      expect((await client.query('SELECT * FROM public.hr_duty_lessons')).rows).toEqual([]);
      await asUser({ uid: ZARA, perm: 'true', inst: 'true' });
      expect((await client.query('SELECT * FROM public.hr_playbook_line_proposals')).rows).toHaveLength(2);
      expect((await client.query('SELECT * FROM public.hr_duty_lessons')).rows).toHaveLength(1);
    });
  });

  it('the lessons log is scoped to the colleges the key holder can see', async () => {
    await tx(async () => {
      await seedLessons('L1', 'late_application', 2);
      await asUser({ uid: ZARA, perm: 'true', inst: 'false' });
      expect((await client.query('SELECT * FROM public.hr_duty_lessons')).rows).toEqual([]);
      await asUser({ uid: ZARA, perm: 'false', inst: 'true' });
      expect((await client.query('SELECT * FROM public.hr_duty_lessons')).rows).toEqual([]);
    });
  });
});

describe('fn_hr_duty_reason_match — keywords match at the start of a word', () => {
  it("'late' sorts 'came in late' but not 'an unrelated matter'", async () => {
    await tx(async () => {
      await asService();
      const r = await client.query(
        `SELECT public.fn_hr_duty_reason_match('L1', 'Came in late') AS a,
                public.fn_hr_duty_reason_match('L1', 'An unrelated matter') AS b`);
      expect(r.rows[0]).toEqual({ a: 'late_application', b: 'other' });
    });
  });
});
