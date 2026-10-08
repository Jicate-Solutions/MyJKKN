/**
 * "Do it in the background" — behavioural proof of
 * supabase/migrations/20270304090000_ai_query_background_notice.sql
 *
 * The migration is applied VERBATIM to a throwaway PostgreSQL, on top of the
 * smallest stand-ins for what it touches on production: profiles, ai_job_types,
 * ai_jobs (the 20260712183000 shape), notifications (with the partial unique
 * idx_notifications_idempotency the ON CONFLICT relies on), user_notifications
 * (UNIQUE(notification_id, user_id)), the anon / authenticated / service_role
 * roles, and a recording cron.schedule stand-in. Every assertion is about what
 * PostgreSQL actually did to rows this file created.
 *
 * What it proves:
 *   • a background question that is answered, fails, or is canceled sends the
 *     asker exactly ONE notice, linking to the conversation; a repeated status
 *     write sends no second one
 *   • foreground and scheduled questions get no notice here
 *   • the sweep: a background question still pending after 2 h is canceled with
 *     "offline", one claimed for over 20 min is stopped with "took too long" —
 *     each with its notice — and its in-flight slot is freed; younger ones,
 *     foreground ones and scheduled ones are never touched
 *   • the sweep is scheduled every 10 minutes through cron.schedule, and the file
 *     still applies on a Postgres with no pg_cron
 *   • nobody signed in (and nobody anonymous) can run the sweep
 *   • the SQL strip of the page note agrees with stripPageNote in TypeScript
 *
 * REQUIRES a PostgreSQL (CI runs a postgres:16 service; `CI` selects the
 * `postgres` user). Loud, never skipped, when no server is reachable.
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/ai-query/background-notice.pg.test.ts
 * Override with BGNOTICE_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { stripPageNote } from '@/components/ai-query/AskAssistantRules';

// BGNOTICE_TEST_MIGRATION points the suite at a mutated copy, to prove it can fail.
const MIGRATION =
  process.env.BGNOTICE_TEST_MIGRATION ??
  path.join(process.cwd(), 'supabase/migrations/20270304090000_ai_query_background_notice.sql');

const PGHOST = process.env.BGNOTICE_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.BGNOTICE_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.BGNOTICE_TEST_PGUSER ?? (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.BGNOTICE_TEST_PGPASSWORD;
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 16);
const DBNAME = `ai_bg_notice_${SUFFIX}`;
const DBNAME_NOCRON = `ai_bg_notice_nocron_${SUFFIX}`;

const ASKER = '00000000-0000-4000-8000-00000000b001';
const CONV = '0b3c9a6e-5d1f-4a7e-9c2b-1f2e3d4c5b6a';

const BASE_STUBS = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.ai_job_types (
  job_type text PRIMARY KEY, interactive boolean NOT NULL DEFAULT false,
  max_inflight int NOT NULL DEFAULT 3);
CREATE TABLE public.ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      text NOT NULL REFERENCES public.ai_job_types(job_type),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by  uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  lane          text NOT NULL DEFAULT 'max',
  priority      int  NOT NULL DEFAULT 100,
  claimed_by    text,
  attempts      int  NOT NULL DEFAULT 0,
  result        jsonb,
  error         text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  delivered_at  timestamptz,
  app_id        text,
  CONSTRAINT ai_jobs_status_chk CHECK (status IN ('pending','claimed','running','done','error','canceled'))
);
CREATE TABLE public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  body            text NOT NULL,
  category        text,
  kind            text NOT NULL DEFAULT 'announcement'
                  CHECK (kind IN ('announcement','work_item','system')),
  targeting       jsonb NOT NULL,
  url             text,
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  expires_at      timestamptz,
  idempotency_key text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_notifications_idempotency
  ON public.notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE public.user_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id),
  user_id         uuid NOT NULL,
  UNIQUE (notification_id, user_id)
);
INSERT INTO public.ai_job_types (job_type, interactive) VALUES ('ai_query.chat', true), ('other.batch', false);
INSERT INTO public.profiles (id) VALUES ('${ASKER}');
`;

// A recording stand-in for pg_cron: the migration's guard looks for
// cron.schedule(text,text,text), so this proves the call is made and with what.
const CRON_STUB = `
CREATE SCHEMA cron;
CREATE TABLE cron.calls (jobname text, schedule text, command text);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
  LANGUAGE sql AS $$ INSERT INTO cron.calls VALUES ($1, $2, $3); SELECT 1::bigint $$;
`;

let admin: Client;
let db: Client;

type Job = { id: string };

async function job(opts: {
  message?: string;
  background?: boolean;
  scheduleId?: string;
  status?: string;
  ageMinutes?: number;
  claimedMinutesAgo?: number;
  jobType?: string;
}): Promise<string> {
  const payload: Record<string, unknown> = {
    message: opts.message ?? 'How many learners came today?',
    conversation_id: CONV,
  };
  if (opts.background !== false) payload.background = true;
  if (opts.scheduleId) payload.schedule_id = opts.scheduleId;
  const r = await db.query<Job>(
    `INSERT INTO ai_jobs (job_type, payload, requested_by, status, requested_at, claimed_at)
     VALUES ($1, $2, $3, $4,
             now() - make_interval(mins => $5::int),
             CASE WHEN $6::int IS NULL THEN NULL ELSE now() - make_interval(mins => $6::int) END)
     RETURNING id`,
    [
      opts.jobType ?? 'ai_query.chat',
      JSON.stringify(payload),
      ASKER,
      opts.status ?? 'pending',
      opts.ageMinutes ?? 0,
      opts.claimedMinutesAgo ?? null,
    ],
  );
  return r.rows[0].id;
}

async function setStatus(id: string, status: string, extra = '') {
  await db.query(`UPDATE ai_jobs SET status = $2 ${extra} WHERE id = $1`, [id, status]);
}

async function noticesFor(id: string) {
  return (
    await db.query(
      `SELECT n.title, n.body, n.url, n.category, n.kind, n.priority, n.metadata,
              (SELECT count(*) FROM user_notifications u WHERE u.notification_id = n.id)::int AS fanout
         FROM notifications n
        WHERE n.idempotency_key = 'ai_query.background|' || $1::text`,
      [id],
    )
  ).rows;
}

async function row(id: string) {
  return (await db.query(`SELECT status, error, completed_at FROM ai_jobs WHERE id = $1`, [id])).rows[0];
}

async function reap() {
  return (await db.query(`SELECT public.fn_ai_query_background_reap() AS r`)).rows[0].r as {
    offline: number;
    timed_out: number;
  };
}

beforeAll(async () => {
  admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  await admin.query(`CREATE DATABASE ${DBNAME_NOCRON}`);
  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  await db.query(BASE_STUBS);
  await db.query(CRON_STUB);
  await db.query(readFileSync(MIGRATION, 'utf8'));
});

afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME_NOCRON} WITH (FORCE)`);
    await admin.end();
  }
});

beforeEach(async () => {
  await db.query(`DELETE FROM user_notifications; DELETE FROM notifications; DELETE FROM ai_jobs;`);
});

describe('the notice when a background question ends', () => {
  it('an answered question sends ONE notice to the asker, linking to the conversation', async () => {
    const id = await job({ status: 'running', claimedMinutesAgo: 1 });
    await setStatus(id, 'done', `, result = '{"answer":"forty-two"}'`);
    const n = await noticesFor(id);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({
      title: 'Your AI Assistant answer is ready',
      body: 'You asked: "How many learners came today?". Open it to read the answer.',
      url: `/ai-query?conversation=${CONV}`,
      category: 'assistant',
      kind: 'work_item',
      priority: 'normal',
      fanout: 1,
    });
  });

  it('a repeated status write never sends a second notice', async () => {
    const id = await job({ status: 'running', claimedMinutesAgo: 1 });
    await setStatus(id, 'done', `, result = '{"answer":"a"}'`);
    await setStatus(id, 'running');
    await setStatus(id, 'done', `, result = '{"answer":"b"}'`);
    expect(await noticesFor(id)).toHaveLength(1);
  });

  it('a runner error tells the person to ask again, never the runner’s own text', async () => {
    const id = await job({ status: 'running', claimedMinutesAgo: 1 });
    await setStatus(id, 'error', `, error = 'drain: TypeError at line 42'`);
    const n = await noticesFor(id);
    expect(n).toHaveLength(1);
    expect(n[0].title).toBe('The AI Assistant could not answer your question');
    expect(n[0].body).toBe('You asked: "How many learners came today?". Please open the conversation and ask again.');
    expect(n[0].body).not.toContain('TypeError');
  });

  it('a canceled background question is told too', async () => {
    const id = await job({});
    await setStatus(id, 'canceled', `, error = 'abandoned by requester'`);
    const n = await noticesFor(id);
    expect(n).toHaveLength(1);
    expect(n[0].body).toContain('Please open the conversation and ask again.');
  });

  it('foreground and scheduled questions get no notice here', async () => {
    const fg = await job({ background: false, status: 'running', claimedMinutesAgo: 1 });
    const sch = await job({ scheduleId: randomUUID(), status: 'running', claimedMinutesAgo: 1 });
    await setStatus(fg, 'done', `, result = '{"answer":"x"}'`);
    await setStatus(sch, 'done', `, result = '{"answer":"x"}'`);
    expect(await noticesFor(fg)).toHaveLength(0);
    expect(await noticesFor(sch)).toHaveLength(0);
  });
});

describe('the sweep closes background questions nobody finished', () => {
  it('pending for over 2 hours → canceled as offline, with its notice', async () => {
    const id = await job({ ageMinutes: 125 });
    expect(await reap()).toEqual({ offline: 1, timed_out: 0 });
    const r = await row(id);
    expect(r.status).toBe('canceled');
    expect(r.error).toBe('The answering computers were offline. Please ask again.');
    expect(r.completed_at).not.toBeNull();
    const n = await noticesFor(id);
    expect(n).toHaveLength(1);
    expect(n[0].body).toBe(
      'You asked: "How many learners came today?". The answering computers were offline. Please ask again.',
    );
    expect(n[0].metadata.status).toBe('canceled');
  });

  it('claimed for over 20 minutes → stopped as too long, with its notice', async () => {
    const claimed = await job({ status: 'claimed', ageMinutes: 30, claimedMinutesAgo: 25 });
    const running = await job({ status: 'running', ageMinutes: 30, claimedMinutesAgo: 21 });
    expect(await reap()).toEqual({ offline: 0, timed_out: 2 });
    for (const id of [claimed, running]) {
      expect((await row(id)).status).toBe('error');
      const n = await noticesFor(id);
      expect(n).toHaveLength(1);
      expect(n[0].body).toBe(
        'You asked: "How many learners came today?". This took too long and was stopped. Please ask again.',
      );
    }
  });

  it('frees the in-flight slots fn_ai_enqueue counts', async () => {
    await job({ ageMinutes: 200 });
    await job({ status: 'claimed', ageMinutes: 60, claimedMinutesAgo: 59 });
    await job({ status: 'running', ageMinutes: 60, claimedMinutesAgo: 45 });
    const inflight = async () =>
      Number(
        (
          await db.query(
            `SELECT count(*) AS n FROM ai_jobs WHERE requested_by = $1 AND job_type = 'ai_query.chat'
               AND status IN ('pending','claimed','running')`,
            [ASKER],
          )
        ).rows[0].n,
      );
    expect(await inflight()).toBe(3);
    await reap();
    expect(await inflight()).toBe(0);
  });

  it('never touches young, foreground, scheduled or other job types', async () => {
    const young = await job({ ageMinutes: 90 });
    const youngClaim = await job({ status: 'claimed', ageMinutes: 15, claimedMinutesAgo: 15 });
    const fg = await job({ background: false, ageMinutes: 500 });
    const fgClaim = await job({ background: false, status: 'claimed', ageMinutes: 500, claimedMinutesAgo: 500 });
    const sch = await job({ scheduleId: randomUUID(), ageMinutes: 500 });
    const other = await job({ jobType: 'other.batch', ageMinutes: 500 });
    const done = await job({ status: 'done', ageMinutes: 500 });
    expect(await reap()).toEqual({ offline: 0, timed_out: 0 });
    expect((await row(young)).status).toBe('pending');
    expect((await row(youngClaim)).status).toBe('claimed');
    expect((await row(fg)).status).toBe('pending');
    expect((await row(fgClaim)).status).toBe('claimed');
    expect((await row(sch)).status).toBe('pending');
    expect((await row(other)).status).toBe('pending');
    expect((await row(done)).status).toBe('done');
    expect(Number((await db.query(`SELECT count(*) AS n FROM notifications`)).rows[0].n)).toBe(0);
  });

  it('a runner finishing after the sweep changes nothing (fn_ai_complete only moves claimed/running)', async () => {
    const id = await job({ status: 'running', ageMinutes: 60, claimedMinutesAgo: 30 });
    await reap();
    const moved = await db.query(
      `UPDATE ai_jobs SET status = 'done', result = '{"answer":"late"}' WHERE id = $1 AND status IN ('claimed','running')`,
      [id],
    );
    expect(moved.rowCount).toBe(0);
    expect(await noticesFor(id)).toHaveLength(1);
  });

  it('is scheduled every 10 minutes through cron.schedule', async () => {
    const calls = (await db.query(`SELECT * FROM cron.calls`)).rows;
    expect(calls).toHaveLength(1);
    expect(calls[0].jobname).toBe('ai-query-background-reap');
    expect(calls[0].schedule).toBe('*/10 * * * *');
    expect(calls[0].command).toContain('public.fn_ai_query_background_reap()');
  });

  it('still applies on a Postgres with no pg_cron', async () => {
    const bare = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME_NOCRON });
    await bare.connect();
    try {
      await bare.query(BASE_STUBS);
      await bare.query(readFileSync(MIGRATION, 'utf8'));
      const f = await bare.query(`SELECT to_regprocedure('public.fn_ai_query_background_reap(integer,integer)') AS p`);
      expect(f.rows[0].p).not.toBeNull();
    } finally {
      await bare.end();
    }
  });
});

