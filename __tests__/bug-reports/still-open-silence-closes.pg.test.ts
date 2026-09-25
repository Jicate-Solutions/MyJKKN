/**
 * A "is this still happening?" prompt left unanswered for its full 14 days
 * closes its report — behavioural proof for
 * supabase/migrations/20270329090000_bug_still_open_silence_closes.sql
 * (Director ruling 4, 18 Sep 2026).
 *
 * The migration file is applied VERBATIM with psql onto a throwaway database
 * that carries the production columns and CHECK constraints of bug_reports and
 * bug_fix_feedback_requests, plus production's fn_bug_reports_enforce_resolved_by
 * trigger (a resolve without a resolver is refused). The sweep is then called
 * the way the notification cron calls it: as the service role (auth.uid() null).
 *
 * NON-VACUITY: with the migration file emptied, every test fails (the function
 * does not exist), and the "closes" test is the only one that can pass only by
 * the sweep resolving a report.
 *
 * REQUIRES a local PostgreSQL 16 and refuses to skip silently without one
 * (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml):
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/bug-reports/still-open-silence-closes.pg.test.ts
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270329090000_bug_still_open_silence_closes.sql');

const PGHOST = process.env.STILLOPEN_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.STILLOPEN_TEST_PGPORT ?? '5432';
const PGUSER =
  process.env.STILLOPEN_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `still_open_close_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

CREATE SCHEMA IF NOT EXISTS auth;
-- null = the service role (the cron); a uuid = a signed-in user.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid;
$$;

CREATE TABLE public.bug_reports (
  id uuid PRIMARY KEY,
  display_id varchar,
  status text NOT NULL DEFAULT 'new',
  resolved_at timestamptz,
  resolved_by uuid,
  reopened_at timestamptz,
  metadata jsonb,
  updated_at timestamptz DEFAULT now()
);

-- production body, 25 Sep 2026
CREATE FUNCTION public.fn_bug_reports_enforce_resolved_by() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.status = 'resolved' THEN
    IF NEW.resolved_by IS NULL AND TG_OP = 'UPDATE' AND OLD.status = 'resolved' THEN
      NEW.resolved_by := OLD.resolved_by;
    END IF;
    IF NEW.resolved_by IS NULL THEN
      RAISE EXCEPTION 'bug_reports.resolved_by is required when status = resolved (bug %)',
        COALESCE(NEW.display_id, NEW.id::text) USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NEW.resolved_by := NULL;
  END IF;
  RETURN NEW;
END;
$f$;
CREATE TRIGGER trg_bug_reports_resolved_by BEFORE INSERT OR UPDATE OF status, resolved_by
  ON public.bug_reports FOR EACH ROW EXECUTE FUNCTION public.fn_bug_reports_enforce_resolved_by();

CREATE TABLE public.bug_fix_feedback_requests (
  id uuid PRIMARY KEY,
  cluster_id uuid,
  bug_id uuid NOT NULL REFERENCES public.bug_reports(id),
  reporter_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['fix_check','still_open'])),
  status text NOT NULL CHECK (status = ANY (ARRAY['pending_send','sent','delivered','answered','expired','dropped'])),
  answer text CHECK (answer = ANY (ARRAY['fixed','not_fixed'])),
  sent_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  CHECK (((kind = 'fix_check') AND (cluster_id IS NOT NULL)) OR ((kind = 'still_open') AND (cluster_id IS NULL)))
);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;
const REPORTER = '00000000-0000-4000-8000-0000000000aa';
const EARLIER_RESOLVER = '00000000-0000-4000-8000-0000000000bb';
const CLUSTER = '00000000-0000-4000-8000-0000000000cc';

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await client.query(sql, params)).rows as T[];
}

async function bug(status: string, extra: { reopenedDaysAgo?: number; resolvedBy?: string } = {}) {
  const id = randomUUID();
  await q(
    `INSERT INTO public.bug_reports (id, display_id, status, resolved_by, resolved_at, reopened_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() - make_interval(days => $6::int) END)`,
    [id, `BUG-${id.slice(0, 6)}`, status, extra.resolvedBy ?? null, extra.resolvedBy ? new Date() : null, extra.reopenedDaysAgo ?? null]
  );
  return id;
}

/** A prompt sent `sentDaysAgo` days ago that expires `expiresInDays` from now (negative = already expired). */
async function prompt(
  bugId: string,
  o: { kind?: string; status?: string; answer?: string | null; sentDaysAgo?: number; expiresInDays: number }
) {
  const id = randomUUID();
  const kind = o.kind ?? 'still_open';
  await q(
    `INSERT INTO public.bug_fix_feedback_requests
       (id, cluster_id, bug_id, reporter_user_id, kind, status, answer, sent_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             now() - make_interval(days => $8::int), now() + make_interval(days => $9::int))`,
    [id, kind === 'fix_check' ? CLUSTER : null, bugId, REPORTER, kind, o.status ?? 'delivered', o.answer ?? null, o.sentDaysAgo ?? 15, o.expiresInDays]
  );
  return id;
}

async function sweep(asUser: string | null = null) {
  await q(`SELECT set_config('test.uid', $1, false)`, [asUser ?? '']);
  const [row] = await q<{ r: { success: boolean; expired?: number; closed?: number; error?: string } }>(
    `SELECT public.fn_bug_still_open_expire() AS r`
  );
  await q(`SELECT set_config('test.uid', '', false)`);
  return row.r;
}

