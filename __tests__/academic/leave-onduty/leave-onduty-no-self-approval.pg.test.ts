/**
 * Learner leave / on-duty: nobody decides an application by writing to it
 * directly — behavioural proof for
 * supabase/migrations/20270327090000_leave_onduty_no_self_approval.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration file is applied VERBATIM with psql onto a throwaway database
 * that carries production's own leave_onduty_applications: all 24 columns, its
 * updated_at trigger, its nine RLS policies (pg_policies, 2026-09-24) and its
 * table grants (anon and authenticated both hold arwdDxt). Every write below is
 * made as the `authenticated` (or `anon`) role with auth.uid() set, exactly as
 * PostgREST does for a signed-in browser, and the suite reads back what
 * PostgreSQL actually stored.
 *
 * NON-VACUITY: with the migration file emptied, every "refused" test below
 * fails (the write lands), while every "still allowed" test keeps passing.
 *
 * REQUIRES a local PostgreSQL 16 and refuses to skip silently without one
 * (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml):
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/academic/leave-onduty/leave-onduty-no-self-approval.pg.test.ts
 *
 * Override the server with LEAVEOD_TEST_PGHOST / _PGPORT / _PGUSER. On CI the
 * user defaults to `postgres` (the service container's trust-auth superuser).
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20270327090000_leave_onduty_no_self_approval.sql'
);

const PGHOST = process.env.LEAVEOD_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.LEAVEOD_TEST_PGPORT ?? '5432';
const PGUSER =
  process.env.LEAVEOD_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `leave_od_guard_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

/**
 * Production's leave_onduty_applications as it stands on 2026-09-24, with the
 * policies verbatim in substance. Supabase's default table grants to anon and
 * authenticated are reproduced so the anon REVOKE is actually tested.
 */
