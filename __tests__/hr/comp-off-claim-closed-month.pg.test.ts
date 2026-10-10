/**
 * Behavioural proof for
 * supabase/migrations/20271009100000_hr_comp_off_claims_after_month_close.sql
 *
 * A compensatory-off credit is valid for one month from the day worked, but HR
 * can close that day's attendance month inside the window. The lock guard used
 * to refuse every write to a credit in a closed month, so a day worked on 27 Sep
 * could not be claimed once September was closed. A claim is entitlement, not an
 * edit of the frozen month, so its life (raise, decide, withdraw, revoke) is now
 * allowed there; deleting a credit, editing the worked day and HR-written
 * credits stay refused.
 *
 * The migration is applied VERBATIM with psql onto a throwaway database; the
 * guard trigger and the tables it reads are stand-ins for production's.
 * fn_hr_comp_off_revoke_block_reason leans on production helpers that are not
 * stubbed here, so its closed-month branch was proven against the live database.
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20271009100000_hr_comp_off_claims_after_month_close.sql');
const PGHOST = process.env.HCOC_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HCOC_TEST_PGPORT ?? '5432';
const PGUSER = process.env.HCOC_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `hcoc_lock_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const INST = '00000000-0000-4000-8000-0000000000a1';
const EMP = '00000000-0000-4000-8000-0000000000b1';
const CLAIM = '00000000-0000-4000-8000-0000000000c1';
const ORG = '00000000-0000-4000-8000-0000000000d1';

// September 2026 is closed; October is open.
const LOCKED_DAY = '2026-09-27';
const OPEN_DAY = '2026-10-02';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE TABLE public.staff (id uuid PRIMARY KEY, institution_id uuid);
CREATE TABLE public.hr_attendance_periods (
  institution_id uuid, period_year int, period_month int, status text, locked_at timestamptz);
CREATE TABLE public.hr_comp_off_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL, hr_organization_id uuid,
  worked_date date NOT NULL, expires_on date NOT NULL, credit_days numeric NOT NULL DEFAULT 1,
  status varchar NOT NULL, source varchar NOT NULL DEFAULT 'claim',
  rejection_reason text, approved_at timestamptz, revoke_reason text);
INSERT INTO public.staff VALUES ('${EMP}', '${INST}');
INSERT INTO public.hr_attendance_periods VALUES ('${INST}', 2026, 9, 'locked', '2026-10-07 10:00+00');
INSERT INTO public.hr_attendance_periods VALUES ('${INST}', 2026, 10, 'open', NULL);
`;

// The trigger definition from 20260827200000, which this migration does not re-issue.
const TRIGGER = `
CREATE TRIGGER trg_hcoc_block_locked_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_comp_off_claim_in_locked_period();
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

/** Seed one credit (as the owner, guard bypassed), run `sql`, report the row; always rolled back. */
async function run(
  sql: string,
  seed: { status?: string; source?: string; workedDate?: string; expiresOn?: string } = {},
) {
  await client.query('BEGIN');
  try {
    await client.query('ALTER TABLE public.hr_comp_off_credits DISABLE TRIGGER trg_hcoc_block_locked_period');
    await client.query(
      `INSERT INTO public.hr_comp_off_credits (id, employee_id, hr_organization_id, worked_date, expires_on, status, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [CLAIM, EMP, ORG, seed.workedDate ?? LOCKED_DAY, seed.expiresOn ?? '2026-10-27', seed.status ?? 'pending', seed.source ?? 'claim'],
    );
    await client.query('ALTER TABLE public.hr_comp_off_credits ENABLE TRIGGER trg_hcoc_block_locked_period');
    const r = await client.query(sql);
    const row = await client.query('SELECT status FROM public.hr_comp_off_credits WHERE id = $1', [CLAIM]);
    return { result: r, status: row.rows[0]?.status as string | undefined, error: null as string | null };
  } catch (e) {
    return { result: null, status: undefined, error: (e as Error).message };
  } finally {
    await client.query('ROLLBACK');
  }
}

const insertCredit = (workedDate: string, status: string, source: string) =>
  `INSERT INTO public.hr_comp_off_credits (employee_id, hr_organization_id, worked_date, expires_on, status, source)
   VALUES ('${EMP}', '${ORG}', '${workedDate}', '2026-10-27', '${status}', '${source}')`;
const setStatus = (status: string) =>
  `UPDATE public.hr_comp_off_credits SET status = '${status}' WHERE id = '${CLAIM}'`;

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  psql(['-d', DBNAME, '-c', TRIGGER]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
});
afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('comp-off credits in a closed attendance month (20271009100000)', () => {
  it('a claim can be raised for a day in the closed month', async () => {
    const r = await run(insertCredit('2026-09-26', 'pending', 'claim'));
    expect(r.error).toBeNull();
  });

  it('a pending claim can be approved, rejected and withdrawn', async () => {
    for (const to of ['approved', 'rejected', 'withdrawn']) {
      const r = await run(setStatus(to));
      expect(r.error).toBeNull();
      expect(r.status).toBe(to);
    }
  });

  it('an approved, unspent claim can be revoked', async () => {
    const r = await run(setStatus('rejected'), { status: 'approved' });
    expect(r.error).toBeNull();
    expect(r.status).toBe('rejected');
  });

  it('spending and returning a credit still works (the consume toggle)', async () => {
    expect((await run(setStatus('consumed'), { status: 'approved' })).error).toBeNull();
    expect((await run(setStatus('approved'), { status: 'consumed' })).error).toBeNull();
  });

  it('a credit written by HR cannot be added to the closed month', async () => {
    const r = await run(insertCredit('2026-09-26', 'pending', 'hr_grant'));
    expect(r.error).toMatch(/Attendance for 2026-09 is closed/);
  });

  it('a claim cannot be inserted already decided', async () => {
    const r = await run(insertCredit('2026-09-26', 'approved', 'claim'));
    expect(r.error).toMatch(/Attendance for 2026-09 is closed/);
  });

  it('the worked day cannot be moved or the credit size changed', async () => {
    const moved = await run(`UPDATE public.hr_comp_off_credits SET worked_date = '2026-09-26' WHERE id = '${CLAIM}'`);
    expect(moved.error).toMatch(/is closed/);
    const resized = await run(`UPDATE public.hr_comp_off_credits SET credit_days = 2 WHERE id = '${CLAIM}'`);
    expect(resized.error).toMatch(/is closed/);
  });

  it('a decided claim cannot be flipped to another state, and a credit cannot be deleted', async () => {
    const flip = await run(setStatus('approved'), { status: 'rejected' });
    expect(flip.error).toMatch(/is closed/);
    const del = await run(`DELETE FROM public.hr_comp_off_credits WHERE id = '${CLAIM}'`);
    expect(del.error).toMatch(/is closed/);
  });

  it('non-vacuity: a day in the OPEN month is unaffected by all of this', async () => {
    const r = await run(setStatus('approved'), { workedDate: OPEN_DAY, expiresOn: '2026-11-02' });
    expect(r.error).toBeNull();
    const del = await run(`DELETE FROM public.hr_comp_off_credits WHERE id = '${CLAIM}'`, { workedDate: OPEN_DAY });
    expect(del.error).toBeNull();
  });

  it('the nightly auto-reject now reaches an expired pending claim in the closed month', async () => {
    const r = await run(`SELECT public.fn_hr_comp_off_reject_expired_claims() AS n`, {
      workedDate: LOCKED_DAY, expiresOn: '2000-01-01',
    });
    expect(r.error).toBeNull();
    expect(r.result?.rows[0]).toEqual({ n: 1 });
    expect(r.status).toBe('rejected');
  });

  it('the auto-reject function is not executable by signed-in or signed-out callers', async () => {
    const r = await client.query(`SELECT
      has_function_privilege('authenticated', 'public.fn_hr_comp_off_reject_expired_claims()', 'EXECUTE') AS auth,
      has_function_privilege('anon', 'public.fn_hr_comp_off_reject_expired_claims()', 'EXECUTE') AS anon`);
    expect(r.rows[0]).toEqual({ auth: false, anon: false });
  });
});
