/**
 * supabase/migrations/20270613101117_hr_leave_deadline_enforcement.sql,
 * applied VERBATIM to a throwaway PostgreSQL 16 on a minimal schema.
 *
 * HR staff harness, lane A (2026-10-01). Proves the database half of the leave
 * deadline rules: a step is escalated at most once, a decided / moved /
 * locked-month request never is, a refused status change is recorded rather
 * than lost, the recipient lists respect scope and today's leave, the comp-off
 * nudge ledger is idempotent, the three overdue counters are widened from the
 * LIVE body, and none of it is executable by anon.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270613101117_hr_leave_deadline_enforcement.sql');
const PGHOST = process.env.HRDEADLINE_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HRDEADLINE_TEST_PGPORT ?? '5432';
const PGUSER = process.env.HRDEADLINE_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `hr_deadline_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const ORG = '00000000-0000-4000-8000-00000000a001';
const INST = '00000000-0000-4000-8000-00000000b001';
const INST2 = '00000000-0000-4000-8000-00000000b002';
const DEPT = '00000000-0000-4000-8000-00000000c001';
const DEPT2 = '00000000-0000-4000-8000-00000000c002';
const LT = '00000000-0000-4000-8000-00000000d001';
const APP = '00000000-0000-4000-8000-00000000e001';
const CREDIT = '00000000-0000-4000-8000-00000000f001';

// people (profile ids) and their staff rows
const P = {
  applicant: '00000000-0000-4000-8000-000000000101',
  hod: '00000000-0000-4000-8000-000000000102',
  hodOtherDept: '00000000-0000-4000-8000-000000000103',
  principal: '00000000-0000-4000-8000-000000000104',
  principalOtherInst: '00000000-0000-4000-8000-000000000105',
  hrhead: '00000000-0000-4000-8000-000000000106',
  director: '00000000-0000-4000-8000-000000000107',
  pinned: '00000000-0000-4000-8000-000000000108',
  goneHod: '00000000-0000-4000-8000-000000000109',
};
const S = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v.replace('0000000001', '0000000002')])) as typeof P;

const ROLE = {
  hod: '00000000-0000-4000-8000-000000000301',
  principal: '00000000-0000-4000-8000-000000000302',
  hr_head: '00000000-0000-4000-8000-000000000303',
};

const GENERATOR = (name: string) => `
CREATE FUNCTION public.${name}() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v FROM public.hr_leave_applications la
  WHERE la.status = 'pending' AND la.created_at < now() - interval '48 hours';
  RETURN v;
END $$;`;

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, institution_id uuid, is_active boolean DEFAULT true,
  is_login_disabled boolean DEFAULT false, is_super_admin boolean DEFAULT false);
CREATE TABLE public.staff (id uuid PRIMARY KEY, profile_id uuid, institution_id uuid, department_id uuid,
  is_active boolean DEFAULT true, first_name text, last_name text);
CREATE TABLE public.custom_roles (id uuid PRIMARY KEY, role_key text UNIQUE, is_active boolean DEFAULT true,
  permissions jsonb DEFAULT '{}', institution_scope text DEFAULT 'own');
CREATE TABLE public.user_roles (user_id uuid, role_id uuid);
CREATE TABLE public.user_institution_access (user_id uuid, institution_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.hr_leave_approver_scopes (role_key text PRIMARY KEY, scope_level text);
CREATE TABLE public.hr_organizations (id uuid PRIMARY KEY, institution_id uuid, included_in_hr boolean DEFAULT true);
CREATE TABLE public.hr_attendance_periods (institution_id uuid, period_year int, period_month int, status text);
CREATE TABLE public.hr_leave_applications (
  id uuid PRIMARY KEY, employee_id uuid, hr_organization_id uuid, leave_type_id uuid,
  status varchar NOT NULL DEFAULT 'pending', current_step int NOT NULL DEFAULT 0,
  approval_chain jsonb NOT NULL DEFAULT '[]', start_date date, end_date date,
  duration_type text DEFAULT 'full', superseded_by uuid, final_decided_at timestamptz,
  created_at timestamptz DEFAULT now());
CREATE TABLE public.hr_comp_off_credits (
  id uuid PRIMARY KEY, employee_id uuid, hr_organization_id uuid, status text, source text,
  worked_date date, expires_on date, approved_by uuid, approved_at timestamptz, rejection_reason text);
CREATE TABLE public.platform_policies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_key text NOT NULL,
  scope_type text NOT NULL, scope_id uuid, value jsonb NOT NULL, description text, data_type text NOT NULL,
  is_system boolean DEFAULT false, is_active boolean DEFAULT true);
CREATE UNIQUE INDEX ON public.platform_policies
  (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE public.ai_routine_schedules (routine_id text PRIMARY KEY, enabled boolean, managed boolean,
  days_of_week smallint[], minute_of_day int, max_only boolean);

-- Verbatim from 20260831120000 / 20260905180000.
CREATE FUNCTION public.fn_leave_step_approvers(p_step jsonb)
RETURNS TABLE(approver_user_id uuid, approver_role text) LANGUAGE sql IMMUTABLE AS $f$
  SELECT NULLIF(e->>'approver_user_id', '')::uuid, NULLIF(e->>'approver_role', '')
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_step -> 'approvers') = 'array' AND jsonb_array_length(p_step -> 'approvers') > 0
         THEN p_step -> 'approvers' ELSE jsonb_build_array(p_step) END) AS e;
$f$;
CREATE FUNCTION public.fn_hr_leave_final_step_index(p_chain jsonb) RETURNS integer LANGUAGE sql IMMUTABLE AS $f$
  SELECT COALESCE(
    (SELECT max(t.ord::int - 1) FROM jsonb_array_elements(COALESCE(p_chain, '[]'::jsonb)) WITH ORDINALITY AS t(step, ord)
     WHERE t.step ->> 'step_type' = 'final'),
    jsonb_array_length(COALESCE(p_chain, '[]'::jsonb)) - 1);
$f$;

-- Stand-in for the balance / period-cap guards, which fire on UPDATE OF status
-- and may refuse a row whose balance moved since it was filed.
CREATE FUNCTION public.test_refuse() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.start_date = DATE '2030-01-01' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Insufficient Casual Leave balance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_test_refuse BEFORE UPDATE OF status ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.test_refuse();

${GENERATOR('fn_generate_pending_leave_approval_items')}
${GENERATOR('fn_generate_hr_command_center_brief_items')}
${GENERATOR('fn_generate_super_admin_daily_digest')}
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;
const q = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;

const chain = (steps: object[]) => JSON.stringify(steps);
const hodStep = { step_order: 1, approver_role: 'hod', approver_user_id: null, status: 'pending', escalate_after_hours: 48 };
const principalStep = { step_order: 2, approver_role: 'principal', approver_user_id: null, status: 'pending', escalate_after_hours: 48, step_type: 'final' };

async function insertApp(over: Record<string, unknown> = {}) {
  const row = {
    id: APP,
    employee_id: S.applicant,
    hr_organization_id: ORG,
    leave_type_id: LT,
    status: 'pending',
    current_step: 0,
    approval_chain: chain([hodStep, principalStep]),
    start_date: '2030-02-10',
    end_date: '2030-02-10',
    ...over,
  };
  await q(
    `INSERT INTO public.hr_leave_applications
       (id, employee_id, hr_organization_id, leave_type_id, status, current_step, approval_chain, start_date, end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [row.id, row.employee_id, row.hr_organization_id, row.leave_type_id, row.status, row.current_step,
     row.approval_chain, row.start_date, row.end_date]
  );
}

let goLiveAfterFirstApply = '';

const record = async (step = 0, notified: string[] = [P.hod]) =>
  (await q(`SELECT public.fn_hr_leave_record_escalation($1, $2, now(), $3::uuid[]) AS o`, [APP, step, notified]))[0].o;

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e) {
    throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`);
  }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  goLiveAfterFirstApply = psql(['-d', DBNAME, '-tAc',
    `SELECT value #>> '{}' FROM public.platform_policies WHERE policy_key = 'hr.leave_deadlines.go_live_at'`]).trim();
  // Re-runnable: a second apply must neither fail nor double-widen.
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
});

afterAll(async () => {
  await client?.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]);
  } catch {
    /* best effort */
  }
});