const PRELUDE = `
DO $$ BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.acting_uid', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TYPE public.application_status AS ENUM ('draft','pending','approved','rejected','cancelled','submitted','under_review','documents_pending','interview_scheduled','interviewed','waitlisted','withdrawn');
CREATE TYPE public.leave_onduty_category AS ENUM ('leave','onduty');
CREATE TYPE public.period_type AS ENUM ('fullday','forenoon','afternoon','periodwise');
CREATE TYPE public.leave_onduty_applicable AS ENUM ('individual','team');

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, learner_id uuid);
CREATE TABLE public.learners_profiles (id uuid PRIMARY KEY, profile_id uuid);

CREATE TABLE public.leave_onduty_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES public.learners_profiles(id),
  institution_id uuid NOT NULL,
  department_id uuid,
  semester_id uuid,
  section_id uuid,
  category public.leave_onduty_category NOT NULL,
  sub_category text NOT NULL,
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  period_type public.period_type NOT NULL,
  selected_periods jsonb DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  attachment_url text,
  status public.application_status NOT NULL DEFAULT 'pending',
  current_step integer DEFAULT 1 CHECK (current_step >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sponsor_id uuid,
  sponsor_approval_status text,
  sponsor_comments text,
  sponsor_action_at timestamptz,
  applicable_type public.leave_onduty_applicable NOT NULL DEFAULT 'individual',
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE FUNCTION public.update_leave_onduty_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_applications_updated_at BEFORE UPDATE ON public.leave_onduty_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_leave_onduty_timestamp();

ALTER TABLE public.leave_onduty_applications ENABLE ROW LEVEL SECURITY;

-- Production, verbatim in substance (pg_policies, 2026-09-24).
CREATE POLICY admins_update_applications ON public.leave_onduty_applications FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
                 AND profiles.role = ANY (ARRAY['super_admin','admin','institution_admin'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
                 AND profiles.role = ANY (ARRAY['super_admin','admin','institution_admin'])));
CREATE POLICY admins_view_all ON public.leave_onduty_applications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
                 AND profiles.role = ANY (ARRAY['super_admin','admin','institution_admin'])));
CREATE POLICY learners_create_applications ON public.leave_onduty_applications FOR INSERT
  WITH CHECK (learner_id IN (SELECT learners_profiles.id FROM public.learners_profiles
                             WHERE learners_profiles.id = (SELECT profiles.learner_id FROM public.profiles
                                                           WHERE profiles.id = (SELECT auth.uid()))));
CREATE POLICY learners_delete_own_cancelled ON public.leave_onduty_applications FOR DELETE
  USING (status = 'cancelled'::public.application_status
         AND learner_id IN (SELECT learners_profiles.id FROM public.learners_profiles
                            WHERE learners_profiles.id = (SELECT profiles.learner_id FROM public.profiles
                                                          WHERE profiles.id = (SELECT auth.uid()))));
CREATE POLICY learners_update_own_pending ON public.leave_onduty_applications FOR UPDATE
  USING (learner_id IN (SELECT learners_profiles.id FROM public.learners_profiles
                        WHERE learners_profiles.id = (SELECT profiles.learner_id FROM public.profiles
                                                      WHERE profiles.id = (SELECT auth.uid())))
         AND status = 'pending'::public.application_status)
  WITH CHECK (learner_id IN (SELECT learners_profiles.id FROM public.learners_profiles
                        WHERE learners_profiles.id = (SELECT profiles.learner_id FROM public.profiles
                                                      WHERE profiles.id = (SELECT auth.uid()))));
CREATE POLICY learners_view_own_applications ON public.leave_onduty_applications FOR SELECT
  USING (learner_id IN (SELECT learners_profiles.id FROM public.learners_profiles
                        WHERE learners_profiles.id = (SELECT profiles.learner_id FROM public.profiles
                                                      WHERE profiles.id = (SELECT auth.uid()))));
CREATE POLICY sponsors_update_own_pending ON public.leave_onduty_applications FOR UPDATE TO authenticated
  USING (sponsor_id = (SELECT auth.uid()) AND sponsor_approval_status = 'pending')
  WITH CHECK (sponsor_id = (SELECT auth.uid()));
CREATE POLICY sponsors_view_assigned ON public.leave_onduty_applications FOR SELECT TO authenticated
  USING (sponsor_id = (SELECT auth.uid()));

-- Supabase's default: every new public table is granted in full to anon and authenticated.
GRANT ALL ON public.leave_onduty_applications TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.learners_profiles TO anon, authenticated;

-- Stand-in for a server-side writer such as #4026's fn_leave_onduty_decide_step:
-- SECURITY DEFINER, so it runs as its owner and bypasses RLS, and its own body
-- is what authorises the caller.
CREATE FUNCTION public.test_server_side_approve(p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  UPDATE leave_onduty_applications SET status = 'approved', current_step = 2
  WHERE id = p_id RETURNING status::text INTO v;
  RETURN v;
END;
$$;
GRANT EXECUTE ON FUNCTION public.test_server_side_approve(uuid) TO authenticated;
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

let client: Client;
let tmp: string;

const INST = randomUUID();
const OTHER_INST = randomUUID();
const LEARNER = randomUUID();
const people = {
  learner: randomUUID(),
  sponsor: randomUUID(),
  hod: randomUUID(),
  superAdmin: randomUUID(),
};

type Result = { rows: Record<string, any>[]; rowCount: number | null; code: string | null; message: string };

async function q<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await client.query(sql, params);
  return r.rows as T[];
}

/**
 * Run `sql` as a signed-in person (role `authenticated`, auth.uid() = uid) or
 * as `anon`. Returns rows and rowCount, or the error's SQLSTATE and message.
 */
async function asUser(uid: string | null, sql: string, params: unknown[] = [], role = 'authenticated'): Promise<Result> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('test.acting_uid', $1, true)`, [uid ?? '']);
    await client.query(`SET LOCAL ROLE ${role}`);
    const r = await client.query(sql, params);
    await client.query('COMMIT');
    return { rows: r.rows, rowCount: r.rowCount, code: null, message: '' };
  } catch (e) {
    await client.query('ROLLBACK');
    const err = e as { code?: string; message?: string };
    return { rows: [], rowCount: 0, code: err.code ?? 'unknown', message: err.message ?? '' };
  }
}

