/**
 * Behavioural proof for supabase/migrations/20270602090000_hr_comp_off_record_decider.sql
 * (BUG-006231 — "don't know who gives the comments").
 *
 * decideClaim never wrote approved_by, so no comp-off decision named its
 * decider. The migration makes the database stamp it (trg_hcoc_stamp_decider)
 * and returns the name to the claimant through hr_comp_off_balance.
 *
 * The file is applied VERBATIM with psql onto a throwaway database — its own
 * DO-block asserts run too — and the table is updated as `authenticated` with
 * auth.uid() answered from a test setting.
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270602090000_hr_comp_off_record_decider.sql');
const PGHOST = process.env.HCOC_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HCOC_TEST_PGPORT ?? '5432';
const PGUSER = process.env.HCOC_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `hcoc_dec_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const APPROVER = '00000000-0000-4000-8000-00000000d001';
const FORGED = '00000000-0000-4000-8000-00000000d002';
const REVOKER = '00000000-0000-4000-8000-00000000d003';
const CLAIMANT = '00000000-0000-4000-8000-00000000d010';
const CLAIM = '00000000-0000-4000-8000-00000000d020';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
-- Stand-ins for the production helpers hr_comp_off_balance calls.
CREATE FUNCTION public.fn_my_staff_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT string_to_array(nullif(current_setting('test.members', true), ''), ',')::uuid[] $$;
CREATE FUNCTION public.fn_my_hr_organization_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$ SELECT '{}'::uuid[] $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.user_has_permission(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text);
-- Production's decision columns (information_schema, 2026-09-30).
CREATE TABLE public.hr_comp_off_credits (
  id uuid PRIMARY KEY, employee_id uuid NOT NULL, hr_organization_id uuid,
  worked_date date NOT NULL, expires_on date NOT NULL, credit_days numeric NOT NULL DEFAULT 1,
  status varchar NOT NULL, source varchar NOT NULL DEFAULT 'claim',
  notes text, rejection_reason text, work_location text, work_place text,
  approved_by uuid, approved_at timestamptz,
  revoked_by uuid, revoked_at timestamptz, revoke_reason text);
-- trg_hcoc_revoke_gate's stamp, as live (the block-reason check left out).
CREATE FUNCTION public.hr_trig_comp_off_revoke_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.revoked_at := COALESCE(NEW.revoked_at, now());
  NEW.revoked_by := COALESCE(NEW.revoked_by, (SELECT auth.uid()));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hcoc_revoke_gate BEFORE UPDATE ON public.hr_comp_off_credits FOR EACH ROW
  WHEN (OLD.status = 'approved' AND NEW.status = 'rejected') EXECUTE FUNCTION public.hr_trig_comp_off_revoke_gate();
GRANT SELECT, UPDATE ON public.hr_comp_off_credits TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_my_staff_ids(), public.fn_my_hr_organization_ids(),
  public.is_super_admin(), public.user_has_permission(text) TO authenticated;
INSERT INTO public.profiles VALUES ('${APPROVER}', 'Priya Raman'), ('${FORGED}', 'Someone Else'), ('${REVOKER}', 'Arun Kumar');
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

/**
 * Seed one claim in `status` (as the owner), then run `sql` as `authenticated`
 * with auth.uid() = `uid` (none = the service role / pg_cron). Always rolled back.
 */