beforeEach(async () => {
  await q(`TRUNCATE public.hr_leave_deadline_nudges, public.hr_leave_applications, public.hr_comp_off_credits,
           public.profiles, public.staff, public.custom_roles, public.user_roles, public.user_institution_access,
           public.hr_leave_approver_scopes, public.hr_organizations, public.hr_attendance_periods`);
  await q(`INSERT INTO public.hr_organizations VALUES ($1, $2, true)`, [ORG, INST]);
  await q(`INSERT INTO public.hr_leave_approver_scopes VALUES ('hod','department'), ('principal','institution'), ('hr_head','group')`);
  await q(
    `INSERT INTO public.custom_roles (id, role_key, permissions, institution_scope) VALUES
       ($1, 'hod', '{}', 'own'), ($2, 'principal', '{}', 'own'), ($3, 'hr_head', '{"hr.leave.approve": true}', 'all')`,
    [ROLE.hod, ROLE.principal, ROLE.hr_head]
  );
  const people: Array<[keyof typeof P, string, string | null, boolean]> = [
    ['applicant', INST, DEPT, true],
    ['hod', INST, DEPT, true],
    ['hodOtherDept', INST, DEPT2, true],
    ['principal', INST, null, true],
    ['principalOtherInst', INST2, null, true],
    ['hrhead', INST2, null, true],
    ['director', INST, null, true],
    ['pinned', INST2, null, true],
    ['goneHod', INST, DEPT, false],
  ];
  for (const [k, inst, dept, active] of people) {
    await q(`INSERT INTO public.profiles (id, institution_id, is_active, is_super_admin) VALUES ($1, $2, $3, $4)`, [
      P[k], inst, active, k === 'director',
    ]);
    await q(`INSERT INTO public.staff (id, profile_id, institution_id, department_id, first_name) VALUES ($1,$2,$3,$4,$5)`, [
      S[k], P[k], inst, dept, k,
    ]);
  }
  await q(
    `INSERT INTO public.user_roles VALUES ($1,$4), ($2,$4), ($3,$4), ($5,$6), ($7,$6), ($8,$9), ($10,$9)`,
    [P.hod, P.hodOtherDept, P.goneHod, ROLE.hod, P.principal, ROLE.principal, P.principalOtherInst,
     P.hrhead, ROLE.hr_head, P.director]
  );
});

