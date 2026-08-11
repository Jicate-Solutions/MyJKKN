/**
 * "This permission is used by N people" — the COUNT half.
 * Behavioural proof for supabase/migrations/20260809103300_permission_holder_count.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration is applied VERBATIM with psql against a throwaway database and
 * the real function is called. Nothing here re-implements the counting rule in
 * TypeScript and then agrees with itself — the summed figure the feature exists
 * to avoid (621) is computed by a SEPARATE query over the SAME rows, so the
 * fixture is proved to actually contain the double-count trap before the
 * function is asked to avoid it.
 *
 * The fixture reproduces the production receipt for `bos.experts.view`:
 * 9 granting roles, 621 role-memberships, 581 distinct human beings.
 *
 * REQUIRES a local PostgreSQL. It is NOT run by CI (no workflow in
 * .github/workflows runs this path) and is deliberately loud rather than
 * skipped when no server is reachable — a silent skip would report green over a
 * suite that never executed.
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/users/permission-holder-count.test.ts
 *
 * Override the server with PHC_TEST_PGHOST / _PGPORT / _PGUSER.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20260809103300_permission_holder_count.sql'
);

const PGHOST = process.env.PHC_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.PHC_TEST_PGPORT ?? '5432';
const PGUSER = process.env.PHC_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_phc_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

/**
 * Production table shapes reduced to the columns this function touches, taken
 * from supabase/migrations/20251128_add_multi_role_support.sql and
 * supabase/setup/01_tables.sql.
 *
 * ALTER DEFAULT PRIVILEGES mirrors Supabase's own default, which hands anon
 * EXECUTE on every new function separately from PUBLIC. Without it the grant
 * assertions below would pass vacuously.
 */
const FIXTURE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $roles$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);

CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key varchar(50) UNIQUE NOT NULL,
  role_name varchar(50) NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  CONSTRAINT user_roles_unique_assignment UNIQUE (user_id, role_id)
);
`;

/** 9 granting roles, 581 people, 621 memberships — the production receipt. */
const SEED = `
INSERT INTO public.custom_roles (role_key, role_name, permissions)
SELECT 'bos_role_' || g, 'BoS Role ' || g, jsonb_build_object('bos.experts.view', true)
FROM generate_series(1, 9) g;

-- grants the key, held by nobody
INSERT INTO public.custom_roles (role_key, role_name, permissions)
VALUES ('empty_role', 'Empty Role', '{"campus_living.ghost.view": true}'::jsonb);

-- stores the value as the STRING "true" (user_has_permission enforces both forms)
INSERT INTO public.custom_roles (role_key, role_name, permissions)
VALUES ('stringy_role', 'Stringy Role', '{"stringy.key": "true"}'::jsonb);

-- a value that (x)::boolean would RAISE on, plus an explicit false
INSERT INTO public.custom_roles (role_key, role_name, permissions)
VALUES ('malformed_role', 'Malformed Role',
        '{"malformed.key": {"nested": 1}, "switched.off.key": false}'::jsonb);

INSERT INTO public.profiles (id, email)
SELECT gen_random_uuid(), 'person' || lpad(g::text, 4, '0') || '@jkkn.ac.in'
FROM generate_series(1, 581) g;

-- everybody holds exactly one granting role -> 581 memberships
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id,
       (SELECT id FROM public.custom_roles WHERE role_key = 'bos_role_' || (1 + (p.rn % 9)))
FROM (SELECT id, row_number() OVER (ORDER BY email) AS rn FROM public.profiles) p;

-- 40 of them hold a SECOND, different granting role -> 621 memberships,
-- still 581 people. This IS the double-count trap.
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id,
       (SELECT id FROM public.custom_roles WHERE role_key = 'bos_role_' || (1 + ((p.rn + 1) % 9)))
FROM (SELECT id, row_number() OVER (ORDER BY email) AS rn FROM public.profiles) p
WHERE p.rn <= 40;

INSERT INTO public.user_roles (user_id, role_id)
SELECT (SELECT id FROM public.profiles ORDER BY email LIMIT 1),
       (SELECT id FROM public.custom_roles WHERE role_key = 'stringy_role');
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

let client: Client;
let tmp: string;

async function holderCounts(keys: string[]) {
  const r = await client.query(
    'SELECT permission_key, holder_count FROM public.fn_permission_live_holder_count($1::text[]) ORDER BY permission_key',
    [keys]
  );
  return r.rows as { permission_key: string; holder_count: string }[];
}