async function as(
  uid: string | null,
  sql: string,
  opts: { status?: string; approvedBy?: string | null; setup?: string; members?: string } = {},
) {
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO public.hr_comp_off_credits (id, employee_id, worked_date, expires_on, status, approved_by, rejection_reason)
       VALUES ($1, $2, CURRENT_DATE - 5, CURRENT_DATE + 25, $3, $4, NULL)`,
      [CLAIM, CLAIMANT, opts.status ?? 'pending', opts.approvedBy ?? null],
    );
    if (opts.setup) await client.query(opts.setup);
    await client.query(`SELECT set_config('test.uid', $1, true), set_config('test.members', $2, true)`,
      [uid ?? '', opts.members ?? '']);
    await client.query('SET LOCAL ROLE authenticated');
    const r = await client.query(sql);
    await client.query('RESET ROLE');
    const row = await client.query('SELECT status, approved_by, revoked_by FROM public.hr_comp_off_credits WHERE id = $1', [CLAIM]);
    return { rows: r.rows, row: row.rows[0], error: null as string | null };
  } catch (e) {
    return { rows: [] as Record<string, unknown>[], row: undefined, error: (e as Error).message };
  } finally {
    await client.query('ROLLBACK');
  }
}

const decide = (status: string, extra = '') =>
  `UPDATE public.hr_comp_off_credits SET status = '${status}', approved_at = now()${extra} WHERE id = '${CLAIM}'`;

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
});
afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('hr_comp_off_credits — the decider is recorded by the database (20270602090000)', () => {
  it('a rejection records the signed-in approver, overriding a forged approved_by', async () => {
    const r = await as(APPROVER, decide('rejected', `, rejection_reason = 'No biometric', approved_by = '${FORGED}'`));
    expect(r.error).toBeNull();
    expect(r.row).toMatchObject({ status: 'rejected', approved_by: APPROVER });
  });

  it('an approval records the signed-in approver', async () => {
    const r = await as(APPROVER, decide('approved'));
    expect(r.row).toMatchObject({ status: 'approved', approved_by: APPROVER });
  });

  it('non-vacuity: without the trigger the forged approved_by is kept', async () => {
    const r = await as(APPROVER, decide('rejected', `, approved_by = '${FORGED}'`),
      { setup: 'DROP TRIGGER trg_hcoc_stamp_decider ON public.hr_comp_off_credits' });
    expect(r.row).toMatchObject({ approved_by: FORGED });
  });

  it('approved_by cannot be rewritten after the decision', async () => {
    const r = await as(FORGED, `UPDATE public.hr_comp_off_credits SET approved_by = '${FORGED}' WHERE id = '${CLAIM}'`,
      { status: 'approved', approvedBy: APPROVER });
    expect(r.row).toMatchObject({ approved_by: APPROVER });
  });

  it('a revoke keeps the approver and stamps the revoker separately', async () => {
    const r = await as(REVOKER, decide('rejected', `, rejection_reason = 'Worked day not verified', revoke_reason = 'Worked day not verified'`),
      { status: 'approved', approvedBy: APPROVER });
    expect(r.row).toMatchObject({ status: 'rejected', approved_by: APPROVER, revoked_by: REVOKER });
  });

  it('with no signed-in user (the nightly auto-reject) nothing is stamped', async () => {
    const r = await as(null, decide('rejected', `, rejection_reason = 'Auto-rejected'`));
    expect(r.error).toBeNull();
    expect(r.row).toMatchObject({ status: 'rejected', approved_by: null });
  });

  it('the trigger function is not executable by signed-in or signed-out callers', async () => {
    const r = await client.query(`SELECT
      has_function_privilege('authenticated', 'public.hr_trig_comp_off_stamp_decider()', 'EXECUTE') AS auth,
      has_function_privilege('anon', 'public.hr_trig_comp_off_stamp_decider()', 'EXECUTE') AS anon`);
    expect(r.rows[0]).toEqual({ auth: false, anon: false });
  });

  it('hr_comp_off_balance is locked to signed-in callers', async () => {
    const r = await client.query(`SELECT
      has_function_privilege('authenticated', 'public.hr_comp_off_balance(uuid)', 'EXECUTE') AS auth,
      has_function_privilege('anon', 'public.hr_comp_off_balance(uuid)', 'EXECUTE') AS anon`);
    expect(r.rows[0]).toEqual({ auth: true, anon: false });
  });
});

describe('hr_comp_off_balance — the claimant sees who decided (20270602090000)', () => {
  const balance = `SELECT c->>'decided_by_name' AS by, c->>'rejection_reason' AS reason
                   FROM jsonb_array_elements(public.hr_comp_off_balance(NULL)->'credits') c`;

  it('a refused claim comes back with the decider name and the whole reason', async () => {
    const r = await as(CLAIMANT, balance, {
      status: 'rejected', approvedBy: APPROVER, members: CLAIMANT,
      setup: `UPDATE public.hr_comp_off_credits SET rejection_reason = 'UPLOAD BIOMETRIC REPORT. Punch missing.' WHERE id = '${CLAIM}'`,
    });
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ by: 'Priya Raman', reason: 'UPLOAD BIOMETRIC REPORT. Punch missing.' }]);
  });

  it('a revoked claim names the revoker, not the first approver', async () => {
    const r = await as(CLAIMANT, balance, {
      status: 'rejected', approvedBy: APPROVER, members: CLAIMANT,
      setup: `UPDATE public.hr_comp_off_credits SET revoked_by = '${REVOKER}' WHERE id = '${CLAIM}'`,
    });
    expect(r.rows[0]).toMatchObject({ by: 'Arun Kumar' });
  });

  it('an older decision with no decider recorded comes back with no name', async () => {
    const r = await as(CLAIMANT, balance, { status: 'rejected', members: CLAIMANT });
    expect(r.rows).toEqual([{ by: null, reason: null }]);
  });
});
