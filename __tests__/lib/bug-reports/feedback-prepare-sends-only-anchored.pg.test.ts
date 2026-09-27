/**
 * #3958 W12 blind review (27 Sep): a request queued in a group BEFORE a fix was
 * required (fix_pr NULL) must not be sent unanchored when the group later gets
 * a fix. fn_bug_feedback_prepare now anchors such rows to the resolved fix
 * first, and never sends a row without one.
 *
 * Applies supabase/migrations/20270207090000_bug_feedback_prepare_requires_a_recorded_fix.sql
 * VERBATIM to a throwaway PostgreSQL 16 on top of a minimal schema.
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270207090000_bug_feedback_prepare_requires_a_recorded_fix.sql');
const PGHOST = process.env.PREPARE_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.PREPARE_TEST_PGPORT ?? '5432';
const PGUSER = process.env.PREPARE_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `prepare_anchor_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const CLUSTER = '00000000-0000-4000-8000-0000000000c1';
const OLD_REPORTER = '00000000-0000-4000-8000-0000000000a1';
const NEW_REPORTER = '00000000-0000-4000-8000-0000000000a2';
const OLD_BUG = '00000000-0000-4000-8000-0000000000b1';
const NEW_BUG = '00000000-0000-4000-8000-0000000000b2';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true,
                              is_login_disabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.bug_reports (id uuid PRIMARY KEY, display_id text, reporter_user_id uuid,
                                 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.bug_clusters (id uuid PRIMARY KEY, member_ids uuid[] NOT NULL, metadata jsonb);
CREATE TABLE public.bug_fix_feedback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid, bug_id uuid, reporter_user_id uuid,
  kind text NOT NULL DEFAULT 'fix_check',
  status text NOT NULL DEFAULT 'pending_send',
  fix_pr text, deploy_sha text,
  fix_live_at timestamptz, ask_after timestamptz, remind_at timestamptz, expires_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (cluster_id, reporter_user_id));
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;
const q = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;

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

beforeEach(async () => {
  await q(`TRUNCATE public.bug_fix_feedback_requests, public.bug_clusters, public.bug_reports, public.profiles`);
  await q(`INSERT INTO public.profiles (id) VALUES ($1), ($2)`, [OLD_REPORTER, NEW_REPORTER]);
  await q(`INSERT INTO public.bug_reports (id, display_id, reporter_user_id) VALUES ($1, 'BUG-1', $2), ($3, 'BUG-2', $4)`,
    [OLD_BUG, OLD_REPORTER, NEW_BUG, NEW_REPORTER]);
  await q(`INSERT INTO public.bug_clusters (id, member_ids, metadata) VALUES ($1, $2, $3)`, [
    CLUSTER, [OLD_BUG, NEW_BUG],
    { fixability: { verdict: { single_fix_feasible: true }, fix: { pr_number: '4100', deploy_sha: 'abc1234' } } },
  ]);
  // Queued in July, before a fix was required: no fix_pr.
  await q(`INSERT INTO public.bug_fix_feedback_requests (cluster_id, bug_id, reporter_user_id, created_at, expires_at)
           VALUES ($1, $2, $3, now() - interval '60 days', now() + interval '30 days')`, [CLUSTER, OLD_BUG, OLD_REPORTER]);
});

describe('fn_bug_feedback_prepare sends only requests anchored to a fix', () => {
  it('anchors an old queued request to the group\'s fix before it is sent; nothing goes out with fix_pr NULL', async () => {
    const [{ r }] = await q(`SELECT public.fn_bug_feedback_prepare($1) AS r`, [CLUSTER]);
    expect(r).toMatchObject({ success: true, prepared: 1, sent: 2 });
    const rows = await q(`SELECT reporter_user_id, status, fix_pr, deploy_sha FROM public.bug_fix_feedback_requests
                          ORDER BY created_at`);
    expect(rows).toEqual([
      { reporter_user_id: OLD_REPORTER, status: 'sent', fix_pr: '4100', deploy_sha: 'abc1234' },
      { reporter_user_id: NEW_REPORTER, status: 'sent', fix_pr: '4100', deploy_sha: 'abc1234' },
    ]);
  });

  it('keeps an older request that already names its own fix', async () => {
    await q(`UPDATE public.bug_fix_feedback_requests SET fix_pr = '3999' WHERE reporter_user_id = $1`, [OLD_REPORTER]);
    await q(`SELECT public.fn_bug_feedback_prepare($1)`, [CLUSTER]);
    const [row] = await q(`SELECT fix_pr, status FROM public.bug_fix_feedback_requests WHERE reporter_user_id = $1`, [OLD_REPORTER]);
    expect(row).toEqual({ fix_pr: '3999', status: 'sent' });
  });

  it('with no fix anywhere it refuses and sends nothing — the old queued request stays unsent', async () => {
    await q(`UPDATE public.bug_clusters SET metadata = '{"fixability":{"verdict":{"single_fix_feasible":true}}}' WHERE id = $1`, [CLUSTER]);
    const [{ r }] = await q(`SELECT public.fn_bug_feedback_prepare($1) AS r`, [CLUSTER]);
    expect(r.success).toBe(false);
    const rows = await q(`SELECT status FROM public.bug_fix_feedback_requests`);
    expect(rows).toEqual([{ status: 'pending_send' }]);
  });
});