describe('grants', () => {
  it.each(['anon', 'authenticated'])('%s cannot run the sweep or the trigger function', async (role) => {
    const r = await db.query(
      `SELECT has_function_privilege($1, 'public.fn_ai_query_background_reap(integer, integer)', 'EXECUTE') AS reap,
              has_function_privilege($1, 'public.fn_ai_query_background_notice()', 'EXECUTE') AS notice`,
      [role],
    );
    expect(r.rows[0]).toEqual({ reap: false, notice: false });
    await db.query(`SET ROLE ${role}`);
    try {
      await expect(db.query(`SELECT public.fn_ai_query_background_reap()`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.query(`RESET ROLE`);
    }
  });

  it('service_role can run the sweep', async () => {
    const r = await db.query(
      `SELECT has_function_privilege('service_role', 'public.fn_ai_query_background_reap(integer, integer)', 'EXECUTE') AS ok`,
    );
    expect(r.rows[0].ok).toBe(true);
  });
});

describe('the notice shows what the person typed — the same strip as the chat bubble', () => {
  const NOTE = '\n\n(Asked from the Receipts page, /billing/receipts)';
  const cases = [
    `How many receipts today?${NOTE}`,
    `Receipts (today only)${NOTE}`,
    // Two notes: only the one at the very end is removed, in both places.
    `q\n\n(Asked from the Home page, /)${NOTE}`,
    // A note that is not at the end is left alone, in both places.
    `a\n\n(Asked from the X page, /x) and more`,
    'No note at all',
  ];

  it.each(cases)('%j', async (message) => {
    const id = await job({ message, status: 'running', claimedMinutesAgo: 1 });
    await setStatus(id, 'done', `, result = '{"answer":"ok"}'`);
    const [n] = await noticesFor(id);
    const expected = stripPageNote(message).replace(/\s+/g, ' ').trim();
    expect(n.body).toBe(`You asked: "${expected}". Open it to read the answer.`);
  });
});