async function countFor(key: string): Promise<number> {
  const rows = await holderCounts([key]);
  return Number(rows[0]?.holder_count);
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration file and proves behaviour against a\n` +
        `throwaway database; it will not pretend to pass without one.\n` +
        `  brew services start postgresql@16\n\n` +
        String(e?.stderr || e?.message || e)
    );
  }

  tmp = mkdtempSync(path.join(tmpdir(), 'phc-'));
  const fixturePath = path.join(tmp, 'fixture.sql');
  const seedPath = path.join(tmp, 'seed.sql');
  writeFileSync(fixturePath, FIXTURE);
  writeFileSync(seedPath, SEED);

  psql(['-d', DBNAME, '-f', fixturePath]);
  // Verbatim. Nothing is rewritten on the way in.
  psql(['-d', DBNAME, '-f', MIGRATION]);
  psql(['-d', DBNAME, '-f', seedPath]);

  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
}, 120_000);

afterAll(async () => {
  await client?.end().catch(() => {});
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`]);
  } catch {
    /* a leftover throwaway database is not worth failing the suite over */
  }
});

describe('fn_permission_live_holder_count — people, not roles', () => {
  it('the fixture really does contain the double-count trap', async () => {
    // Computed independently of the function under test, so the next assertion
    // is measuring something rather than restating it.
    const r = await client.query(`
      SELECT count(*)::int                        AS granting_roles,
             coalesce(sum(h.holders), 0)::int     AS summed_wrong
      FROM (
        SELECT cr.id, count(DISTINCT ur.user_id) AS holders
        FROM public.custom_roles cr
        JOIN public.user_roles ur ON ur.role_id = cr.id
        WHERE (cr.permissions ->> 'bos.experts.view') = 'true'
        GROUP BY cr.id
      ) h
    `);
    expect(r.rows[0].granting_roles).toBe(9);
    expect(r.rows[0].summed_wrong).toBe(621);
  });

  it('returns the DISTINCT person count (581), not the summed one (621)', async () => {
    expect(await countFor('bos.experts.view')).toBe(581);
  });

  it('a key granted only by a role nobody holds counts 0 — the UI stays silent', async () => {
    expect(await countFor('campus_living.ghost.view')).toBe(0);
  });

  it('a key nobody grants counts 0 and is still returned', async () => {
    const rows = await holderCounts(['not.a.real.key']);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].holder_count)).toBe(0);
  });

  it('an explicitly false permission counts 0', async () => {
    expect(await countFor('switched.off.key')).toBe(0);
  });

  it('a permission stored as the string "true" still counts', async () => {
    expect(await countFor('stringy.key')).toBe(1);
  });

  it('a malformed permission value returns 0 instead of taking the whole count offline', async () => {
    // (x)::boolean would raise here. A raise reads to the UI as "no counts at
    // all", which reads to the admin as "nobody is affected".
    expect(await countFor('malformed.key')).toBe(0);
  });

  it('answers many keys in ONE call, one row each, deduped, blanks dropped', async () => {
    const rows = await holderCounts([
      'bos.experts.view',
      'campus_living.ghost.view',
      'stringy.key',
      'bos.experts.view',
      ''
    ]);
    expect(rows.map((r) => r.permission_key)).toEqual([
      'bos.experts.view',
      'campus_living.ghost.view',
      'stringy.key'
    ]);
  });

  it('an empty array is not an error', async () => {
    expect(await holderCounts([])).toHaveLength(0);
  });

  it('takes no acting-user argument at all — nothing to forge', async () => {
    const r = await client.query(`
      SELECT pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_permission_live_holder_count'
    `);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].args).toBe('p_keys text[]');
    expect(r.rows[0].prosecdef).toBe(true);
    expect(r.rows[0].proconfig).toEqual(['search_path=public']);
  });

  it('anon holds no EXECUTE; authenticated does', async () => {
    const r = await client.query(`
      SELECT has_function_privilege('anon',
               'public.fn_permission_live_holder_count(text[])', 'EXECUTE') AS anon_exec,
             has_function_privilege('authenticated',
               'public.fn_permission_live_holder_count(text[])', 'EXECUTE') AS authed_exec
    `);
    expect(r.rows[0].anon_exec).toBe(false);
    expect(r.rows[0].authed_exec).toBe(true);
  });

  it('non-vacuity control: without the REVOKE, anon WOULD hold EXECUTE here', async () => {
    // Proves the assertion above is measuring the migration's REVOKE and not
    // the absence of Supabase's default grant in this throwaway database.
    await client.query(`
      CREATE OR REPLACE FUNCTION public.fn_phc_control(p_keys text[]) RETURNS int
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $ctl$ SELECT 1 $ctl$
    `);
    const r = await client.query(
      `SELECT has_function_privilege('anon', 'public.fn_phc_control(text[])', 'EXECUTE') AS anon_exec`
    );
    expect(r.rows[0].anon_exec).toBe(true);
  });
});
