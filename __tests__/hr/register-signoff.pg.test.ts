/**
 * Behavioural proof for supabase/migrations/20271007161107_hr_salary_register_signoff.sql
 * — the named two-step sign-off on the monthly salary register.
 *
 * The migration is applied VERBATIM with psql onto a throwaway database whose
 * prelude stands in for the production pieces it touches: the run table,
 * profiles, auth.users, platform_policies and the four permission helpers.
 * Each helper reads a test setting so a case can make it answer true, false
 * or NULL. Every call runs as `authenticated` with auth.uid() from a setting,
 * inside a transaction that is always rolled back.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20271007161107_hr_salary_register_signoff.sql');
const PGHOST = process.env.HRSO_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HRSO_TEST_PGPORT ?? '5432';
const PGUSER = process.env.HRSO_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `hrso_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const GENERATOR = '00000000-0000-4000-8000-00000000a001';
const PRINCIPAL = '00000000-0000-4000-8000-00000000a002';
const ACCOUNTS = '00000000-0000-4000-8000-00000000a003';
const OUTSIDER = '00000000-0000-4000-8000-00000000a004';
const COLLEGE = '00000000-0000-4000-8000-00000000c001';
const OTHER_COLLEGE = '00000000-0000-4000-8000-00000000c002';
const RUN = '00000000-0000-4000-8000-00000000e001';
const NEWER_RUN = '00000000-0000-4000-8000-00000000e002';
const ORG = '00000000-0000-4000-8000-00000000b001';
const MEMBER = '00000000-0000-4000-8000-00000000d001';
const OTHER_MEMBER = '00000000-0000-4000-8000-00000000d002';
const LINE = '00000000-0000-4000-8000-00000000f001';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

-- 'true' / 'false' answer that; anything else (unset, 'null') answers NULL.
CREATE FUNCTION public.test_flag(text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE current_setting($1, true) WHEN 'true' THEN true WHEN 'false' THEN false ELSE NULL END $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(public.test_flag('test.sa'), false) $$;
CREATE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT false $$;
-- Holds a key when it is listed in test.keys; test.perm_null = 'true' makes it NULL.
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN current_setting('test.perm_null', true) = 'true' THEN NULL
              ELSE permission_name = ANY (string_to_array(COALESCE(current_setting('test.keys', true), ''), ',')) END $$;
CREATE FUNCTION public.role_has_institution_access(check_institution_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT check_institution_id::text = ANY (string_to_array(COALESCE(current_setting('test.colleges', true), ''), ',')) $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text);
-- The columns of hr_salary_register_runs the migration reads.
CREATE TABLE public.hr_salary_register_runs (
  id uuid PRIMARY KEY, institution_id uuid NOT NULL,
  generated_by uuid, superseded_by uuid REFERENCES public.hr_salary_register_runs(id), superseded_at timestamptz,
  hr_organization_id uuid NOT NULL DEFAULT '${ORG}', period_year integer NOT NULL DEFAULT 2027,
  period_month integer NOT NULL DEFAULT 9);
-- A subset of the register line and the hand-entered days: pay, display and key
-- columns. The section (f) triggers compare whole rows, so a subset is enough.
CREATE TABLE public.hr_salary_register_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.hr_salary_register_runs(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL, serial_no integer NOT NULL, staff_name text NOT NULL, remarks text,
  bank_account_number text, is_teaching boolean NOT NULL DEFAULT true,
  adjustment_amount numeric(12,2) NOT NULL DEFAULT 0, net_pay numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hr_salary_register_manual_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id uuid NOT NULL, institution_id uuid NOT NULL,
  period_year integer NOT NULL, period_month integer NOT NULL, staff_id uuid NOT NULL,
  business_working_days numeric(5,2) NOT NULL, unpaid_leave_days numeric(5,2) NOT NULL DEFAULT 0,
  monthly_gross numeric(12,2), reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid);
-- In production HR writes these under RLS; here authenticated simply may.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_salary_register_lines, public.hr_salary_register_manual_days
  TO authenticated;
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_key text NOT NULL, scope_type text NOT NULL,
  scope_id uuid, value jsonb NOT NULL, description text, data_type text NOT NULL,
  is_system boolean DEFAULT false, is_active boolean DEFAULT true);
CREATE UNIQUE INDEX uq_platform_policies_key_scope ON public.platform_policies
  (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT EXECUTE ON FUNCTION public.test_flag(text), public.is_super_admin(), public.is_admin(uuid),
  public.user_has_permission(text), public.role_has_institution_access(uuid) TO authenticated;

INSERT INTO auth.users VALUES ('${GENERATOR}'), ('${PRINCIPAL}'), ('${ACCOUNTS}'), ('${OUTSIDER}');
INSERT INTO public.profiles VALUES ('${GENERATOR}', 'Generator Person'), ('${PRINCIPAL}', 'Priya Raman'),
  ('${ACCOUNTS}', 'Arun Kumar'), ('${OUTSIDER}', 'Someone Else');

-- Supabase's own default: every function and table created in public is granted
-- straight to anon and authenticated, separately from PUBLIC. Set LAST so it hits
-- only what the migration creates; without it a REVOKE ... FROM PUBLIC alone
-- would look safe here while leaving anon able to call the functions in production.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
`;

const CHECK_KEY = 'hr.payroll.register.check';
const SIGN_KEY = 'hr.payroll.register.sign';
const VIEW_KEY = 'hr.payroll.register.view';

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

type Caller = {
  uid: string | null;
  keys?: string[];
  colleges?: string[];
  superAdmin?: boolean;
  permNull?: boolean;
};

/**
 * Seed the run (and anything in `setup`, as the owner), then run each step as
 * `authenticated` with its own caller. Stops at the first error. Rolled back.
 */
