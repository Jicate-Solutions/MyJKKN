/**
 * An approver's decision on a learner leave / on-duty application — behavioural
 * proof for
 * supabase/migrations/20270326141500_leave_onduty_approver_decides_own_step.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration file is applied VERBATIM with psql onto a throwaway database
 * that carries production's own UPDATE policies on leave_onduty_applications
 * (read back from production 2026-09-24). Every call below is made as the
 * `authenticated` role with auth.uid() set to a real approver, exactly as a
 * signed-in HOD's browser would, and the suite reads back what PostgreSQL
 * actually stored.
 *
 * The first test is the CONTROL: the write the old browser code made, run as
 * the same HOD, changes 0 rows and raises nothing — the defect itself.
 *
 * REQUIRES a local PostgreSQL 16 and refuses to skip silently without one
 * (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml):
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/academic/leave-onduty/leave-onduty-decide-step.pg.test.ts
 *
 * Override the server with LEAVEOD_TEST_PGHOST / _PGPORT / _PGUSER. On CI the
 * user defaults to `postgres` (the service container's trust-auth superuser),
 * the same self-sufficient fallback
 * __tests__/loops/charter-approval-refuses-bar-kinds.pg.test.ts uses, so this
 * file needs no new entry in the workflow's env block.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20270326141500_leave_onduty_approver_decides_own_step.sql'
);

const PGHOST = process.env.LEAVEOD_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.LEAVEOD_TEST_PGPORT ?? '5432';
const PGUSER =
  process.env.LEAVEOD_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `leave_od_decide_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

/**
 * Production's shapes, reduced to the columns the function touches, with the
 * enums as production holds them and the three UPDATE policies that exist on
 * leave_onduty_applications today. Supabase's default EXECUTE grant to anon is
 * reproduced so the REVOKE is actually tested.
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

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

CREATE TYPE public.application_status AS ENUM ('draft','pending','approved','rejected','cancelled','submitted','under_review','documents_pending','interview_scheduled','interviewed','waitlisted','withdrawn');
CREATE TYPE public.approval_status AS ENUM ('pending','approved','rejected','escalated','forwarded');
CREATE TYPE public.approver_role AS ENUM ('faculty','hod','principal','super_admin');
CREATE TYPE public.flow_type AS ENUM ('sequential','parallel');
CREATE TYPE public.leave_onduty_category AS ENUM ('leave','onduty');

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, learner_id uuid);
CREATE TABLE public.learners_profiles (id uuid PRIMARY KEY, profile_id uuid);

CREATE TABLE public.leave_onduty_approval_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  flow_type public.flow_type NOT NULL,
  flow_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.leave_onduty_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES public.learners_profiles(id),
  institution_id uuid NOT NULL,
  department_id uuid,
  semester_id uuid,
  category public.leave_onduty_category NOT NULL DEFAULT 'onduty',
  sub_category text NOT NULL DEFAULT 'event_participation',
  status public.application_status NOT NULL DEFAULT 'pending',
  current_step integer DEFAULT 1 CONSTRAINT valid_current_step CHECK (current_step >= 0),
  sponsor_id uuid,
  sponsor_approval_status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.leave_onduty_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.leave_onduty_applications(id) ON DELETE CASCADE,
  step_order integer NOT NULL CONSTRAINT valid_step_order CHECK (step_order >= 1),
  approver_id uuid REFERENCES public.profiles(id),
  approver_role public.approver_role NOT NULL,
  status public.approval_status NOT NULL DEFAULT 'pending',
  comments text CONSTRAINT comments_max_length CHECK (length(comments) <= 1000),
  action_taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The 5-argument lookup the seeder and the approval screen use. Production's
-- is SECURITY INVOKER and returns one leave_onduty_approval_flows row.
CREATE FUNCTION public.get_applicable_approval_flow(
  p_institution_id uuid, p_department_id uuid, p_semester_id uuid,
  p_category text, p_sub_category text
) RETURNS public.leave_onduty_approval_flows LANGUAGE sql STABLE AS $$
  SELECT * FROM public.leave_onduty_approval_flows
  WHERE institution_id = p_institution_id AND is_active
  LIMIT 1;
$$;

ALTER TABLE public.leave_onduty_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_onduty_approvals ENABLE ROW LEVEL SECURITY;

-- Production, verbatim in substance (pg_policies, 2026-09-24).
CREATE POLICY admins_update_applications ON public.leave_onduty_applications FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
                 AND profiles.role = ANY (ARRAY['super_admin','admin','institution_admin'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
                 AND profiles.role = ANY (ARRAY['super_admin','admin','institution_admin'])));
CREATE POLICY learners_update_own_pending ON public.leave_onduty_applications FOR UPDATE
  USING (learner_id IN (SELECT learners_profiles.id FROM public.learners_profiles
                        WHERE learners_profiles.id = (SELECT profiles.learner_id FROM public.profiles
                                                      WHERE profiles.id = (SELECT auth.uid())))
         AND status = 'pending'::public.application_status)
  WITH CHECK (learner_id IN (SELECT learners_profiles.id FROM public.learners_profiles
                        WHERE learners_profiles.id = (SELECT profiles.learner_id FROM public.profiles
                                                      WHERE profiles.id = (SELECT auth.uid()))));
CREATE POLICY sponsors_update_own_pending ON public.leave_onduty_applications FOR UPDATE TO authenticated
  USING (sponsor_id = (SELECT auth.uid()) AND sponsor_approval_status = 'pending')
  WITH CHECK (sponsor_id = (SELECT auth.uid()));
-- Approvers can see the application (production: approvers_view_assigned via
-- can_see_leave_onduty_application) — reduced to "holds a row on it".
CREATE POLICY approvers_view_assigned ON public.leave_onduty_applications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.leave_onduty_approvals a
                 WHERE a.application_id = leave_onduty_applications.id AND a.approver_id = (SELECT auth.uid())));
CREATE POLICY approvers_view_own ON public.leave_onduty_approvals FOR SELECT
  USING (approver_id = (SELECT auth.uid()));
CREATE POLICY approvers_update_own ON public.leave_onduty_approvals FOR UPDATE
  USING (approver_id = (SELECT auth.uid()) AND status = 'pending'::public.approval_status)
  WITH CHECK (approver_id = (SELECT auth.uid()));

GRANT SELECT, UPDATE ON public.leave_onduty_applications, public.leave_onduty_approvals TO authenticated;
GRANT SELECT ON public.profiles, public.learners_profiles, public.leave_onduty_approval_flows TO authenticated;
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
const INST_PARALLEL = randomUUID();
const people = {
  faculty: randomUUID(),
  hod: randomUUID(),
  principal: randomUUID(),
  stranger: randomUUID(),
  learnerProfile: randomUUID(),
};
const LEARNER = randomUUID();

async function q<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await client.query(sql, params);
  return r.rows as T[];
}

/**
 * Run `sql` as a signed-in person: role `authenticated`, auth.uid() = uid.
 * Returns the rows and rowCount, or the error's SQLSTATE and message.
 */
