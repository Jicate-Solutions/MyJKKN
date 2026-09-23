/**
 * Scheduled AI Assistant questions — behavioural proof of
 * supabase/migrations/20270305090000_ai_query_schedules.sql
 *
 * The migration is applied VERBATIM to a throwaway PostgreSQL, on top of the
 * smallest stand-ins for what it reads on production: profiles (with is_active /
 * is_login_disabled), ai_job_types, ai_jobs, ai_model_config, auth.uid() from
 * the request.jwt.claim.sub setting, and both user_has_permission overloads
 * answering from a grants table. Every assertion is about what PostgreSQL
 * actually did to rows this file created.
 *
 * What it proves:
 *   • next_run_at maths in SQL for all three cadences (month ends included), and
 *     that the TypeScript mirror agrees with it on a grid of 1,000+ cases
 *   • the run-time permission re-check: an owner who lost ai_query.view, or was
 *     deactivated, gets NO job and the schedule pauses
 *   • the daily cap: a scheduled run is refused once the owner has used today's
 *     questions (canceled ones do not count), exactly as fn_ai_enqueue counts
 *   • the third failure in a row pauses the schedule; a delivery resets the count
 *   • delivery is claimed once (a second sweep gets nothing) and a timed-out
 *     pending job is canceled
 *   • grants: anon can call nothing; a signed-in person cannot reach the cron's
 *     functions; RLS shows each person only their own schedules
 *
 * REQUIRES a PostgreSQL (CI runs a postgres:16 service; `CI` selects the
 * `postgres` user). Loud, never skipped, when no server is reachable.
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run lib/services/ai-query/schedules/__tests__/schedules-sql.pg.test.ts
 * Override with AISCHED_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { computeNextRun } from '../next-run';

// AISCHED_TEST_MIGRATION points the suite at a mutated copy, to prove it can fail.
const MIGRATION =
  process.env.AISCHED_TEST_MIGRATION ??
  path.join(process.cwd(), 'supabase/migrations/20270305090000_ai_query_schedules.sql');

const PGHOST = process.env.AISCHED_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.AISCHED_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.AISCHED_TEST_PGUSER ?? (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.AISCHED_TEST_PGPASSWORD;
const DBNAME = `ai_query_schedules_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const OWNER = '00000000-0000-4000-8000-00000000a001';
const OTHER = '00000000-0000-4000-8000-00000000a002';

const STUBS = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, email text,
  is_active boolean NOT NULL DEFAULT true, is_login_disabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.perm_grants (user_id uuid, perm text);
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM perm_grants WHERE user_id = auth.uid() AND perm = permission_name) $$;
CREATE OR REPLACE FUNCTION public.user_has_permission(user_id uuid, permission_key text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM perm_grants g WHERE g.user_id = $1 AND g.perm = $2) $$;
CREATE TABLE public.ai_model_config (feature_key text, is_active boolean, config_json jsonb);
CREATE TABLE public.ai_job_types (
  job_type text PRIMARY KEY, allow_rule text NOT NULL DEFAULT 'seat_owner',
  max_inflight int NOT NULL DEFAULT 3, daily_cap_per_user int,
  lane text NOT NULL DEFAULT 'max', enabled boolean NOT NULL DEFAULT true);
CREATE TABLE public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL REFERENCES public.ai_job_types(job_type),
  payload jsonb NOT NULL DEFAULT '{}', requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', lane text NOT NULL DEFAULT 'max',
  priority int NOT NULL DEFAULT 100, result jsonb, error text,
  requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, delivered_at timestamptz);
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_jobs_read_own ON public.ai_jobs FOR SELECT TO authenticated USING (requested_by = auth.uid());
GRANT SELECT ON public.ai_jobs TO authenticated;
`;

let admin: Client;
let db: Client;

async function as(uid: string | null) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
}

async function rpc<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query(sql, params);
  return r.rows[0]?.r as T;
}

async function createWeekly(uid: string, title = 'Weekly count'): Promise<string> {
  await as(uid);
  const res = await rpc<{ ok: boolean; id: string; error?: string }>(
    `SELECT fn_ai_query_schedule_create($1, 'How many learners came today?', 'weekly', 1::smallint, NULL, '09:00', ARRAY['in_app','email']) AS r`,
    [title],
  );
  await as(null);
  expect(res.ok, res.error).toBe(true);
  return res.id;
}

async function makeDue(id: string) {
  await db.query(`UPDATE ai_query_schedules SET next_run_at = now() - interval '1 minute' WHERE id = $1`, [id]);
}

async function enqueue(id: string) {
  return rpc<{ ok: boolean; status: string; job_id?: string; cap?: number; used?: number }>(
    `SELECT fn_ai_enqueue_scheduled($1) AS r`,
    [id],
  );
}

async function schedule(id: string) {
  return (await db.query(`SELECT * FROM ai_query_schedules WHERE id = $1`, [id])).rows[0];
}

async function jobCount(uid = OWNER): Promise<number> {
  return Number((await db.query(`SELECT count(*) AS n FROM ai_jobs WHERE requested_by = $1`, [uid])).rows[0].n);
}

beforeAll(async () => {
  admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  await db.query(STUBS);
  await db.query(readFileSync(MIGRATION, 'utf8'));
});

afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
    await admin.end();
  }
});

beforeEach(async () => {
  await db.query(`RESET ROLE`);
  await as(null);
  await db.query(`TRUNCATE ai_query_schedules, ai_jobs, profiles, perm_grants, ai_job_types, ai_model_config CASCADE`);
  await db.query(`INSERT INTO ai_job_types VALUES ('ai_query.chat', 'permission:ai_query.view', 3, 50, 'max', true)`);
  await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'owner@jkkn.ac.in'), ($2, 'other@jkkn.ac.in')`, [
    OWNER,
    OTHER,
  ]);
  await db.query(`INSERT INTO perm_grants VALUES ($1, 'ai_query.view'), ($2, 'ai_query.view')`, [OWNER, OTHER]);
});

describe('next_run_at maths (SQL)', () => {
  const next = async (cadence: string, wd: number | null, dom: number | null, time: string, after: string) =>
    (
      await db.query(
        `SELECT to_char(fn_ai_query_schedule_next_run($1, $2::smallint, $3::smallint, $4::time, $5::timestamptz)
                AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') AS t`,
        [cadence, wd, dom, time, after],
      )
    ).rows[0].t as string | null;

  it('daily: later today, else tomorrow; strictly after', async () => {
    expect(await next('daily', null, null, '09:00', '2026-09-23T03:00Z')).toBe('2026-09-23T03:30Z');
    expect(await next('daily', null, null, '09:00', '2026-09-23T03:30Z')).toBe('2026-09-24T03:30Z');
  });
  it('weekly: the next chosen weekday in IST', async () => {
    expect(await next('weekly', 1, null, '09:00', '2026-09-23T03:00Z')).toBe('2026-09-28T03:30Z');
    expect(await next('weekly', 3, null, '09:00', '2026-09-23T04:00Z')).toBe('2026-09-30T03:30Z');
  });
  it('monthly: a short month runs on its last day', async () => {
    expect(await next('monthly', null, 31, '09:00', '2026-09-23T00:00Z')).toBe('2026-09-30T03:30Z');
    expect(await next('monthly', null, 31, '09:00', '2026-02-01T00:00Z')).toBe('2026-02-28T03:30Z');
    expect(await next('monthly', null, 30, '09:00', '2028-02-10T00:00Z')).toBe('2028-02-29T03:30Z');
    expect(await next('monthly', null, 31, '23:30', '2026-12-31T18:30Z')).toBe('2027-01-31T18:00Z');
  });

  it('the TypeScript mirror agrees with SQL on a grid of dates, times and cadences', async () => {
    const cases: [string, number | null, number | null, string, string][] = [];
    const afters: string[] = [];
    for (let day = 0; day < 400; day += 13) {
      for (const hourUtc of [0, 3, 18, 21]) {
        afters.push(new Date(Date.UTC(2027, 0, 1 + day, hourUtc, 15)).toISOString());
      }
    }
    for (const after of afters) {
      cases.push(['daily', null, null, '09:00', after]);
      cases.push(['daily', null, null, '23:30', after]);
      for (const wd of [0, 3, 6]) cases.push(['weekly', wd, null, '07:30', after]);
      for (const dom of [1, 15, 29, 30, 31]) cases.push(['monthly', null, dom, '00:00', after]);
    }
    expect(cases.length).toBeGreaterThan(1000);
    const { rows } = await db.query(
      `SELECT to_char(fn_ai_query_schedule_next_run(c->>0, (c->>1)::smallint, (c->>2)::smallint, (c->>3)::time, (c->>4)::timestamptz)
              AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS t
         FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(c, n) ORDER BY n`,
      [JSON.stringify(cases)],
    );
    const mismatches = cases
      .map((c, i) => {
        const ts = computeNextRun(c[0] as 'daily' | 'weekly' | 'monthly', c[1], c[2], c[3], new Date(c[4]));
        return { c, sql: rows[i].t, ts: ts ? ts.toISOString() : null };
      })
      .filter((m) => m.sql !== m.ts);
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});

describe('create / limits / RLS', () => {
  it('creates a schedule for the signed-in person with the next run filled in', async () => {
    const id = await createWeekly(OWNER);
    const s = await schedule(id);
    expect(s.owner_id).toBe(OWNER);
    expect(s.active).toBe(true);
    expect(s.last_status).toBe('scheduled');
    expect(s.channels.sort()).toEqual(['email', 'in_app']);
    expect(new Date(s.next_run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses someone without AI Assistant access', async () => {
    await db.query(`DELETE FROM perm_grants WHERE user_id = $1`, [OWNER]);
    await as(OWNER);
    const res = await rpc<{ ok: boolean }>(
      `SELECT fn_ai_query_schedule_create('x', 'q', 'daily', NULL, NULL, '09:00', ARRAY['email']) AS r`,
    );
    expect(res.ok).toBe(false);
  });

  it('allows at most 10 active schedules per person', async () => {
    for (let i = 0; i < 10; i++) await createWeekly(OWNER, `S${i}`);
    await as(OWNER);
    const res = await rpc<{ ok: boolean; limit?: number }>(
      `SELECT fn_ai_query_schedule_create('eleventh', 'q', 'daily', NULL, NULL, '09:00', ARRAY['email']) AS r`,
    );
    expect(res.ok).toBe(false);
    expect(res.limit).toBe(10);
    // pausing one frees a slot
    const one = (await db.query(`SELECT id FROM ai_query_schedules LIMIT 1`)).rows[0].id;
    expect((await rpc<{ ok: boolean }>(`SELECT fn_ai_query_schedule_set_active($1, false) AS r`, [one])).ok).toBe(true);
    expect(
      (await rpc<{ ok: boolean }>(
        `SELECT fn_ai_query_schedule_create('eleventh', 'q', 'daily', NULL, NULL, '09:00', ARRAY['email']) AS r`,
      )).ok,
    ).toBe(true);
    // …and resuming it now is refused
    const resumed = await rpc<{ ok: boolean }>(`SELECT fn_ai_query_schedule_set_active($1, true) AS r`, [one]);
    expect(resumed.ok).toBe(false);
  });

  it('a person sees, pauses and deletes only their own schedules', async () => {
    const mine = await createWeekly(OWNER);
    const theirs = await createWeekly(OTHER);
    await as(OWNER);
    await db.query(`SET ROLE authenticated`);
    const seen = (await db.query(`SELECT id FROM ai_query_schedules`)).rows.map((r) => r.id);
    expect(seen).toEqual([mine]);
    expect((await rpc<{ ok: boolean }>(`SELECT fn_ai_query_schedule_set_active($1, false) AS r`, [theirs])).ok).toBe(false);
    expect((await rpc<{ ok: boolean }>(`SELECT fn_ai_query_schedule_delete($1) AS r`, [theirs])).ok).toBe(false);
    expect((await rpc<{ ok: boolean; status: string }>(`SELECT fn_ai_query_schedule_run_now($1) AS r`, [theirs])).status).toBe(
      'not_found',
    );
    await expect(db.query(`UPDATE ai_query_schedules SET title = 'x' WHERE id = $1`, [mine])).rejects.toThrow(
      /permission denied/,
    );
    await db.query(`RESET ROLE`);
    expect((await schedule(theirs)).active).toBe(true);
  });

  it('update changes only the caller’s own schedule and re-times the next run', async () => {
    const mine = await createWeekly(OWNER);
    const theirs = await createWeekly(OTHER);
    await as(OWNER);
    const res = await rpc<{ ok: boolean; next_run_at: string }>(
      `SELECT fn_ai_query_schedule_update($1, 'Monthly', 'q2', 'monthly', 3::smallint, 31::smallint, '18:00', ARRAY['email']) AS r`,
      [mine],
    );
    expect(res.ok).toBe(true);
    const s = await schedule(mine);
    expect([s.cadence, s.weekday, s.day_of_month, s.channels]).toEqual(['monthly', null, 31, ['email']]);
    const expected = computeNextRun('monthly', null, 31, '18:00', new Date());
    expect(new Date(s.next_run_at).toISOString()).toBe(expected?.toISOString());
    const other = await rpc<{ ok: boolean }>(
      `SELECT fn_ai_query_schedule_update($1, 'x', 'q', 'daily', NULL, NULL, '09:00', ARRAY['email']) AS r`,
      [theirs],
    );
    expect(other.ok).toBe(false);
    await as(null);
    expect((await schedule(theirs)).title).toBe('Weekly count');
  });

  it('rejects bad input with a plain-English reason', async () => {
    await as(OWNER);
    const bad = [
      [`'', 'q', 'daily', NULL, NULL, '09:00', ARRAY['email']`, /name/],
      [`'t', 'q', 'weekly', NULL, NULL, '09:00', ARRAY['email']`, /day of the week/],
      [`'t', 'q', 'monthly', NULL, 32::smallint, '09:00', ARRAY['email']`, /date between 1 and 31/],
      [`'t', 'q', 'daily', NULL, NULL, '09:00', ARRAY[]::text[]`, /email, in-app, or both/],
      [`'t', 'q', 'daily', NULL, NULL, '09:00', ARRAY['sms']`, /email, in-app, or both/],
      [`'t', 'q', 'hourly', NULL, NULL, '09:00', ARRAY['email']`, /daily, weekly or monthly/],
    ] as const;
    for (const [args, reason] of bad) {
      const r = await rpc<{ ok: boolean; error: string }>(`SELECT fn_ai_query_schedule_create(${args}) AS r`);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(reason);
    }
    await as(null);
    expect(Number((await db.query(`SELECT count(*) AS n FROM ai_query_schedules`)).rows[0].n)).toBe(0);
  });

  it('grants: anon reaches nothing; a signed-in person cannot reach the cron functions', async () => {
    const id = await createWeekly(OWNER);
    await db.query(`SET ROLE anon`);
    await expect(db.query(`SELECT fn_ai_query_schedule_create('x','q','daily',NULL,NULL,'09:00',ARRAY['email'])`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query(`SELECT * FROM ai_query_schedules`)).rejects.toThrow(/permission denied/);
    await db.query(`RESET ROLE`);
    await as(OWNER);
    await db.query(`SET ROLE authenticated`);
    for (const sql of [
      `SELECT fn_ai_enqueue_scheduled('${id}')`,
      `SELECT fn_ai_query_schedule_enqueue_run('${id}', true)`,
      `SELECT * FROM fn_ai_query_schedule_claim_deliveries(10, 360)`,
      `SELECT fn_ai_query_schedule_record_outcome('${id}', '${id}', 'delivered')`,
    ]) {
      await expect(db.query(sql)).rejects.toThrow(/permission denied/);
    }
    await db.query(`RESET ROLE`);
    await db.query(`SET ROLE service_role`);
    await expect(db.query(`SELECT fn_ai_query_schedule_enqueue_run('${id}', true)`)).rejects.toThrow(/permission denied/);
    await db.query(`RESET ROLE`);
  });
});

describe('enqueue (the cron)', () => {
  it('queues a due run as an ai_query.chat job requested by the OWNER and moves next_run_at on', async () => {
    const id = await createWeekly(OWNER);
    await makeDue(id);
    const res = await enqueue(id);
    expect(res.status).toBe('queued');
    const job = (await db.query(`SELECT * FROM ai_jobs WHERE id = $1`, [res.job_id])).rows[0];
    expect(job.job_type).toBe('ai_query.chat');
    expect(job.requested_by).toBe(OWNER);
    expect(job.payload).toEqual({
      message: 'How many learners came today?',
      conversation_id: null,
      schedule_id: id,
      background: true,
    });
    const s = await schedule(id);
    expect(s.last_status).toBe('queued');
    expect(s.last_job_id).toBe(res.job_id);
    expect(new Date(s.next_run_at).getTime()).toBeGreaterThan(Date.now());
    // not due any more → a second call does nothing
    expect((await enqueue(id)).status).toBe('not_due');
    expect(await jobCount()).toBe(1);
  });

  it('does nothing for a schedule that is not due or is paused', async () => {
    const id = await createWeekly(OWNER);
    expect((await enqueue(id)).status).toBe('not_due');
    await makeDue(id);
    await db.query(`UPDATE ai_query_schedules SET active = false WHERE id = $1`, [id]);
    expect((await enqueue(id)).status).toBe('not_due');
    expect(await jobCount()).toBe(0);
  });

  it('PERMISSION RE-CHECK: an owner who lost AI Assistant access gets no job and the schedule pauses', async () => {
    const id = await createWeekly(OWNER);
    await makeDue(id);
    await db.query(`DELETE FROM perm_grants WHERE user_id = $1`, [OWNER]);
    expect((await enqueue(id)).status).toBe('paused_no_access');
    expect(await jobCount()).toBe(0);
    const s = await schedule(id);
    expect(s.active).toBe(false);
    expect(s.last_status).toBe('paused_no_access');
  });

  it('PERMISSION RE-CHECK: a deactivated or login-disabled owner gets no job', async () => {
    const a = await createWeekly(OWNER);
    const b = await createWeekly(OTHER);
    await makeDue(a);
    await makeDue(b);
    await db.query(`UPDATE profiles SET is_active = false WHERE id = $1`, [OWNER]);
    await db.query(`UPDATE profiles SET is_login_disabled = true WHERE id = $1`, [OTHER]);
    expect((await enqueue(a)).status).toBe('paused_no_access');
    expect((await enqueue(b)).status).toBe('paused_no_access');
    expect(await jobCount(OWNER)).toBe(0);
    expect(await jobCount(OTHER)).toBe(0);
  });

  it('the permission is read from the job type allow_rule, for the owner (not the caller)', async () => {
    const id = await createWeekly(OWNER);
    await makeDue(id);
    await db.query(`UPDATE ai_job_types SET allow_rule = 'permission:ai_query.other' WHERE job_type = 'ai_query.chat'`);
    await as(OTHER); // a different signed-in session must not matter
    await db.query(`INSERT INTO perm_grants VALUES ($1, 'ai_query.other')`, [OTHER]);
    expect((await enqueue(id)).status).toBe('paused_no_access');
    await as(null);
  });

  it('CAP RESPECTED: once the owner has used today’s questions the run is skipped, not queued', async () => {
    await db.query(`UPDATE ai_job_types SET daily_cap_per_user = 3 WHERE job_type = 'ai_query.chat'`);
    const id = await createWeekly(OWNER);
    await makeDue(id);
    // three questions today, finished — the cap counts them regardless of status except canceled
    await db.query(
      `INSERT INTO ai_jobs (job_type, requested_by, status) SELECT 'ai_query.chat', $1, 'done' FROM generate_series(1,3)`,
      [OWNER],
    );
    const res = await enqueue(id);
    expect(res.status).toBe('skipped_limit');
    expect(res.cap).toBe(3);
    expect(res.used).toBe(3);
    expect(await jobCount()).toBe(3);
    const s = await schedule(id);
    expect(s.last_status).toBe('skipped_limit');
    expect(s.active).toBe(true);
    expect(new Date(s.next_run_at).getTime()).toBeGreaterThan(Date.now()); // moved on, no pile-up
  });

  it('CAP RESPECTED: canceled questions do not count, and yesterday’s do not count', async () => {
    await db.query(`UPDATE ai_job_types SET daily_cap_per_user = 3 WHERE job_type = 'ai_query.chat'`);
    const id = await createWeekly(OWNER);
    await makeDue(id);
    await db.query(
      `INSERT INTO ai_jobs (job_type, requested_by, status) SELECT 'ai_query.chat', $1, 'canceled' FROM generate_series(1,5)`,
      [OWNER],
    );
    await db.query(
      `INSERT INTO ai_jobs (job_type, requested_by, status, requested_at)
       SELECT 'ai_query.chat', $1, 'done', now() - interval '2 days' FROM generate_series(1,5)`,
      [OWNER],
    );
    await db.query(`INSERT INTO ai_jobs (job_type, requested_by, status) VALUES ('ai_query.chat', $1, 'done')`, [OWNER]);
    expect((await enqueue(id)).status).toBe('queued');
  });

  it('CAP RESPECTED: "Run now" obeys the same cap and does not move the schedule', async () => {
    await db.query(`UPDATE ai_job_types SET daily_cap_per_user = 1 WHERE job_type = 'ai_query.chat'`);
    const id = await createWeekly(OWNER);
    const before = (await schedule(id)).next_run_at;
    await db.query(`INSERT INTO ai_jobs (job_type, requested_by, status) VALUES ('ai_query.chat', $1, 'done')`, [OWNER]);
    await as(OWNER);
    const res = await rpc<{ ok: boolean; status: string }>(`SELECT fn_ai_query_schedule_run_now($1) AS r`, [id]);
    await as(null);
    expect(res.status).toBe('skipped_limit');
    expect(await jobCount()).toBe(1);
    expect((await schedule(id)).next_run_at).toEqual(before);
  });

  it('in-flight cap: waits while the owner has too many questions running, gives up after 2 hours', async () => {
    await db.query(`UPDATE ai_job_types SET max_inflight = 1 WHERE job_type = 'ai_query.chat'`);
    const id = await createWeekly(OWNER);
    await makeDue(id);
    await db.query(`INSERT INTO ai_jobs (job_type, requested_by, status) VALUES ('ai_query.chat', $1, 'running')`, [OWNER]);
    expect((await enqueue(id)).status).toBe('busy');
    expect((await schedule(id)).last_status).toBe('scheduled'); // untouched: retried next tick
    await db.query(`UPDATE ai_query_schedules SET next_run_at = now() - interval '3 hours' WHERE id = $1`, [id]);
    expect((await enqueue(id)).status).toBe('skipped_busy');
    expect(await jobCount()).toBe(1);
  });

  it('a switched-off AI Assistant skips the run', async () => {
    const id = await createWeekly(OWNER);
    await makeDue(id);
    await db.query(`UPDATE ai_job_types SET enabled = false`);
    expect((await enqueue(id)).status).toBe('skipped_offline');
    expect(await jobCount()).toBe(0);
  });

  it('run now works while paused, but never twice while a run is still being answered', async () => {
    const id = await createWeekly(OWNER);
    await as(OWNER);
    await rpc(`SELECT fn_ai_query_schedule_set_active($1, false) AS r`, [id]);
    const first = await rpc<{ status: string }>(`SELECT fn_ai_query_schedule_run_now($1) AS r`, [id]);
    const second = await rpc<{ status: string }>(`SELECT fn_ai_query_schedule_run_now($1) AS r`, [id]);
    await as(null);
    expect(first.status).toBe('queued');
    expect(second.status).toBe('in_flight');
    expect(await jobCount()).toBe(1);
  });
});

describe('delivery + pause after 3 failures', () => {
  async function runOnce(id: string, jobStatus: 'done' | 'error', answer = '42 learners') {
    await makeDue(id);
    const q = await enqueue(id);
    expect(q.status).toBe('queued');
    await db.query(`UPDATE ai_jobs SET status = $2, result = $3::jsonb, completed_at = now() WHERE id = $1`, [
      q.job_id,
      jobStatus,
      jobStatus === 'done' ? JSON.stringify({ answer }) : null,
    ]);
    const claimed = (await db.query(`SELECT * FROM fn_ai_query_schedule_claim_deliveries(50, 360)`)).rows;
    expect(claimed).toHaveLength(1);
    return { jobId: q.job_id as string, claimed: claimed[0] };
  }

  async function record(id: string, jobId: string, outcome: 'delivered' | 'failed') {
    return rpc<{ ok: boolean; paused: boolean; consecutive_failures: number }>(
      `SELECT fn_ai_query_schedule_record_outcome($1, $2, $3) AS r`,
      [id, jobId, outcome],
    );
  }

  it('hands the sweep the answer and the OWNER’s own email, exactly once', async () => {
    const id = await createWeekly(OWNER);
    const { jobId, claimed } = await runOnce(id, 'done');
    expect(claimed.schedule_id).toBe(id);
    expect(claimed.owner_id).toBe(OWNER);
    expect(claimed.owner_email).toBe('owner@jkkn.ac.in');
    expect(claimed.answer).toBe('42 learners');
    expect(claimed.job_status).toBe('done');
    // a second, overlapping sweep gets nothing
    expect((await db.query(`SELECT * FROM fn_ai_query_schedule_claim_deliveries(50, 360)`)).rows).toHaveLength(0);
    const rec = await record(id, jobId, 'delivered');
    expect(rec.ok).toBe(true);
    expect((await schedule(id)).last_status).toBe('delivered');
    const job = (await db.query(`SELECT delivered_at FROM ai_jobs WHERE id = $1`, [jobId])).rows[0];
    expect(job.delivered_at).not.toBeNull();
    // recording twice is a no-op
    expect((await record(id, jobId, 'delivered')).ok).toBe(false);
  });

  it('the third failure in a row pauses the schedule; the first two do not', async () => {
    const id = await createWeekly(OWNER);
    for (let n = 1; n <= 3; n++) {
      const { jobId, claimed } = await runOnce(id, 'error');
      expect(claimed.answer).toBeNull();
      const rec = await record(id, jobId, 'failed');
      expect(rec.consecutive_failures).toBe(n);
      expect(rec.paused).toBe(n === 3);
      const s = await schedule(id);
      expect(s.active).toBe(n < 3);
      expect(s.last_status).toBe(n < 3 ? 'failed' : 'paused_failures');
    }
    // paused → the cron no longer runs it
    await makeDue(id);
    expect((await enqueue(id)).status).toBe('not_due');
  });

  it('a delivery in between resets the count, so failures must be in a row', async () => {
    const id = await createWeekly(OWNER);
    for (const outcome of ['failed', 'failed', 'delivered', 'failed', 'failed'] as const) {
      const { jobId } = await runOnce(id, outcome === 'delivered' ? 'done' : 'error');
      await record(id, jobId, outcome);
    }
    const s = await schedule(id);
    expect(s.consecutive_failures).toBe(2);
    expect(s.active).toBe(true);
  });

  it('resume clears the failure count and re-times the next run', async () => {
    const id = await createWeekly(OWNER);
    for (let n = 1; n <= 3; n++) {
      const { jobId } = await runOnce(id, 'error');
      await record(id, jobId, 'failed');
    }
    await as(OWNER);
    const res = await rpc<{ ok: boolean }>(`SELECT fn_ai_query_schedule_set_active($1, true) AS r`, [id]);
    await as(null);
    expect(res.ok).toBe(true);
    const s = await schedule(id);
    expect(s.active).toBe(true);
    expect(s.consecutive_failures).toBe(0);
    expect(s.last_status).toBe('scheduled');
  });

  it('a run with no answer after the timeout is claimed as timed out and its pending job canceled', async () => {
    const id = await createWeekly(OWNER);
    await makeDue(id);
    const q = await enqueue(id);
    // still pending; not yet late
    expect((await db.query(`SELECT * FROM fn_ai_query_schedule_claim_deliveries(50, 360)`)).rows).toHaveLength(0);
    await db.query(`UPDATE ai_jobs SET requested_at = now() - interval '7 hours' WHERE id = $1`, [q.job_id]);
    const rows = (await db.query(`SELECT * FROM fn_ai_query_schedule_claim_deliveries(50, 360)`)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].timed_out).toBe(true);
    expect(rows[0].job_status).toBe('timed_out');
    const job = (await db.query(`SELECT status FROM ai_jobs WHERE id = $1`, [q.job_id])).rows[0];
    expect(job.status).toBe('canceled');
  });
});