async function scenario(
  steps: Array<{ as: Caller; sql: string }>,
  opts: { setup?: string; superseded?: 'by' | 'at' | null } = {},
) {
  await client.query('BEGIN');
  const results: Array<Record<string, unknown>[]> = [];
  let error: string | null = null;
  try {
    await client.query(
      `INSERT INTO public.hr_salary_register_runs (id, institution_id, generated_by) VALUES ($1, $2, $3), ($4, $2, $3)`,
      [RUN, COLLEGE, GENERATOR, NEWER_RUN],
    );
    if (opts.superseded === 'by') {
      await client.query(`UPDATE public.hr_salary_register_runs SET superseded_by = $1 WHERE id = $2`, [NEWER_RUN, RUN]);
    } else if (opts.superseded === 'at') {
      await client.query(`UPDATE public.hr_salary_register_runs SET superseded_at = now() WHERE id = $1`, [RUN]);
    }
    if (opts.setup) await client.query(opts.setup);
    for (const step of steps) {
      const c = step.as;
      await client.query(
        `SELECT set_config('test.uid', $1, true), set_config('test.keys', $2, true),
                set_config('test.colleges', $3, true), set_config('test.sa', $4, true),
                set_config('test.perm_null', $5, true)`,
        [c.uid ?? '', (c.keys ?? []).join(','), (c.colleges ?? [COLLEGE]).join(','),
          c.superAdmin ? 'true' : 'false', c.permNull ? 'true' : 'false'],
      );
      await client.query('SET LOCAL ROLE authenticated');
      // No RESET in a finally: after an error the transaction is aborted and the
      // RESET would replace the real message. ROLLBACK undoes SET LOCAL anyway.
      results.push((await client.query(step.sql)).rows);
      await client.query('RESET ROLE');
    }
  } catch (e) {
    error = (e as Error).message;
  }
  let rows: Record<string, unknown>[] = [];
  try {
    if (!error) {
      rows = (await client.query(
        `SELECT stage, signed_by, revoked_at IS NOT NULL AS revoked, revoke_reason
           FROM public.hr_salary_register_signoffs WHERE run_id = $1 ORDER BY (stage = 'accounts_sign'), revoked_at NULLS LAST`, [RUN])).rows;
    }
  } finally {
    await client.query('ROLLBACK');
  }
  return { results, rows, error };
}

const sign = (stage: string, run = RUN) =>
  `SELECT public.fn_hr_register_signoff('${run}', '${stage}', 'checked against the bank sheet') AS r`;
const revokeStage = (stage: string, reason = 'figures need another look') =>
  `SELECT public.fn_hr_register_signoff_revoke(
     (SELECT id FROM public.hr_salary_register_signoffs WHERE run_id = '${RUN}' AND stage = '${stage}' AND revoked_at IS NULL),
     '${reason}') AS r`;