describe('fn_hr_leave_record_escalation — once per step, never on a decided request', () => {
  it('escalates a pending request once: status, ledger row, then "already"', async () => {
    await insertApp();
    expect(await record(0, [P.hod, P.principal])).toBe('escalated');
    const [a] = await q(`SELECT status, current_step, approval_chain FROM public.hr_leave_applications`);
    expect(a.status).toBe('escalated');
    expect(a.current_step).toBe(0);
    expect(a.approval_chain).toEqual([hodStep, principalStep]); // the chain is never touched
    const ledger = await q(`SELECT kind, step_index, outcome, notified_user_ids FROM public.hr_leave_deadline_nudges`);
    expect(ledger).toEqual([
      { kind: 'leave_escalation', step_index: 0, outcome: 'escalated', notified_user_ids: [P.hod, P.principal] },
    ]);
    expect(await record(0)).toBe('already');
    expect(await q(`SELECT count(*)::int AS n FROM public.hr_leave_deadline_nudges`)).toEqual([{ n: 1 }]);
  });

  it('escalates the NEXT step of an already-escalated request, leaving its status alone', async () => {
    await insertApp({
      status: 'escalated',
      current_step: 1,
      approval_chain: chain([{ ...hodStep, status: 'approved' }, principalStep]),
    });
    expect(await record(1)).toBe('escalated');
    expect(await q(`SELECT status FROM public.hr_leave_applications`)).toEqual([{ status: 'escalated' }]);
  });

  it('never escalates a decided, withdrawn or superseded request', async () => {
    for (const status of ['approved', 'rejected', 'withdrawn', 'cancelled']) {
      await q(`DELETE FROM public.hr_leave_applications`);
      await insertApp({ status });
      expect(await record(0)).toBe('decided');
    }
    await q(`UPDATE public.hr_leave_applications SET status = 'pending', superseded_by = gen_random_uuid()`);
    expect(await record(0)).toBe('decided');
    expect(await q(`SELECT count(*)::int AS n FROM public.hr_leave_deadline_nudges`)).toEqual([{ n: 0 }]);
  });

  it('answers "moved" when the request is no longer waiting on that step', async () => {
    await insertApp({ current_step: 1, approval_chain: chain([{ ...hodStep, status: 'approved' }, principalStep]) });
    expect(await record(0)).toBe('moved');
    await q(`UPDATE public.hr_leave_applications SET current_step = 0,
             approval_chain = $1::jsonb`, [chain([{ ...hodStep, status: 'rejected' }, principalStep])]);
    expect(await record(0)).toBe('moved');
    expect(await q(`SELECT status FROM public.hr_leave_applications`)).toEqual([{ status: 'pending' }]);
  });

  it('skips a request in a locked attendance month WITHOUT recording it, so reopening re-arms it', async () => {
    await insertApp();
    await q(`INSERT INTO public.hr_attendance_periods VALUES ($1, 2030, 2, 'locked')`, [INST]);
    expect(await record(0)).toBe('locked');
    expect(await q(`SELECT count(*)::int AS n FROM public.hr_leave_deadline_nudges`)).toEqual([{ n: 0 }]);
    await q(`UPDATE public.hr_attendance_periods SET status = 'open'`);
    expect(await record(0)).toBe('escalated');
  });

  it('records a status change a guard refused, keeps the row pending, and does not retry it', async () => {
    await insertApp({ start_date: '2030-01-01', end_date: '2030-01-01' });
    expect(await record(0)).toBe('status_refused');
    expect(await q(`SELECT status FROM public.hr_leave_applications`)).toEqual([{ status: 'pending' }]);
    const [row] = await q(`SELECT outcome, detail FROM public.hr_leave_deadline_nudges`);
    expect(row.outcome).toBe('status_refused');
    expect(row.detail).toContain('Insufficient');
    expect(await record(0)).toBe('already');
  });
});