/** A pending application of LEARNER; sponsor-gated when `sponsored`. */
async function makeApp(opts: { sponsored?: boolean } = {}) {
  const [{ id }] = await q<{ id: string }>(
    `INSERT INTO public.leave_onduty_applications
       (learner_id, institution_id, category, sub_category, start_date, end_date, period_type, reason,
        current_step, sponsor_id, sponsor_approval_status)
     VALUES ($1, $2, 'onduty', 'event_participation', '2026-10-01', '2026-10-01', 'fullday', 'Inter-college event',
             $3, $4, $5)
     RETURNING id`,
    [
      LEARNER,
      INST,
      opts.sponsored ? 0 : 1,
      opts.sponsored ? people.sponsor : null,
      opts.sponsored ? 'pending' : null,
    ]
  );
  return id;
}

async function stored(id: string) {
  return (
    await q<Record<string, any>>(
      `SELECT status::text, current_step, sponsor_id, sponsor_approval_status, sponsor_comments,
              institution_id, reason, end_date::text AS end_date
         FROM public.leave_onduty_applications WHERE id = $1`,
      [id]
    )
  )[0];
}

/** The learner's own INSERT, as LeaveOndutyService.createApplication sends it, with overrides. */
function learnerInsert(overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    learner_id: LEARNER,
    institution_id: INST,
    category: 'onduty',
    sub_category: 'event_participation',
    start_date: '2026-10-02',
    end_date: '2026-10-02',
    period_type: 'fullday',
    reason: 'Hackathon',
    status: 'pending',
    current_step: 1,
    sponsor_id: null,
    sponsor_approval_status: null,
    ...overrides,
  };
  const cols = Object.keys(row);
  return asUser(
    people.learner,
    `INSERT INTO public.leave_onduty_applications (${cols.join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING status::text, current_step, sponsor_approval_status`,
    cols.map((c) => row[c])
  );
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration file and proves behaviour against a\n` +
        `throwaway database; it will not pretend to pass without one.\n` +
        `  brew services start postgresql@16\n\n` +
        String(err?.stderr || err?.message || e)
    );
  }

  tmp = mkdtempSync(path.join(tmpdir(), 'leaveod-guard-'));
  const preludePath = path.join(tmp, 'prelude.sql');
  writeFileSync(preludePath, PRELUDE);
  psql(['-d', DBNAME, '-f', preludePath]);
  psql(['-d', DBNAME, '-f', MIGRATION]);

  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();

  await q(`INSERT INTO public.learners_profiles (id, profile_id) VALUES ($1, $2)`, [LEARNER, people.learner]);
  await q(
    `INSERT INTO public.profiles (id, role, learner_id) VALUES
       ($1, 'learner', $2), ($3, 'hod', NULL), ($4, 'hod', NULL), ($5, 'super_admin', NULL)`,
    [people.learner, LEARNER, people.sponsor, people.hod, people.superAdmin]
  );
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`]);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
});

