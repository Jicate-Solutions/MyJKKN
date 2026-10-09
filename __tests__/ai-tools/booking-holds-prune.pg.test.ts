/**
 * supabase/migrations/20271009101000_ai_booking_reservations_prune_30d.sql,
 * applied VERBATIM to a throwaway PostgreSQL that has the real
 * ai_booking_reservations table (its CREATE TABLE, cut verbatim from
 * 20271008160000) and a recording stand-in for pg_cron.
 *
 * Proves:
 *   the job is scheduled nightly under one stable name;
 *   running the scheduled command deletes only rows older than 30 days,
 *     released or not, and keeps everything newer, so the 1-hour and
 *     24-hour booking limits never lose a row they count;
 *   re-applying re-points the same job instead of adding a second one;
 *   on a Postgres with no pg_cron the file still applies and schedules nothing.
 *
 * REQUIRES a PostgreSQL (CI's postgres:16 service; locally
 * `brew services start postgresql@16`). Fails loudly rather than skipping.
 * Override with AI_DOOR_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const PRUNE = readFileSync(
  path.join(REPO, 'supabase/migrations/20271009101000_ai_booking_reservations_prune_30d.sql'),
  'utf8'
);
const RESERVATIONS = readFileSync(
  path.join(REPO, 'supabase/migrations/20271008160000_personal_key_booking_reservations.sql'),
  'utf8'
);
const TABLE = RESERVATIONS.match(/CREATE TABLE IF NOT EXISTS public\.ai_booking_reservations \([\s\S]*?\n\);/)?.[0];

const PGHOST = process.env.AI_DOOR_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.AI_DOOR_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.AI_DOOR_TEST_PGUSER ?? (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.AI_DOOR_TEST_PGPASSWORD;

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const KEY = 'bbbbbbbb-0000-4000-8000-000000000002';

const BASE = `
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.api_keys (id uuid PRIMARY KEY);
INSERT INTO public.profiles VALUES ('${OWNER}');
INSERT INTO public.api_keys VALUES ('${KEY}');
`;

// A recording stand-in for pg_cron that upserts by job name, as pg_cron does.
const CRON_STUB = `
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobname text PRIMARY KEY, schedule text, command text);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job VALUES ($1, $2, $3)
    ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command;
  SELECT 1::bigint $$;
`;

let admin: Client;
let adminConnected = false;
const opened: { db: Client; name: string }[] = [];

async function freshDb(withCron: boolean): Promise<Client> {
  const name = `ai_prune_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: name });
  await db.connect();
  opened.push({ db, name });
  await db.query(BASE);
  await db.query(TABLE as string);
  if (withCron) await db.query(CRON_STUB);
  return db;
}

beforeAll(async () => {
  admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: 'postgres' });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(
      `Cannot reach PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}. This suite proves the migration against a ` +
        `real engine and fails rather than skipping. Start one with: brew services start postgresql@16\n${e}`
    );
  }
  adminConnected = true;
}, 60_000);

afterAll(async () => {
  for (const { db } of opened) await db.end().catch(() => undefined);
  if (adminConnected) {
    for (const { name } of opened) await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.end();
  }
});

describe('pruning booking holds older than 30 days', () => {
  it('cuts the real table out of 20271008160000', () => {
    expect(TABLE).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
  });

  it('schedules one nightly job', async () => {
    const db = await freshDb(true);
    await db.query(PRUNE);
    const { rows } = await db.query(`SELECT jobname, schedule FROM cron.job`);
    expect(rows).toEqual([{ jobname: 'ai-booking-reservations-retention', schedule: '47 3 * * *' }]);
  });

  it('the scheduled command deletes only rows older than 30 days', async () => {
    const db = await freshDb(true);
    await db.query(PRUNE);
    const ages: [string, boolean][] = [
      ['10 minutes', false], // inside the 1-hour limit
      ['20 hours', false], // inside the 24-hour limit
      ['29 days 23 hours', false],
      ['30 days 1 hour', true],
      ['90 days', true],
    ];
    for (const [age, released] of ages) {
      await db.query(
        `INSERT INTO public.ai_booking_reservations (key_id, owner_id, invitees, released, created_at)
         VALUES ($1, $2, 1, $3, now() - $4::interval)`,
        [KEY, OWNER, released, age]
      );
    }
    // an old unreleased row and a key-less (key deleted) old row go too
    await db.query(
      `INSERT INTO public.ai_booking_reservations (key_id, owner_id, invitees, released, created_at)
       VALUES ($1, $2, 3, false, now() - interval '31 days'), (NULL, $2, 1, false, now() - interval '45 days')`,
      [KEY, OWNER]
    );

    const { rows } = await db.query(`SELECT command FROM cron.job WHERE jobname = 'ai-booking-reservations-retention'`);
    await db.query(rows[0].command);

    const left = await db.query(
      `SELECT (now() - created_at) < interval '30 days' AS recent FROM public.ai_booking_reservations`
    );
    expect(left.rows).toHaveLength(3);
    expect(left.rows.every((r) => r.recent)).toBe(true);
    expect((await db.query(`SELECT count(*)::int AS n FROM public.profiles`)).rows[0].n).toBe(1);
  });

  it('re-applying re-points the same job', async () => {
    const db = await freshDb(true);
    await db.query(PRUNE);
    await db.query(PRUNE);
    expect((await db.query(`SELECT count(*)::int AS n FROM cron.job`)).rows[0].n).toBe(1);
  });

  it('applies on a Postgres with no pg_cron and schedules nothing', async () => {
    const db = await freshDb(false);
    await expect(db.query(PRUNE)).resolves.toBeDefined();
    expect((await db.query(`SELECT to_regnamespace('cron') AS ns`)).rows[0].ns).toBeNull();
  });
});