describe('fn_hr_leave_step_holders — scope as the gate applies it', () => {
  it('a department-scoped role reaches only active holders in the applicant’s department', async () => {
    await insertApp();
    const [{ ids }] = await q(`SELECT public.fn_hr_leave_step_holders($1, 0) AS ids`, [APP]);
    expect(ids).toEqual([P.hod]); // not hodOtherDept, not the deactivated goneHod
  });

  it('an institution-scoped role reaches its holders in the applicant’s institution, plus explicit grants', async () => {
    await insertApp();
    const [{ ids }] = await q(`SELECT public.fn_hr_leave_step_holders($1, 1) AS ids`, [APP]);
    expect(ids).toEqual([P.principal]);
    await q(`INSERT INTO public.user_institution_access VALUES ($1, $2, true)`, [P.principalOtherInst, INST]);
    const [{ ids: widened }] = await q(`SELECT public.fn_hr_leave_step_holders($1, 1) AS ids`, [APP]);
    expect([...widened].sort()).toEqual([P.principal, P.principalOtherInst].sort());
  });

  it('a pinned approver is named outright from any institution, and multi-approver steps are read', async () => {
    await insertApp({
      approval_chain: chain([
        { ...hodStep, approver_role: 'hr_approver', approvers: [
          { approver_role: null, approver_user_id: P.pinned, approver_name: 'Pinned' },
          { approver_role: 'principal', approver_user_id: null, approver_name: null },
        ] },
      ]),
    });
    const [{ ids }] = await q(`SELECT public.fn_hr_leave_step_holders($1, 0) AS ids`, [APP]);
    expect([...ids].sort()).toEqual([P.pinned, P.principal].sort());
  });

  it('never returns the applicant, and a HOD never decides a senior colleague’s leave', async () => {
    // The applicant is themself a principal.
    await q(`INSERT INTO public.user_roles VALUES ($1, $2)`, [P.applicant, ROLE.principal]);
    await insertApp();
    const [{ ids: hods }] = await q(`SELECT public.fn_hr_leave_step_holders($1, 0) AS ids`, [APP]);
    expect(hods).toEqual([]);
    const [{ ids: principals }] = await q(`SELECT public.fn_hr_leave_step_holders($1, 1) AS ids`, [APP]);
    expect(principals).toEqual([P.principal]);
  });

  it('a placeholder role that matches no custom_roles row resolves to nobody', async () => {
    await insertApp({ approval_chain: chain([{ ...hodStep, approver_role: 'hr_approver' }]) });
    const [{ ids }] = await q(`SELECT public.fn_hr_leave_step_holders($1, 0) AS ids`, [APP]);
    expect(ids).toEqual([]);
  });
});