describe('the applicant cannot decide their own application', () => {
  it('cannot set their own pending application to approved', async () => {
    const id = await makeApp();
    const r = await asUser(
      people.learner,
      `UPDATE public.leave_onduty_applications SET status = 'approved' WHERE id = $1`,
      [id]
    );
    expect(r.code).toBe('42501');
    expect((await stored(id)).status).toBe('pending');
  });

  it('cannot set it to rejected either, or to any other status', async () => {
    const id = await makeApp();
    for (const s of ['rejected', 'withdrawn']) {
      const r = await asUser(
        people.learner,
        `UPDATE public.leave_onduty_applications SET status = $2::public.application_status WHERE id = $1`,
        [id, s]
      );
      expect(r.code).toBe('42501');
    }
    expect((await stored(id)).status).toBe('pending');
  });

  it('cannot move the approval step while leaving status pending', async () => {
    const id = await makeApp();
    const r = await asUser(
      people.learner,
      `UPDATE public.leave_onduty_applications SET current_step = 3 WHERE id = $1`,
      [id]
    );
    expect(r.code).toBe('42501');
    expect(r.message).toMatch(/not decide it/);
    expect((await stored(id)).current_step).toBe(1);
  });

  it('cannot approve the sponsor step of their own application', async () => {
    const id = await makeApp({ sponsored: true });
    const r = await asUser(
      people.learner,
      `UPDATE public.leave_onduty_applications
          SET sponsor_approval_status = 'approved', sponsor_action_at = now(), current_step = 1
        WHERE id = $1`,
      [id]
    );
    expect(r.code).toBe('42501');
    expect(await stored(id)).toMatchObject({ sponsor_approval_status: 'pending', current_step: 0 });
  });

  it('cannot route around the check by naming themselves sponsor in the same write', async () => {
    const id = await makeApp();
    for (const s of ['approved', 'rejected']) {
      const r = await asUser(
        people.learner,
        `UPDATE public.leave_onduty_applications
            SET status = $2::public.application_status, sponsor_id = $3
          WHERE id = $1`,
        [id, s, people.learner]
      );
      expect(r.code).toBe('42501');
    }
    expect(await stored(id)).toMatchObject({ status: 'pending', sponsor_id: null });
  });

  it('cannot move their application to another college', async () => {
    const id = await makeApp();
    const r = await asUser(
      people.learner,
      `UPDATE public.leave_onduty_applications SET institution_id = $2 WHERE id = $1`,
      [id, OTHER_INST]
    );
    expect(r.code).toBe('42501');
    expect((await stored(id)).institution_id).toBe(INST);
  });

  it('cannot INSERT an application that is already approved, or already sponsor-approved', async () => {
    const approved = await learnerInsert({ status: 'approved' });
    const sponsorApproved = await learnerInsert({
      current_step: 1,
      sponsor_id: people.sponsor,
      sponsor_approval_status: 'approved',
    });
    const farStep = await learnerInsert({ current_step: 5 });
    expect(approved.code).toBe('42501');
    expect(sponsorApproved.code).toBe('42501');
    expect(farStep.code).toBe('42501');
  });
});

describe('what the applicant legitimately does still works', () => {
  it('cancels their own pending application, exactly as cancelApplication sends it', async () => {
    const id = await makeApp();
    const r = await asUser(
      people.learner,
      `UPDATE public.leave_onduty_applications SET status = 'cancelled'
        WHERE id = $1 AND learner_id = $2 AND status = 'pending'`,
      [id, LEARNER]
    );
    expect(r).toMatchObject({ code: null, rowCount: 1 });
    expect((await stored(id)).status).toBe('cancelled');
  });

  it('cancels a sponsor-gated application that is still waiting for its sponsor', async () => {
    const id = await makeApp({ sponsored: true });
    const r = await asUser(
      people.learner,
      `UPDATE public.leave_onduty_applications SET status = 'cancelled' WHERE id = $1`,
      [id]
    );
    expect(r).toMatchObject({ code: null, rowCount: 1 });
    expect((await stored(id)).status).toBe('cancelled');
  });

  it('edits the details of their own pending application', async () => {
    const id = await makeApp();
    const r = await asUser(
      people.learner,
      `UPDATE public.leave_onduty_applications
          SET reason = 'Inter-college event, day two added', end_date = '2026-10-02',
              attachment_url = 'x/brochure.pdf'
        WHERE id = $1`,
      [id]
    );
    expect(r).toMatchObject({ code: null, rowCount: 1 });
    expect(await stored(id)).toMatchObject({
      status: 'pending',
      reason: 'Inter-college event, day two added',
      end_date: '2026-10-02',
    });
  });

  it('submits a new application, with and without a sponsor, as createApplication sends it', async () => {
    const plain = await learnerInsert();
    const sponsored = await learnerInsert({
      current_step: 0,
      sponsor_id: people.sponsor,
      sponsor_approval_status: 'pending',
    });
    expect(plain).toMatchObject({ code: null, rowCount: 1 });
    expect(sponsored).toMatchObject({ code: null, rowCount: 1 });
    expect(sponsored.rows[0]).toEqual({ status: 'pending', current_step: 0, sponsor_approval_status: 'pending' });
  });
});