async function asUser(uid: string | null, sql: string, params: unknown[] = [], role = 'authenticated') {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('test.acting_uid', $1, true)`, [uid ?? '']);
    await client.query(`SET LOCAL ROLE ${role}`);
    const r = await client.query(sql, params);
    await client.query('COMMIT');
    return { rows: r.rows as Record<string, any>[], rowCount: r.rowCount, code: null as string | null, message: '' };
  } catch (e) {
    await client.query('ROLLBACK');
    const err = e as { code?: string; message?: string };
    return { rows: [], rowCount: 0, code: err.code ?? 'unknown', message: err.message ?? '' };
  }
}

function decide(uid: string | null, appId: string, decision: string, comments: string | null = null) {
  return asUser(uid, `SELECT public.fn_leave_onduty_decide_step($1, $2, $3) AS r`, [appId, decision, comments]);
}

async function app(appId: string) {
  return (
    await q<{ status: string; current_step: number }>(
      `SELECT status::text, current_step FROM public.leave_onduty_applications WHERE id = $1`,
      [appId]
    )
  )[0];
}

async function steps(appId: string) {
  return q<{ step_order: number; status: string; comments: string | null; decided: boolean }>(
    `SELECT step_order, status::text, comments, action_taken_at IS NOT NULL AS decided
       FROM public.leave_onduty_approvals WHERE application_id = $1 ORDER BY step_order, created_at`,
    [appId]
  );
}

/** A pending application with one approver row per [step_order, approver, role, status]. */
async function makeApp(
  rows: Array<[number, string, string, string?]>,
  opts: { institution?: string; current_step?: number; sponsor?: string | null } = {}
) {
  const [{ id }] = await q<{ id: string }>(
    `INSERT INTO public.leave_onduty_applications (learner_id, institution_id, current_step, sponsor_approval_status)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [LEARNER, opts.institution ?? INST, opts.current_step ?? 1, opts.sponsor ?? null]
  );
  for (const [step, approver, role, status] of rows) {
    await q(
      `INSERT INTO public.leave_onduty_approvals (application_id, step_order, approver_id, approver_role, status)
       VALUES ($1, $2, $3, $4::public.approver_role, $5::public.approval_status)`,
      [id, step, approver, role, status ?? 'pending']
    );
  }
  return id;
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

  tmp = mkdtempSync(path.join(tmpdir(), 'leaveod-'));
  const preludePath = path.join(tmp, 'prelude.sql');
  writeFileSync(preludePath, PRELUDE);
  psql(['-d', DBNAME, '-f', preludePath]);
  psql(['-d', DBNAME, '-f', MIGRATION]);

  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();

  await q(
    `INSERT INTO public.profiles (id, role) VALUES
       ($1, 'faculty'), ($2, 'hod'), ($3, 'principal'), ($4, 'faculty')`,
    [people.faculty, people.hod, people.principal, people.stranger]
  );
  await q(`INSERT INTO public.learners_profiles (id, profile_id) VALUES ($1, $2)`, [LEARNER, people.learnerProfile]);
  await q(`INSERT INTO public.profiles (id, role, learner_id) VALUES ($1, 'student', $2)`, [
    people.learnerProfile,
    LEARNER,
  ]);
  await q(
    `INSERT INTO public.leave_onduty_approval_flows (institution_id, flow_type) VALUES ($1, 'sequential'), ($2, 'parallel')`,
    [INST, INST_PARALLEL]
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

let appId: string;

describe('the defect this migration exists to fix (control)', () => {
  beforeEach(async () => {
    appId = await makeApp([
      [1, people.hod, 'hod'],
      [2, people.principal, 'principal'],
    ]);
  });

  it('as the HOD, the old browser write to the application changes 0 rows and raises nothing', async () => {
    const stepWrite = await asUser(
      people.hod,
      `UPDATE public.leave_onduty_approvals SET status = 'approved' WHERE application_id = $1 AND approver_id = $2`,
      [appId, people.hod]
    );
    const advance = await asUser(
      people.hod,
      `UPDATE public.leave_onduty_applications SET current_step = 2 WHERE id = $1`,
      [appId]
    );

    expect(stepWrite).toMatchObject({ code: null, rowCount: 1 });
    expect(advance).toMatchObject({ code: null, rowCount: 0 });
    expect(await app(appId)).toEqual({ status: 'pending', current_step: 1 });
  });

  it('the migration adds no UPDATE policy to leave_onduty_applications', async () => {
    const rows = await q<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
        WHERE tablename = 'leave_onduty_applications' AND cmd = 'UPDATE' ORDER BY 1`
    );
    expect(rows.map((r) => r.policyname)).toEqual([
      'admins_update_applications',
      'learners_update_own_pending',
      'sponsors_update_own_pending',
    ]);
  });
});

describe('fn_leave_onduty_decide_step — sequential chain (every active flow on production)', () => {
  beforeEach(async () => {
    appId = await makeApp([
      [1, people.hod, 'hod'],
      [2, people.principal, 'principal'],
    ]);
  });

  it('refuses someone who holds no step on the application', async () => {
    const r = await decide(people.stranger, appId, 'approved');
    expect(r.code).toBe('42501');
    expect(r.message).toMatch(/not the approver/);
    expect(await app(appId)).toEqual({ status: 'pending', current_step: 1 });
    expect((await steps(appId)).map((s) => s.status)).toEqual(['pending', 'pending']);
  });

  it('refuses the step-2 approver while step 1 is still pending', async () => {
    const r = await decide(people.principal, appId, 'approved');
    expect(r.code).toBe('42501');
    expect(r.message).toMatch(/waiting for step 1/);
    expect(await app(appId)).toEqual({ status: 'pending', current_step: 1 });
    expect((await steps(appId)).map((s) => s.status)).toEqual(['pending', 'pending']);
  });

  it('the HOD approving step 1 advances the application to step 2 and records the step', async () => {
    const r = await decide(people.hod, appId, 'approved', '  Fine by me  ');
    expect(r.code).toBeNull();
    expect(r.rows[0].r).toEqual({
      application_id: appId,
      decision: 'approved',
      decided_step: 1,
      step_status: 'approved',
      status: 'pending',
      current_step: 2,
    });
    expect(await app(appId)).toEqual({ status: 'pending', current_step: 2 });
    const s = await steps(appId);
    expect(s[0]).toEqual({ step_order: 1, status: 'approved', comments: 'Fine by me', decided: true });
    expect(s[1]).toMatchObject({ step_order: 2, status: 'pending', decided: false });
  });

  it('the final approval sets the application to approved', async () => {
    await decide(people.hod, appId, 'approved');
    const r = await decide(people.principal, appId, 'approved');
    expect(r.code).toBeNull();
    expect(r.rows[0].r).toMatchObject({ status: 'approved', step_status: 'approved', decided_step: 2 });
    expect((await app(appId)).status).toBe('approved');
  });

  it('a rejection sets the application to rejected, and nobody can act on it afterwards', async () => {
    const r = await decide(people.hod, appId, 'rejected', 'Dates clash with the internal test');
    expect(r.code).toBeNull();
    expect(r.rows[0].r).toMatchObject({ status: 'rejected', step_status: 'rejected', decided_step: 1 });
    expect((await app(appId)).status).toBe('rejected');

    const after = await decide(people.principal, appId, 'approved');
    expect(after.code).toBe('55000');
    expect((await app(appId)).status).toBe('rejected');
  });

  it('the same approver cannot decide the same step twice', async () => {
    await decide(people.hod, appId, 'approved');
    const again = await decide(people.hod, appId, 'rejected');
    expect(again.code).toBe('42501');
    expect(await app(appId)).toEqual({ status: 'pending', current_step: 2 });
  });

  it('refuses a caller who is not signed in, and an unknown decision', async () => {
    expect((await decide(null, appId, 'approved')).code).toBe('42501');
    expect((await decide(people.hod, appId, 'escalated')).code).toBe('22023');
    expect(await app(appId)).toEqual({ status: 'pending', current_step: 1 });
  });
});

describe('fn_leave_onduty_decide_step — shapes production actually holds', () => {
  it('the current step is judged from the seeded rows: a chain that starts at step 2 can move', async () => {
    // The seeder skips a flow step it cannot staff; current_step stays 1.
    appId = await makeApp([
      [2, people.hod, 'hod'],
      [3, people.principal, 'principal'],
    ]);
    const r = await decide(people.hod, appId, 'approved');
    expect(r.code).toBeNull();
    expect(await app(appId)).toEqual({ status: 'pending', current_step: 3 });
  });

  it('a step already approved out of turn is skipped over when the earlier step is decided', async () => {
    // Production holds exactly this: faculty (1) pending, HOD (2) approved, principal (3) pending.
    appId = await makeApp([
      [1, people.faculty, 'faculty'],
      [2, people.hod, 'hod', 'approved'],
      [3, people.principal, 'principal'],
    ]);
    await decide(people.faculty, appId, 'approved');
    expect(await app(appId)).toEqual({ status: 'pending', current_step: 3 });
    await decide(people.principal, appId, 'approved');
    expect((await app(appId)).status).toBe('approved');
  });

  it('an application with nothing left pending is refused, not silently approved', async () => {
    appId = await makeApp([
      [1, people.hod, 'hod', 'approved'],
      [2, people.faculty, 'faculty', 'approved'],
    ]);
    const r = await decide(people.hod, appId, 'approved');
    expect(r.code).toBe('55000');
    expect((await app(appId)).status).toBe('pending');
  });

  it('refuses while the sponsor has not approved yet', async () => {
    appId = await makeApp([[1, people.hod, 'hod']], { current_step: 0, sponsor: 'pending' });
    const r = await decide(people.hod, appId, 'approved');
    expect(r.code).toBe('55000');
    expect(r.message).toMatch(/sponsor/);
  });

  it('refuses the applicant, even when a row names them', async () => {
    appId = await makeApp([[1, people.learnerProfile, 'faculty']]);
    const r = await decide(people.learnerProfile, appId, 'approved');
    expect(r.code).toBe('42501');
    expect(r.message).toMatch(/your own application/);
    expect((await app(appId)).status).toBe('pending');
  });
});

describe('fn_leave_onduty_decide_step — parallel flow', () => {
  it('any holder of a pending step may decide; the application is approved when none remain', async () => {
    appId = await makeApp(
      [
        [1, people.hod, 'hod'],
        [2, people.principal, 'principal'],
      ],
      { institution: INST_PARALLEL }
    );
    const first = await decide(people.principal, appId, 'approved');
    expect(first.code).toBeNull();
    expect(first.rows[0].r).toMatchObject({ status: 'pending', decided_step: 2, current_step: 1 });
    const last = await decide(people.hod, appId, 'approved');
    expect(last.rows[0].r).toMatchObject({ status: 'approved' });
  });
});

describe('who may call it', () => {
  it('anon cannot execute it; PUBLIC holds no EXECUTE; authenticated does', async () => {
    appId = await makeApp([[1, people.hod, 'hod']]);
    const anon = await asUser(people.hod, `SELECT public.fn_leave_onduty_decide_step($1, 'approved')`, [appId], 'anon');
    expect(anon.code).toBe('42501');
    expect(anon.message).toMatch(/permission denied/);

    const acl = await q<{ anon: boolean; authenticated: boolean; public_grant: boolean; definer: boolean }>(
      `SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
              EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS public_grant,
              p.prosecdef AS definer
         FROM pg_proc p WHERE p.proname = 'fn_leave_onduty_decide_step'`
    );
    expect(acl[0]).toEqual({ anon: false, authenticated: true, public_grant: false, definer: true });
    expect((await app(appId)).status).toBe('pending');
  });
});