describe('fn_hr_leave_escalation_recipients — tiers and today’s leave', () => {
  it('lists current, final and HR tiers; the HR tier excludes super admins', async () => {
    await insertApp();
    const rows = await q(`SELECT tier, user_id, on_leave_today FROM public.fn_hr_leave_escalation_recipients($1) ORDER BY tier`, [APP]);
    expect(rows).toEqual([
      { tier: 'current', user_id: P.hod, on_leave_today: false },
      { tier: 'final', user_id: P.principal, on_leave_today: false },
      { tier: 'hr', user_id: P.hrhead, on_leave_today: false },
    ]);
  });

  it('flags an approver on approved full-day leave today, but not one on a few hours off', async () => {
    await insertApp();
    await q(
      `INSERT INTO public.hr_leave_applications (id, employee_id, hr_organization_id, leave_type_id, status, start_date, end_date, duration_type)
       VALUES (gen_random_uuid(), $1, $2, $3, 'approved', (now() AT TIME ZONE 'Asia/Kolkata')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date, 'full'),
              (gen_random_uuid(), $4, $2, $3, 'approved', (now() AT TIME ZONE 'Asia/Kolkata')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date, 'hourly')`,
      [S.hod, ORG, LT, S.principal]
    );
    const rows = await q(`SELECT tier, on_leave_today FROM public.fn_hr_leave_escalation_recipients($1) ORDER BY tier`, [APP]);
    expect(rows).toEqual([
      { tier: 'current', on_leave_today: true },
      { tier: 'final', on_leave_today: false },
      { tier: 'hr', on_leave_today: false },
    ]);
  });

  it('on the final step there is no separate final tier', async () => {
    await insertApp({ current_step: 1, approval_chain: chain([{ ...hodStep, status: 'approved' }, principalStep]) });
    const tiers = (await q(`SELECT DISTINCT tier FROM public.fn_hr_leave_escalation_recipients($1) ORDER BY tier`, [APP])).map((r) => r.tier);
    expect(tiers).toEqual(['current', 'hr']);
  });
});

describe('comp-off nudges', () => {
  const claim = async (over: Record<string, unknown>) => {
    const r = { status: 'pending', source: 'claim', expires_on: "(now() AT TIME ZONE 'Asia/Kolkata')::date + 5", approved_by: null, rejection_reason: null, ...over };
    await q(
      `INSERT INTO public.hr_comp_off_credits (id, employee_id, hr_organization_id, status, source, worked_date, expires_on, approved_by, rejection_reason)
       VALUES ($1, $2, $3, $4, $5, DATE '2026-09-01', ${r.expires_on}, $6, $7)`,
      [CREDIT, S.applicant, ORG, r.status, r.source, r.approved_by, r.rejection_reason]
    );
  };
  const nudge = async (kind: string) =>
    (await q(`SELECT public.fn_hr_comp_off_record_nudge($1, $2, ARRAY[$3]::uuid[]) AS o`, [CREDIT, kind, P.hrhead]))[0].o;

  it('records each window once per claim', async () => {
    await claim({});
    expect(await nudge('comp_off_expiry_7d')).toBe('recorded');
    expect(await nudge('comp_off_expiry_7d')).toBe('already');
    expect(await nudge('comp_off_expiry_2d')).toBe('recorded');
  });

  it('refuses to nudge a claim that is decided or already expired', async () => {
    await claim({ expires_on: "(now() AT TIME ZONE 'Asia/Kolkata')::date - 1" });
    expect(await nudge('comp_off_expiry_2d')).toBe('stale');
    await q(`UPDATE public.hr_comp_off_credits SET expires_on = expires_on + 10, status = 'approved'`);
    expect(await nudge('comp_off_expiry_7d')).toBe('stale');
  });

  it('a lapse notice only for the nightly auto-reject, never for a person’s rejection', async () => {
    await claim({ status: 'rejected', rejection_reason: "Automatically rejected: not approved before the credit's one-month expiry on 01/10/2026." });
    expect(await nudge('comp_off_lapsed')).toBe('recorded');
    await q(`DELETE FROM public.hr_leave_deadline_nudges`);
    await q(`UPDATE public.hr_comp_off_credits SET approved_by = $1`, [P.hrhead]);
    expect(await nudge('comp_off_lapsed')).toBe('stale');
  });

  it('lists the organisation’s approvers minus the claimant, and the claimant', async () => {
    await claim({});
    const rows = await q(`SELECT tier, user_id FROM public.fn_hr_comp_off_nudge_recipients($1) ORDER BY tier`, [CREDIT]);
    expect(rows).toEqual([
      { tier: 'approver', user_id: P.hrhead },
      { tier: 'claimant', user_id: P.applicant },
    ]);
  });

  it('rejects an unknown nudge kind', async () => {
    await claim({});
    await expect(nudge('whatever')).rejects.toThrow(/Unknown comp-off nudge kind/);
  });
});

