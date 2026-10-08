/**
 * Behavioural proof for supabase/migrations/20271008110108_hr_memo_detector_ledgers_super_admin_read.sql
 * (follow-up to the #4151 deep review, finding 3).
 *
 * 20270613101223 let any admin (`is_super_admin() OR is_admin()`, no college
 * scope) read hr_memo_detector_runs and hr_memo_nudges — team member ids, memo
 * ids and recipients for every college — while hr_memos itself is super-admin
 * only. Both migrations are applied VERBATIM with psql onto a throwaway
 * database, the tables are read as `authenticated` with the helper answers a
 * college admin / a super admin / a learner would get.
 *
 * Skips cleanly when no PostgreSQL is reachable; never skips when any
 * *_TEST_PGUSER is set (the Postgres-service CI job).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const BASE = path.join(REPO, 'supabase/migrations/20270613101223_hr_memo_detector_schedule_disabled_with_dry_run.sql');
const FIX = path.join(REPO, 'supabase/migrations/20271008110108_hr_memo_detector_ledgers_super_admin_read.sql');
const PGHOST = process.env.HR_MEMO_LEDGER_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HR_MEMO_LEDGER_TEST_PGPORT ?? '5432';
const PGUSER =
  process.env.HR_MEMO_LEDGER_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `hr_memo_ledger_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Stand-ins for the production helpers, answering from test settings.
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.super', true), '') = 'on' $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_super_admin() OR coalesce(current_setting('test.admin', true), '') = 'on' $$;
GRANT EXECUTE ON FUNCTION public.is_super_admin(), public.is_admin() TO authenticated;
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TABLE public.hr_memos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL,
  triggered_by_event_id uuid);
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_key text NOT NULL, scope_type text NOT NULL,
  scope_id uuid, value jsonb NOT NULL, description text, data_type text, classification text,
  ui_category text, is_system boolean, is_active boolean, publication_state text,
  updated_at timestamptz DEFAULT now());
CREATE TABLE public.ai_routine_schedules (
  routine_id text PRIMARY KEY, enabled boolean NOT NULL, days_of_week smallint[], minute_of_day integer,
  managed boolean, updated_at timestamptz DEFAULT now());
`;

const SEED = `
INSERT INTO public.hr_memos (id, staff_id) VALUES ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid());
INSERT INTO public.hr_memo_detector_runs (run_id, mode, details)
  VALUES (gen_random_uuid(), 'dry_run', '{"memos":[{"staff_id":"x"}]}');
INSERT INTO public.hr_memo_nudges (memo_id, nudge_kind, status)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'staff_reminder', 'sent');
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const POSTGRES_REQUIRED = Object.keys(process.env).some((k) => k.endsWith('_TEST_PGUSER'));
function postgresReachable(): boolean {
  try {
    execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', 'postgres', '-tAc', 'SELECT 1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
    });
    return true;
  } catch {
    return false;
  }
}
const PG_READY = POSTGRES_REQUIRED || postgresReachable();
if (!PG_READY) {
  console.warn(`[memo-detector-ledgers-rls.pg] no PostgreSQL at ${PGHOST}:${PGPORT} (or no psql) — skipping this file`);
}

let client: Client;

type Who = 'college_admin' | 'super_admin' | 'learner';
/** Count rows of both ledgers as `who`, inside a transaction that is always rolled back. */
async function counts(who: Who): Promise<{ runs: number; nudges: number }> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('test.super', $1, true), set_config('test.admin', $2, true)`, [
      who === 'super_admin' ? 'on' : 'off',
      who === 'college_admin' ? 'on' : 'off',
    ]);
    await client.query('SET LOCAL ROLE authenticated');
    const r = await client.query(
      `SELECT (SELECT count(*) FROM public.hr_memo_detector_runs)::int AS runs,
              (SELECT count(*) FROM public.hr_memo_nudges)::int AS nudges`,
    );
    return r.rows[0] as { runs: number; nudges: number };
  } finally {
    await client.query('ROLLBACK');
  }
}

beforeAll(async () => {
  if (!PG_READY) return;
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e) {
    throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`);
  }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', BASE]);
  psql(['-d', DBNAME, '-c', SEED]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
});
afterAll(async () => {
  if (!PG_READY) return;
  await client?.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]);
  } catch {
    /* best effort */
  }
});