describe('the sponsor records only their own decision', () => {
  it('cannot set the application to approved', async () => {
    const id = await makeApp({ sponsored: true });
    const r = await asUser(
      people.sponsor,
      `UPDATE public.leave_onduty_applications
          SET status = 'approved', sponsor_approval_status = 'approved'
        WHERE id = $1`,
      [id]
    );
    expect(r.code).toBe('42501');
    expect(await stored(id)).toMatchObject({ status: 'pending', sponsor_approval_status: 'pending' });
  });

  it('cannot change what the learner asked for, or where it is routed', async () => {
    const id = await makeApp({ sponsored: true });
    const reason = await asUser(
      people.sponsor,
      `UPDATE public.leave_onduty_applications SET reason = 'changed by sponsor' WHERE id = $1`,
      [id]
    );
    const inst = await asUser(
      people.sponsor,
      `UPDATE public.leave_onduty_applications SET institution_id = $2 WHERE id = $1`,
      [id, OTHER_INST]
    );
    expect(reason.code).toBe('42501');
    expect(reason.message).toMatch(/own decision/);
    expect(inst.code).toBe('42501');
    expect(await stored(id)).toMatchObject({ reason: 'Inter-college event', institution_id: INST });
  });

  it('cannot skip the approval chain by jumping current_step', async () => {
    const id = await makeApp({ sponsored: true });
    const r = await asUser(
      people.sponsor,
      `UPDATE public.leave_onduty_applications
          SET sponsor_approval_status = 'approved', current_step = 5
        WHERE id = $1`,
      [id]
    );
    expect(r.code).toBe('42501');
    expect(await stored(id)).toMatchObject({ current_step: 0, sponsor_approval_status: 'pending' });
  });

  it('approves, exactly as processSponsorApproval sends it', async () => {
    const id = await makeApp({ sponsored: true });
    const r = await asUser(
      people.sponsor,
      `UPDATE public.leave_onduty_applications
          SET sponsor_approval_status = 'approved', sponsor_comments = 'Confirmed',
              sponsor_action_at = now(), current_step = 1
        WHERE id = $1
        RETURNING status::text, current_step, sponsor_approval_status`,
      [id]
    );
    expect(r).toMatchObject({ code: null, rowCount: 1 });
    expect(r.rows[0]).toEqual({ status: 'pending', current_step: 1, sponsor_approval_status: 'approved' });
  });

  it('rejects, exactly as processSponsorApproval sends it', async () => {
    const id = await makeApp({ sponsored: true });
    const r = await asUser(
      people.sponsor,
      `UPDATE public.leave_onduty_applications
          SET sponsor_approval_status = 'rejected', sponsor_comments = 'Not with me',
              sponsor_action_at = now(), status = 'rejected'
        WHERE id = $1`,
      [id]
    );
    expect(r).toMatchObject({ code: null, rowCount: 1 });
    expect(await stored(id)).toMatchObject({ status: 'rejected', sponsor_approval_status: 'rejected' });
  });
});

describe('admins and server-side writers are unaffected', () => {
  it('a super admin still overrides: sets the application to approved directly', async () => {
    const id = await makeApp();
    const r = await asUser(
      people.superAdmin,
      `UPDATE public.leave_onduty_applications SET status = 'approved' WHERE id = $1`,
      [id]
    );
    expect(r).toMatchObject({ code: null, rowCount: 1 });
    expect((await stored(id)).status).toBe('approved');
  });

  it('a SECURITY DEFINER function called by an approver still writes status and current_step', async () => {
    const id = await makeApp();
    const r = await asUser(people.hod, `SELECT public.test_server_side_approve($1) AS s`, [id]);
    expect(r.code).toBeNull();
    expect(r.rows[0].s).toBe('approved');
    expect(await stored(id)).toMatchObject({ status: 'approved', current_step: 2 });
  });
});

describe('anon has no access at all', () => {
  it('anon can neither update nor read the table', async () => {
    const id = await makeApp();
    const upd = await asUser(
      null,
      `UPDATE public.leave_onduty_applications SET status = 'approved' WHERE id = $1`,
      [id],
      'anon'
    );
    const sel = await asUser(null, `SELECT count(*) FROM public.leave_onduty_applications`, [], 'anon');
    expect(upd.code).toBe('42501');
    expect(upd.message).toMatch(/permission denied/);
    expect(sel.code).toBe('42501');
    expect((await stored(id)).status).toBe('pending');
  });
});