describe('migration housekeeping', () => {
  it('widens the three overdue counters from their live body, exactly once', async () => {
    for (const fn of [
      'fn_generate_pending_leave_approval_items',
      'fn_generate_hr_command_center_brief_items',
      'fn_generate_super_admin_daily_digest',
    ]) {
      const [{ def }] = await q(`SELECT pg_get_functiondef($1::regproc) AS def`, [`public.${fn}`]);
      expect(def).toContain(`la.status IN ('pending', 'escalated')`);
      expect(def).not.toContain(`la.status = 'pending'`);
    }
    await insertApp({ status: 'escalated' });
    await q(`UPDATE public.hr_leave_applications SET created_at = now() - interval '3 days'`);
    expect(await q(`SELECT public.fn_generate_super_admin_daily_digest() AS n`)).toEqual([{ n: 1 }]);
  });

  it('seeds the go-live cutoff once, as a timestamp string, and a re-apply keeps the original moment', async () => {
    const rows = await q(
      `SELECT scope_type, scope_id, data_type, is_active, jsonb_typeof(value) AS t, value #>> '{}' AS at
         FROM public.platform_policies WHERE policy_key = 'hr.leave_deadlines.go_live_at'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ scope_type: 'global', scope_id: null, data_type: 'string', is_active: true, t: 'string' });
    expect(Number.isNaN(Date.parse(rows[0].at))).toBe(false);
    expect(Math.abs(Date.now() - Date.parse(rows[0].at))).toBeLessThan(10 * 60 * 1000);
    expect(rows[0].at).toBe(goLiveAfterFirstApply);
  });

  it('seeds the daily comp-off routine', async () => {
    expect(await q(`SELECT routine_id, minute_of_day, days_of_week FROM public.ai_routine_schedules`)).toEqual([
      { routine_id: 'hr-comp-off-expiry-nudges', minute_of_day: 557, days_of_week: [0, 1, 2, 3, 4, 5, 6] },
    ]);
  });

  it('no new function is executable by anon or authenticated; service_role can run each', async () => {
    const fns = [
      'public.fn_hr_profiles_on_leave_today(uuid[])',
      'public.fn_hr_leave_step_holders(uuid, integer)',
      'public.fn_hr_leave_approve_key_holders(uuid)',
      'public.fn_hr_leave_escalation_recipients(uuid)',
      'public.fn_hr_leave_record_escalation(uuid, integer, timestamptz, uuid[])',
      'public.fn_hr_comp_off_nudge_recipients(uuid)',
      'public.fn_hr_comp_off_record_nudge(uuid, text, uuid[])',
    ];
    for (const fn of fns) {
      const [r] = await q(
        `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') AS authed,
                has_function_privilege('service_role', $1, 'EXECUTE') AS svc`,
        [fn]
      );
      expect({ fn, ...r }).toEqual({ fn, anon: false, authed: false, svc: true });
    }
    const [t] = await q(
      `SELECT has_table_privilege('anon', 'public.hr_leave_deadline_nudges', 'SELECT') AS anon,
              has_table_privilege('authenticated', 'public.hr_leave_deadline_nudges', 'INSERT') AS authed_insert`
    );
    expect(t).toEqual({ anon: false, authed_insert: false });
  });
});
