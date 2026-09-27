/**
 * PR #4024 W12 review — duplicate prevention must hold under CONCURRENT saves.
 *
 * Applies supabase/migrations/20270410090000_cdc_industry_mentor_one_active_per_email.sql
 * VERBATIM to a throwaway PostgreSQL and drives it from two connections at once.
 *
 * RUNNING IT
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/cdc/industry-mentor-one-active-per-email.db.test.ts
 * Override with MENTORDUP_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 * Deliberately loud rather than skipped when no server is reachable.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { duplicateMentorFromDbError } from '@/lib/services/cdc/industry-mentor-service';

const MIGRATION = path.resolve(
  __dirname, '..', '..',
  'supabase/migrations/20270410090000_cdc_industry_mentor_one_active_per_email.sql'
);
const PG = {
  host: process.env.MENTORDUP_TEST_PGHOST ?? 'localhost',
  port: Number(process.env.MENTORDUP_TEST_PGPORT ?? 5432),
  user: process.env.MENTORDUP_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres'),
  password: process.env.MENTORDUP_TEST_PGPASSWORD,
};
const DBNAME = `mentor_dup_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
const INST = '00000000-0000-4000-8000-00000000000a';
const OTHER_INST = '00000000-0000-4000-8000-00000000000b';

const SCHEMA = `
CREATE TABLE public.industry_mentors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  mentor_name    varchar NOT NULL,
  email          varchar NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);`;

let admin: Client;
let a: Client;
let b: Client;

async function insert(c: Client, email: string, inst = INST, active = true) {
  const { rows } = await c.query(
    `INSERT INTO public.industry_mentors (institution_id, mentor_name, email, is_active)
     VALUES ($1, 'Mentor', $2, $3) RETURNING id`,
    [inst, email, active]
  );
  return rows[0].id as string;
}
async function activeCount(email: string) {
  const { rows } = await a.query(
    `SELECT count(*)::int n FROM public.industry_mentors
     WHERE is_active AND lower(btrim(email)) = lower(btrim($1)) AND institution_id = $2`,
    [email, INST]
  );
  return rows[0].n as number;
}

beforeAll(async () => {
  admin = new Client({ ...PG, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  a = new Client({ ...PG, database: DBNAME });
  b = new Client({ ...PG, database: DBNAME });
  await a.connect();
  await b.connect();
  await a.query(SCHEMA);
  await a.query(readFileSync(MIGRATION, 'utf8'));
}, 60_000);

afterAll(async () => {
  await a?.end();
  await b?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`).catch(() => {});
  await admin?.end();
});

beforeEach(async () => {
  await a.query('TRUNCATE public.industry_mentors');
});

describe('one active industry mentor per (institution, email)', () => {
  it('two saves racing in separate transactions: exactly one lands, the other gets 23505 naming it', async () => {
    await a.query('BEGIN');
    await b.query('BEGIN');
    const firstId = await insert(a, 'mentor@example.com');
    // b blocks on the advisory lock until a commits, then sees a's row.
    const second = insert(b, ' Mentor@Example.com ').then(
      () => null,
      (e) => e
    );
    await new Promise((r) => setTimeout(r, 200));
    await a.query('COMMIT');
    const err = await second;
    await b.query('ROLLBACK');

    expect(err).toMatchObject({ code: '23505', constraint: 'industry_mentors_one_active_per_email' });
    // PostgREST forwards DETAIL as `details` — the shape the service sees.
    expect(duplicateMentorFromDbError({ code: err.code, details: err.detail })?.existingId).toBe(firstId);
    expect(await activeCount('mentor@example.com')).toBe(1);
  });

  it('a case/space variant is the same email; another institution or an inactive row is not a duplicate', async () => {
    await insert(a, 'x@example.com');
    await expect(insert(a, 'X@EXAMPLE.COM')).rejects.toMatchObject({ code: '23505' });
    await expect(insert(a, 'x@example.com', OTHER_INST)).resolves.toBeTruthy();
    await expect(insert(a, 'x@example.com', INST, false)).resolves.toBeTruthy();
  });

  it('re-activating, or moving an email onto an active one, is refused', async () => {
    await insert(a, 'y@example.com');
    const inactive = await insert(a, 'y@example.com', INST, false);
    await expect(
      a.query(`UPDATE public.industry_mentors SET is_active = true WHERE id = $1`, [inactive])
    ).rejects.toMatchObject({ code: '23505' });
    const other = await insert(a, 'z@example.com');
    await expect(
      a.query(`UPDATE public.industry_mentors SET email = 'Y@example.com' WHERE id = $1`, [other])
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rows that were ALREADY duplicates (production has three) stay editable', async () => {
    await a.query('ALTER TABLE public.industry_mentors DISABLE TRIGGER trg_industry_mentor_one_active_per_email');
    const ids = [await insert(a, 'dup@example.com'), await insert(a, 'dup@example.com')];
    await a.query('ALTER TABLE public.industry_mentors ENABLE TRIGGER trg_industry_mentor_one_active_per_email');
    // The service's update sends every field, email included.
    await expect(
      a.query(
        `UPDATE public.industry_mentors SET email = 'dup@example.com', mentor_name = 'Renamed' WHERE id = $1`,
        [ids[0]]
      )
    ).resolves.toBeTruthy();
    // Deactivating one is always allowed.
    await expect(
      a.query(`UPDATE public.industry_mentors SET is_active = false WHERE id = $1`, [ids[1]])
    ).resolves.toBeTruthy();
  });
});