describe.skipIf(!PG_READY)('hr memo detector ledgers are super-admin-only (20271008110108)', () => {
  it('non-vacuity: under 20270613101223 alone a college admin reads every row', async () => {
    expect(await counts('college_admin')).toEqual({ runs: 1, nudges: 1 });
  });

  it('after the fix a college admin reads nothing, a super admin reads everything, a learner nothing', async () => {
    psql(['-d', DBNAME, '-f', FIX]);
    expect(await counts('college_admin')).toEqual({ runs: 0, nudges: 0 });
    expect(await counts('super_admin')).toEqual({ runs: 1, nudges: 1 });
    expect(await counts('learner')).toEqual({ runs: 0, nudges: 0 });
  });

  it('applies again cleanly (idempotent) and its guard passes', () => {
    expect(() => psql(['-d', DBNAME, '-f', FIX])).not.toThrow();
  });

  it("the guard refuses an admin clause put back", () => {
    psql(['-d', DBNAME, '-c',
      `ALTER POLICY hr_memo_nudges_select ON public.hr_memo_nudges USING ((SELECT public.is_super_admin()) OR (SELECT public.is_admin()))`]);
    // Re-running the fix repairs it; running only its guard must refuse the broken state.
    const guard = /DO \$\$[\s\S]*END \$\$;/.exec(readFileSync(FIX, 'utf8'))![0];
    expect(() => psql(['-d', DBNAME, '-c', guard])).toThrow(/super admins only/);
    psql(['-d', DBNAME, '-f', FIX]);
    expect(() => psql(['-d', DBNAME, '-c', guard])).not.toThrow();
  });

  it('#4259 finding 5: the guard counts policies PER TABLE (2 on one ledger, 0 on the other is refused)', () => {
    const guard = /DO \$\$[\s\S]*END \$\$;/.exec(readFileSync(FIX, 'utf8'))![0];
    psql(['-d', DBNAME, '-c', `
      CREATE POLICY hr_memo_nudges_select_extra ON public.hr_memo_nudges FOR SELECT TO authenticated
        USING ((SELECT public.is_super_admin()));
      DROP POLICY hr_memo_detector_runs_select ON public.hr_memo_detector_runs;`]);
    // Two policies in total, both super-admin-only: a total-count guard passes this.
    expect(() => psql(['-d', DBNAME, '-c', guard])).toThrow(/exactly one policy on each/);
    psql(['-d', DBNAME, '-c', `
      DROP POLICY hr_memo_nudges_select_extra ON public.hr_memo_nudges;
      CREATE POLICY hr_memo_detector_runs_select ON public.hr_memo_detector_runs FOR SELECT TO authenticated
        USING ((SELECT public.is_super_admin()));`]);
    expect(() => psql(['-d', DBNAME, '-c', guard])).not.toThrow();
  });

  it('#4259 finding 1: only ONE memo can name a triggering event; manual memos (no event) never collide', () => {
    const ev = randomUUID();
    psql(['-d', DBNAME, '-c', `INSERT INTO public.hr_memos (staff_id, triggered_by_event_id) VALUES (gen_random_uuid(), '${ev}')`]);
    expect(() =>
      psql(['-d', DBNAME, '-c', `INSERT INTO public.hr_memos (staff_id, triggered_by_event_id) VALUES (gen_random_uuid(), '${ev}')`]),
    ).toThrow(/ux_hr_memos_triggered_by_event|duplicate key/);
    expect(() =>
      psql(['-d', DBNAME, '-c', `INSERT INTO public.hr_memos (staff_id) VALUES (gen_random_uuid()), (gen_random_uuid())`]),
    ).not.toThrow();
  });

  it('#4259 finding 1: the guard refuses a database without the one-memo-per-event index', () => {
    const guard = /DO \$\$[\s\S]*END \$\$;/.exec(readFileSync(FIX, 'utf8'))![0];
    psql(['-d', DBNAME, '-c', 'DROP INDEX public.ux_hr_memos_triggered_by_event']);
    expect(() => psql(['-d', DBNAME, '-c', guard])).toThrow(/one memo per triggering event/);
    psql(['-d', DBNAME, '-f', FIX]);
    expect(() => psql(['-d', DBNAME, '-c', guard])).not.toThrow();
  });
});