const bugRow = async (id: string) =>
  (await q<{ status: string; resolved_by: string | null; metadata: Record<string, string> | null }>(
    `SELECT status, resolved_by, metadata FROM public.bug_reports WHERE id = $1`, [id]))[0];
const promptRow = async (id: string) =>
  (await q<{ status: string }>(`SELECT status FROM public.bug_fix_feedback_requests WHERE id = $1`, [id]))[0];

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e) {
    throw new Error(`Local PostgreSQL 16 is required for this test (${String(e).slice(0, 200)})`);
  }
  psql(['-d', DBNAME, '-c', PRELUDE]);
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

describe('still-open prompt silence closes the report', () => {
  it('closes an open report whose shown prompt expired unanswered, by its reporter, with a note', async () => {
    const b = await bug('new');
    const p = await prompt(b, { status: 'delivered', expiresInDays: -1 });
    const r = await sweep();
    expect(r.success).toBe(true);
    expect(await promptRow(p)).toEqual({ status: 'expired' });
    const row = await bugRow(b);
    expect(row.status).toBe('resolved');
    expect(row.resolved_by).toBe(REPORTER);
    expect(row.metadata?.resolved_by).toBe('still_open_prompt_silence');
    expect(row.metadata?.still_open_prompt_id).toBe(p);
    expect(row.metadata?.close_note).toMatch(/did not answer/);
  });

  it('closes a "sent" prompt the same way as a "delivered" one', async () => {
    const b = await bug('seen');
    await prompt(b, { status: 'sent', expiresInDays: -2 });
    await sweep();
    expect((await bugRow(b)).status).toBe('resolved');
  });

  it('leaves a queued prompt alone: it was never shown, so its silence means nothing', async () => {
    const b = await bug('new');
    const p = await prompt(b, { status: 'pending_send', expiresInDays: -1 });
    await sweep();
    expect(await promptRow(p)).toEqual({ status: 'pending_send' });
    expect((await bugRow(b)).status).toBe('new');
  });

  it('leaves a prompt that has not run its 14 days yet', async () => {
    const b = await bug('new');
    const p = await prompt(b, { status: 'delivered', sentDaysAgo: 3, expiresInDays: 11 });
    await sweep();
    expect(await promptRow(p)).toEqual({ status: 'delivered' });
    expect((await bugRow(b)).status).toBe('new');
  });

  it('never touches an answered prompt ("yes, still happening" keeps the report open)', async () => {
    const b = await bug('new');
    const p = await prompt(b, { status: 'answered', answer: 'not_fixed', expiresInDays: -1 });
    await sweep();
    expect(await promptRow(p)).toEqual({ status: 'answered' });
    expect((await bugRow(b)).status).toBe('new');
  });

  it('never touches a fix-check prompt — those feed the fix-outcome ledger, not this rule', async () => {
    const b = await bug('new');
    const p = await prompt(b, { kind: 'fix_check', status: 'delivered', expiresInDays: -1 });
    await sweep();
    expect(await promptRow(p)).toEqual({ status: 'delivered' });
    expect((await bugRow(b)).status).toBe('new');
  });

  it('expires the prompt but keeps a report that was reopened after the prompt went out', async () => {
    const b = await bug('new', { reopenedDaysAgo: 2 });
    const p = await prompt(b, { status: 'delivered', sentDaysAgo: 15, expiresInDays: -1 });
    await sweep();
    expect(await promptRow(p)).toEqual({ status: 'expired' });
    expect((await bugRow(b)).status).toBe('new');
  });

  it('keeps an already-resolved report with its original resolver', async () => {
    const b = await bug('resolved', { resolvedBy: EARLIER_RESOLVER });
    const p = await prompt(b, { status: 'delivered', expiresInDays: -1 });
    await sweep();
    expect(await promptRow(p)).toEqual({ status: 'expired' });
    const row = await bugRow(b);
    expect(row.status).toBe('resolved');
    expect(row.resolved_by).toBe(EARLIER_RESOLVER);
  });

  it('is idempotent: a second run changes nothing', async () => {
    await sweep();
    const r = await sweep();
    expect(r).toMatchObject({ success: true, expired: 0, closed: 0 });
  });

  it('refuses a signed-in caller and changes nothing', async () => {
    const b = await bug('new');
    const p = await prompt(b, { status: 'delivered', expiresInDays: -1 });
    const r = await sweep('00000000-0000-4000-8000-0000000000ee');
    expect(r).toMatchObject({ success: false, error: 'service role only' });
    expect(await promptRow(p)).toEqual({ status: 'delivered' });
    expect((await bugRow(b)).status).toBe('new');
    await sweep(); // leave the table clean for the idempotency check order
  });

  it('is not executable by anon or authenticated, only by service_role', async () => {
    const rows = await q<{ anon: boolean; authed: boolean; svc: boolean }>(`
      SELECT has_function_privilege('anon', 'public.fn_bug_still_open_expire()', 'EXECUTE') AS anon,
             has_function_privilege('authenticated', 'public.fn_bug_still_open_expire()', 'EXECUTE') AS authed,
             has_function_privilege('service_role', 'public.fn_bug_still_open_expire()', 'EXECUTE') AS svc`);
    expect(rows[0]).toEqual({ anon: false, authed: false, svc: true });
  });
});