// Signers also hold register.view in practice: it is what opens the register.
const principal: Caller = { uid: PRINCIPAL, keys: [VIEW_KEY, CHECK_KEY] };
const accounts: Caller = { uid: ACCOUNTS, keys: [VIEW_KEY, SIGN_KEY] };

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

describe('salary register sign-off — the happy path (20271007161107)', () => {
  it('a college check then an accounts sign-off by two other people are both recorded', async () => {
    const r = await scenario([{ as: principal, sql: sign('college_check') }, { as: accounts, sql: sign('accounts_sign') }]);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([
      { stage: 'college_check', signed_by: PRINCIPAL, revoked: false, revoke_reason: null },
      { stage: 'accounts_sign', signed_by: ACCOUNTS, revoked: false, revoke_reason: null },
    ]);
  });

  it('the status read names both signers from profiles and marks the caller\'s own row', async () => {
    const r = await scenario([
      { as: principal, sql: sign('college_check') },
      { as: accounts, sql: sign('accounts_sign') },
      { as: { uid: ACCOUNTS, keys: [VIEW_KEY] }, sql: `SELECT public.fn_hr_register_signoff_status('${RUN}') AS s` },
    ]);
    expect(r.error).toBeNull();
    const s = r.results[2][0].s as { stages: Record<string, Record<string, unknown>> };
    expect(s.stages.college_check).toMatchObject({ signed: true, signer_name: 'Priya Raman', is_mine: false });
    expect(s.stages.accounts_sign).toMatchObject({ signed: true, signer_name: 'Arun Kumar', is_mine: true });
  });

  it('the status read is refused without register.view for the college', async () => {
    const r = await scenario([{ as: { uid: OUTSIDER, keys: [] }, sql: `SELECT public.fn_hr_register_signoff_status('${RUN}')` }]);
    expect(r.error).toMatch(/permission to see the signatures/);
  });

  it('an unsigned run reads as two unsigned steps', async () => {
    const r = await scenario([{ as: { uid: OUTSIDER, keys: [VIEW_KEY] }, sql: `SELECT public.fn_hr_register_signoff_status('${RUN}') AS s` }]);
    expect(r.error).toBeNull();
    const s = r.results[0][0].s as { stages: Record<string, Record<string, unknown>> };
    expect(s.stages.college_check).toMatchObject({ signed: false, last_revoked_at: null });
    expect(s.stages.accounts_sign).toMatchObject({ signed: false });
  });

  it('the export switch is seeded false', async () => {
    const r = await client.query(
      `SELECT value FROM public.platform_policies WHERE policy_key = 'hr.harness.proof.register_signoff_required' AND scope_type = 'global'`);
    expect(r.rows).toEqual([{ value: false }]);
  });
});

describe('salary register sign-off — the rules', () => {
  it('the team member who generated the run cannot sign it', async () => {
    const r = await scenario([{ as: { uid: GENERATOR, keys: [CHECK_KEY] }, sql: sign('college_check') }]);
    expect(r.error).toMatch(/You generated this register/);
  });

  it('accounts sign-off is refused before the college check', async () => {
    const r = await scenario([{ as: accounts, sql: sign('accounts_sign') }]);
    expect(r.error).toMatch(/college check must be recorded before/);
  });

  it('the same person cannot record the college check and the accounts sign-off', async () => {
    const both: Caller = { uid: PRINCIPAL, keys: [CHECK_KEY, SIGN_KEY] };
    const r = await scenario([{ as: both, sql: sign('college_check') }, { as: both, sql: sign('accounts_sign') }]);
    expect(r.error).toMatch(/accounts sign-off must be by another person/);
  });

  it('a caller whose permission check answers NULL is refused', async () => {
    const r = await scenario([{ as: { uid: OUTSIDER, permNull: true }, sql: sign('college_check') }]);
    expect(r.error).toMatch(/do not have permission to record the college check/);
  });

  it('a key holder cannot sign another college\'s run', async () => {
    const r = await scenario([{ as: { uid: PRINCIPAL, keys: [CHECK_KEY], colleges: [OTHER_COLLEGE] }, sql: sign('college_check') }]);
    expect(r.error).toMatch(/do not have permission/);
  });

  it('a run replaced by a newer one (superseded_by set) cannot be signed', async () => {
    const r = await scenario([{ as: principal, sql: sign('college_check') }], { superseded: 'by' });
    expect(r.error).toMatch(/replaced by a newer one/);
  });

  it('a run replaced by a newer one (only superseded_at set) cannot be signed', async () => {
    const r = await scenario([{ as: principal, sql: sign('college_check') }], { superseded: 'at' });
    expect(r.error).toMatch(/replaced by a newer one/);
  });

  it('withdrawing the college check also withdraws the accounts sign-off', async () => {
    const r = await scenario([
      { as: principal, sql: sign('college_check') },
      { as: accounts, sql: sign('accounts_sign') },
      { as: principal, sql: revokeStage('college_check') },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([
      { stage: 'college_check', signed_by: PRINCIPAL, revoked: true, revoke_reason: 'figures need another look' },
      { stage: 'accounts_sign', signed_by: ACCOUNTS, revoked: true, revoke_reason: 'college check withdrawn' },
    ]);
  });

  it('only the signer (or a super admin) can withdraw a signature', async () => {
    const r = await scenario([
      { as: principal, sql: sign('college_check') },
      { as: { uid: OUTSIDER, keys: [VIEW_KEY, CHECK_KEY] }, sql: revokeStage('college_check') },
    ]);
    expect(r.error).toMatch(/Only the person who signed/);
  });

  it('a withdrawal needs a reason of at least 10 characters', async () => {
    const r = await scenario([
      { as: principal, sql: sign('college_check') },
      { as: principal, sql: revokeStage('college_check', 'oops') },
    ]);
    expect(r.error).toMatch(/at least 10 characters/);
  });

  it('a withdrawn step can be signed again', async () => {
    const r = await scenario([
      { as: principal, sql: sign('college_check') },
      { as: principal, sql: revokeStage('college_check') },
      { as: principal, sql: sign('college_check') },
    ]);
    expect(r.error).toBeNull();
    expect(r.rows.filter((x) => x.revoked === false)).toHaveLength(1);
  });

  it('a step already signed cannot be signed twice', async () => {
    const r = await scenario([
      { as: principal, sql: sign('college_check') },
      { as: { uid: OUTSIDER, keys: [CHECK_KEY] }, sql: sign('college_check') },
    ]);
    expect(r.error).toMatch(/already signed/);
  });

  it('a signed-out caller is refused', async () => {
    const r = await scenario([{ as: { uid: null, keys: [CHECK_KEY] }, sql: sign('college_check') }]);
    expect(r.error).toMatch(/need to be signed in/);
  });

  it('nothing can be written to the table directly', async () => {
    const r = await scenario([{
      as: { uid: PRINCIPAL, superAdmin: true },
      sql: `INSERT INTO public.hr_salary_register_signoffs (run_id, institution_id, stage, signed_by)
            VALUES ('${RUN}', '${COLLEGE}', 'college_check', '${PRINCIPAL}')`,
    }]);
    expect(r.error).toMatch(/permission denied/);
  });
});

describe('salary register sign-off — grants', () => {
  it.each([
    'public.fn_hr_register_signoff(uuid,text,text)',
    'public.fn_hr_register_signoff_revoke(uuid,text)',
    'public.fn_hr_register_signoff_status(uuid)',
  ])('anon has no EXECUTE on %s, authenticated does', async (fn) => {
    const r = await client.query(
      `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', $1, 'EXECUTE') AS authed`, [fn]);
    expect(r.rows[0]).toEqual({ anon: false, authed: true });
  });

  it('anon cannot read the table', async () => {
    const r = await client.query(
      `SELECT has_table_privilege('anon', 'public.hr_salary_register_signoffs', 'SELECT') AS anon`);
    expect(r.rows[0]).toEqual({ anon: false });
  });
});

describe('salary register sign-off — a pay change after sign-off withdraws it (section f)', () => {
  const editor: Caller = { uid: OUTSIDER, keys: [VIEW_KEY] };
  const signBoth = [{ as: principal, sql: sign('college_check') }, { as: accounts, sql: sign('accounts_sign') }];
  // The exact read the export gate makes (RegisterSignoffService.hasActiveAccountsSign).
  const gate = `SELECT count(*)::int AS active FROM public.hr_salary_register_signoffs
                 WHERE run_id = '${RUN}' AND stage = 'accounts_sign' AND revoked_at IS NULL`;
  const withLine = `INSERT INTO public.hr_salary_register_lines (id, run_id, staff_id, serial_no, staff_name, net_pay)
                    VALUES ('${LINE}', '${RUN}', '${MEMBER}', 1, 'Anitha K', 25000)`;
  const voided = [
    { stage: 'college_check', signed_by: PRINCIPAL, revoked: true, revoke_reason: 'pay changed after sign-off' },
    { stage: 'accounts_sign', signed_by: ACCOUNTS, revoked: true, revoke_reason: 'pay changed after sign-off' },
  ];
  const kept = [
    { stage: 'college_check', signed_by: PRINCIPAL, revoked: false, revoke_reason: null },
    { stage: 'accounts_sign', signed_by: ACCOUNTS, revoked: false, revoke_reason: null },
  ];

  it('(a) an adjustment after sign-off withdraws both steps, and the export gate then finds no accounts sign-off', async () => {
    const r = await scenario([
      ...signBoth,
      { as: editor, sql: `UPDATE public.hr_salary_register_lines SET adjustment_amount = -500, net_pay = 24500 WHERE id = '${LINE}'` },
      { as: accounts, sql: gate },
    ], { setup: withLine });
    expect(r.error).toBeNull();
    expect(r.rows).toEqual(voided);
    expect(r.results[3]).toEqual([{ active: 0 }]);
  });

  it('(a) the change itself is not blocked, and the register can be signed again', async () => {
    const r = await scenario([
      ...signBoth,
      { as: editor, sql: `UPDATE public.hr_salary_register_lines SET net_pay = 26000 WHERE id = '${LINE}' RETURNING net_pay::text` },
      ...signBoth,
    ], { setup: withLine });
    expect(r.error).toBeNull();
    expect(r.results[2]).toEqual([{ net_pay: '26000.00' }]);
    expect(r.rows.filter((x) => x.revoked === false)).toHaveLength(2);
  });

  it('(a) a bank account, a category move, a line added or a line removed counts as pay', async () => {
    for (const sql of [
      `UPDATE public.hr_salary_register_lines SET bank_account_number = '0099' WHERE id = '${LINE}'`,
      `UPDATE public.hr_salary_register_lines SET is_teaching = false WHERE id = '${LINE}'`,
      `INSERT INTO public.hr_salary_register_lines (run_id, staff_id, serial_no, staff_name) VALUES ('${RUN}', '${OTHER_MEMBER}', 2, 'Ravi M')`,
      `DELETE FROM public.hr_salary_register_lines WHERE id = '${LINE}'`,
    ]) {
      const r = await scenario([...signBoth, { as: editor, sql }], { setup: withLine });
      expect(r.error, sql).toBeNull();
      expect(r.rows, sql).toEqual(voided);
    }
  });

  it('(b) a display-only touch (serial number, remarks, a name snapshot, updated_at) keeps both signatures', async () => {
    const r = await scenario([
      ...signBoth,
      { as: editor, sql: `UPDATE public.hr_salary_register_lines
                             SET serial_no = 7, remarks = 'checked', staff_name = 'Anitha K.', updated_at = now() + interval '1 hour'
                           WHERE id = '${LINE}'` },
      { as: accounts, sql: gate },
    ], { setup: withLine });
    expect(r.error).toBeNull();
    expect(r.rows).toEqual(kept);
    expect(r.results[3]).toEqual([{ active: 1 }]);
  });

  it('(b) a pay change on ANOTHER run leaves this run signed', async () => {
    const r = await scenario([
      ...signBoth,
      { as: editor, sql: `INSERT INTO public.hr_salary_register_lines (run_id, staff_id, serial_no, staff_name, net_pay)
                           VALUES ('${NEWER_RUN}', '${MEMBER}', 1, 'Anitha K', 1)` },
    ], { setup: withLine });
    expect(r.error).toBeNull();
    expect(r.rows).toEqual(kept);
  });

  it('(c) hand-entered days changed for a person on the run withdraw both steps', async () => {
    const days = `INSERT INTO public.hr_salary_register_manual_days
                    (hr_organization_id, institution_id, period_year, period_month, staff_id, business_working_days, reason)
                  VALUES ('${ORG}', '${COLLEGE}', 2027, 9, '${MEMBER}', 26, 'no biometric record')`;
    const r = await scenario([
      ...signBoth,
      { as: editor, sql: `UPDATE public.hr_salary_register_manual_days SET unpaid_leave_days = 2 WHERE staff_id = '${MEMBER}'` },
      { as: accounts, sql: gate },
    ], { setup: `${withLine}; ${days}` });
    expect(r.error).toBeNull();
    expect(r.rows).toEqual(voided);
    expect(r.results[3]).toEqual([{ active: 0 }]);
  });

  it('(c) a new hand entry for a person on the run withdraws both steps', async () => {
    const r = await scenario([
      ...signBoth,
      { as: editor, sql: `INSERT INTO public.hr_salary_register_manual_days
                             (hr_organization_id, institution_id, period_year, period_month, staff_id, business_working_days, reason)
                           VALUES ('${ORG}', '${COLLEGE}', 2027, 9, '${MEMBER}', 26, 'no biometric record')` },
    ], { setup: withLine });
    expect(r.error).toBeNull();
    expect(r.rows).toEqual(voided);
  });

  it('(c) only who/why changing on a hand entry, or an entry for another month or person, keeps the signatures', async () => {
    const days = `INSERT INTO public.hr_salary_register_manual_days
                    (hr_organization_id, institution_id, period_year, period_month, staff_id, business_working_days, reason)
                  VALUES ('${ORG}', '${COLLEGE}', 2027, 9, '${MEMBER}', 26, 'no biometric record')`;
    const r = await scenario([
      ...signBoth,
      { as: editor, sql: `UPDATE public.hr_salary_register_manual_days SET reason = 'no biometric record (rechecked)', updated_by = '${OUTSIDER}' WHERE staff_id = '${MEMBER}'` },
      { as: editor, sql: `INSERT INTO public.hr_salary_register_manual_days
                             (hr_organization_id, institution_id, period_year, period_month, staff_id, business_working_days, reason)
                           VALUES ('${ORG}', '${COLLEGE}', 2027, 8, '${MEMBER}', 26, 'last month'),
                                  ('${ORG}', '${COLLEGE}', 2027, 9, '${OTHER_MEMBER}', 26, 'not on this run')` },
    ], { setup: `${withLine}; ${days}` });
    expect(r.error).toBeNull();
    expect(r.rows).toEqual(kept);
  });

  it('removing a signed run still works', async () => {
    await client.query('BEGIN');
    try {
      await client.query(`INSERT INTO public.hr_salary_register_runs (id, institution_id, generated_by) VALUES ($1, $2, $3)`, [RUN, COLLEGE, GENERATOR]);
      await client.query(withLine);
      await client.query(`INSERT INTO public.hr_salary_register_signoffs (run_id, institution_id, stage, signed_by) VALUES ($1, $2, 'college_check', $3)`, [RUN, COLLEGE, PRINCIPAL]);
      await client.query(`DELETE FROM public.hr_salary_register_runs WHERE id = $1`, [RUN]);
      const left = await client.query(`SELECT count(*)::int AS n FROM public.hr_salary_register_signoffs WHERE run_id = $1`, [RUN]);
      expect(left.rows[0]).toEqual({ n: 0 });
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('neither trigger function is callable by anon or PUBLIC', async () => {
    const r = await client.query(`
      SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             p.prosecdef AS definer, p.proconfig::text AS config
        FROM pg_proc p
       WHERE p.proname IN ('fn_hr_register_signoff_void_on_line_change', 'fn_hr_register_signoff_void_on_manual_days_change')
       ORDER BY p.proname`);
    expect(r.rows).toEqual([
      { proname: 'fn_hr_register_signoff_void_on_line_change', anon: false, definer: true, config: '{search_path=public}' },
      { proname: 'fn_hr_register_signoff_void_on_manual_days_change', anon: false, definer: true, config: '{search_path=public}' },
    ]);
  });
});
