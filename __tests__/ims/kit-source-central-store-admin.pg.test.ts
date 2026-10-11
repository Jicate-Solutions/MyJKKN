/**
 * Behavioural proof for
 * supabase/migrations/20271011100000_ims_kit_source_central_store_admin.sql
 * (Q-1010-395, Director 11 Oct 2026: only store admins mark an item Central or
 * reset its kit source; college staff mark only College).
 *
 * The migration is applied VERBATIM with psql onto a throwaway database that
 * carries a minimal ims_items, profiles and the live get_current_user_role()
 * shape (SECURITY DEFINER, reads profiles.role for auth.uid()). Every write is
 * made as `authenticated` with auth.uid() set per transaction, and the suite
 * reads back what PostgreSQL actually stored.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in
 * .github/workflows/test-suite.yml). CI user override: KITSRC_TEST_PGUSER.
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20271011100000_ims_kit_source_central_store_admin.sql',
);
const PGHOST = process.env.KITSRC_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.KITSRC_TEST_PGPORT ?? '5432';
const PGUSER =
  process.env.KITSRC_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `kit_source_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const COLLEGE_USER = '00000000-0000-4000-8000-0000000000a1';
const STORE_ADMIN = '00000000-0000-4000-8000-0000000000b2';
const SUPER_ADMIN = '00000000-0000-4000-8000-0000000000c3';
const NO_ROLE = '00000000-0000-4000-8000-0000000000d4';
const ITEM = '00000000-0000-4000-8000-0000000000e5';
const FLAG_SUPER = '00000000-0000-4000-8000-0000000000f6';
const INST = '00000000-0000-4000-8000-0000000000a9';
const ITEM_CODE = 'APR-1';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_admin NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
-- Supabase shape: the JWT role claim (NULL with no JWT, e.g. migrations / cron).
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, is_super_admin boolean);
INSERT INTO public.profiles VALUES
  ('${COLLEGE_USER}', 'staff', false), ('${STORE_ADMIN}', 'store_admin', false),
  ('${SUPER_ADMIN}', 'super_admin', false), ('${NO_ROLE}', NULL, NULL),
  ('${FLAG_SUPER}', 'staff', true);
-- Live shape: COALESCE(profiles.is_super_admin for auth.uid(), false), SECURITY DEFINER.
CREATE FUNCTION public.is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false) $$;
-- Live shape: SELECT role FROM profiles WHERE id = auth.uid(), SECURITY DEFINER.
CREATE FUNCTION public.get_current_user_role() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() $$;
CREATE TABLE public.ims_items (
  id uuid PRIMARY KEY,
  name text,
  institution_id uuid,
  code text,
  kit_source varchar(10) CHECK (kit_source IS NULL OR kit_source IN ('central','college')),
  CONSTRAINT ims_items_institution_code_unique UNIQUE (institution_id, code)
);
-- A SECURITY DEFINER writer, to prove a signed-in caller is not exempt through it.
CREATE FUNCTION public.test_definer_set_source(p_id uuid, p_source text) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ims_items SET kit_source = p_source WHERE id = p_id $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role, supabase_admin;
-- Supabase default grants: anon/authenticated/service_role all hold table DML.
GRANT SELECT, INSERT, UPDATE ON public.ims_items TO anon, authenticated, service_role, supabase_admin;
GRANT EXECUTE ON FUNCTION public.get_current_user_role(), public.is_super_admin(), public.test_definer_set_source(uuid, text)
  TO anon, authenticated, service_role, supabase_admin;
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

let client: Client;

/**
 * Run `sql` as a database role (default `authenticated`, JWT role claim the
 * same) with auth.uid() = uid (null = no JWT user). jwtRole null = no JWT.
 */
async function as(
  uid: string | null,
  sql: string,
  params: unknown[] = [],
  opts: { dbRole?: string; jwtRole?: string | null } = {},
) {
  const dbRole = opts.dbRole ?? 'authenticated';
  const jwtRole = opts.jwtRole === undefined ? dbRole : opts.jwtRole;
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('test.uid', $1, true)`, [uid ?? '']);
    await client.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [jwtRole ?? '']);
    await client.query(`SET LOCAL ROLE ${dbRole}`);
    await client.query(sql, params);
    await client.query('COMMIT');
    return { error: null as string | null, code: null as string | null };
  } catch (e) {
    await client.query('ROLLBACK');
    const err = e as Error & { code?: string };
    return { error: err.message, code: err.code ?? null };
  }
}

const setSource = (uid: string | null, v: string | null) =>
  as(uid, `UPDATE public.ims_items SET kit_source = $1 WHERE id = $2`, [v, ITEM]);

// Fixture writes go through a supabase_admin session with no JWT (the
// migration/cron exemption): the suite's own login may not be named postgres.
async function seed(v: string | null) {
  await client.query('BEGIN');
  await client.query(`SELECT set_config('test.uid', '', true), set_config('request.jwt.claim.role', '', true)`);
  await client.query('SET LOCAL ROLE supabase_admin');
  await client.query(`UPDATE public.ims_items SET kit_source = $1 WHERE id = $2`, [v, ITEM]);
  await client.query('COMMIT');
}

async function current() {
  const r = await client.query(`SELECT kit_source FROM public.ims_items WHERE id = $1`, [ITEM]);
  return r.rows[0]?.kit_source as string | null;
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e) {
    throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`);
  }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
  await client.query(`INSERT INTO public.ims_items (id, name, institution_id, code) VALUES ($1, 'Apron', $2, $3)`, [ITEM, INST, ITEM_CODE]);
});

afterAll(async () => {
  await client?.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]);
  } catch {
    /* best effort */
  }
});

beforeEach(async () => {
  await client.query(`DELETE FROM public.ims_items WHERE id <> $1`, [ITEM]);
  await seed(null);
});

const REFUSAL = 'Only a store admin can mark an item Central or reset its source.';

describe('ims_items.kit_source guard — college team members', () => {
  it('may mark an unclassified item College (NULL -> college)', async () => {
    expect(await setSource(COLLEGE_USER, 'college')).toEqual({ error: null, code: null });
    expect(await current()).toBe('college');
  });

  it('may NOT mark an item Central (42501, plain message)', async () => {
    const r = await setSource(COLLEGE_USER, 'central');
    expect(r.code).toBe('42501');
    expect(r.error).toBe(REFUSAL);
    expect(await current()).toBeNull();
  });

  it('may NOT reset a Central item (central -> NULL)', async () => {
    await seed('central');
    const r = await setSource(COLLEGE_USER, null);
    expect(r.code).toBe('42501');
    expect(await current()).toBe('central');
  });

  it('may NOT reset a College item (college -> NULL)', async () => {
    await seed('college');
    expect((await setSource(COLLEGE_USER, null)).code).toBe('42501');
    expect(await current()).toBe('college');
  });

  it('may NOT switch College -> Central or Central -> College', async () => {
    await seed('college');
    expect((await setSource(COLLEGE_USER, 'central')).code).toBe('42501');
    await seed('central');
    expect((await setSource(COLLEGE_USER, 'college')).code).toBe('42501');
    expect(await current()).toBe('central');
  });

  it('may re-send the SAME value (an edit form writing kit_source unchanged)', async () => {
    await seed('central');
    expect((await setSource(COLLEGE_USER, 'central')).error).toBeNull();
    await seed('college');
    expect((await setSource(COLLEGE_USER, 'college')).error).toBeNull();
  });

  it('may insert an item with no source or College, but not Central', async () => {
    const ins = (v: string | null) =>
      as(COLLEGE_USER, `INSERT INTO public.ims_items (id, name, kit_source) VALUES ($1, 'x', $2)`, [
        randomUUID(),
        v,
      ]);
    expect((await ins(null)).error).toBeNull();
    expect((await ins('college')).error).toBeNull();
    expect((await ins('central')).code).toBe('42501');
  });

  const upsert = (uid: string, id: string, code: string, v: string | null) =>
    as(
      uid,
      `INSERT INTO public.ims_items (id, name, institution_id, code, kit_source) VALUES ($1, 'x', $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kit_source = EXCLUDED.kit_source`,
      [id, INST, code, v],
    );
  const upsertByCode = (uid: string, code: string, v: string | null) =>
    as(
      uid,
      `INSERT INTO public.ims_items (id, name, institution_id, code, kit_source) VALUES ($1, 'x', $2, $3, $4)
       ON CONFLICT ON CONSTRAINT ims_items_institution_code_unique
       DO UPDATE SET name = EXCLUDED.name, kit_source = EXCLUDED.kit_source`,
      [randomUUID(), INST, code, v],
    );

  it('may upsert an existing Central item without changing kit_source (#4346 MEDIUM)', async () => {
    await seed('central');
    expect((await upsert(COLLEGE_USER, ITEM, ITEM_CODE, 'central')).error).toBeNull();
    expect(await current()).toBe('central');
    // Same, matched on the (institution_id, code) unique key with a fresh id.
    expect((await upsertByCode(COLLEGE_USER, ITEM_CODE, 'central')).error).toBeNull();
    expect(await current()).toBe('central');
  });

  it('may NOT upsert a NEW item as Central', async () => {
    const r = await upsert(COLLEGE_USER, randomUUID(), 'NEW-1', 'central');
    expect(r.code).toBe('42501');
  });

  it('may NOT upsert an existing College item to Central (by id or by code)', async () => {
    await seed('college');
    expect((await upsert(COLLEGE_USER, ITEM, ITEM_CODE, 'central')).code).toBe('42501');
    expect((await upsertByCode(COLLEGE_USER, ITEM_CODE, 'central')).code).toBe('42501');
    expect(await current()).toBe('college');
  });

  it('may NOT reset a Central item through an upsert (UPDATE branch still guards)', async () => {
    await seed('central');
    expect((await upsert(COLLEGE_USER, ITEM, ITEM_CODE, null)).code).toBe('42501');
    expect(await current()).toBe('central');
  });

  it('a caller with no role at all is refused, not waved through', async () => {
    expect((await setSource(NO_ROLE, 'central')).code).toBe('42501');
  });

  it('is NOT exempt through a SECURITY DEFINER function (auth.uid() still set)', async () => {
    const r = await as(COLLEGE_USER, `SELECT public.test_definer_set_source($1, 'central')`, [ITEM]);
    expect(r.code).toBe('42501');
    expect(await current()).toBeNull();
  });

  it('other columns stay editable on a Central item (trigger fires only on kit_source)', async () => {
    await seed('central');
    const r = await as(COLLEGE_USER, `UPDATE public.ims_items SET name = 'Apron L' WHERE id = $1`, [ITEM]);
    expect(r.error).toBeNull();
  });
});

describe('ims_items.kit_source guard — store admins and system writes', () => {
  it('a store admin may mark an item Central', async () => {
    expect((await setSource(STORE_ADMIN, 'central')).error).toBeNull();
    expect(await current()).toBe('central');
  });

  it('a store admin may switch College -> Central', async () => {
    await seed('college');
    expect((await setSource(STORE_ADMIN, 'central')).error).toBeNull();
    expect(await current()).toBe('central');
  });

  it('a store admin may reset the source (central -> NULL)', async () => {
    await seed('central');
    expect((await setSource(STORE_ADMIN, null)).error).toBeNull();
    expect(await current()).toBeNull();
  });

  it('a super admin may mark Central and reset', async () => {
    expect((await setSource(SUPER_ADMIN, 'central')).error).toBeNull();
    expect((await setSource(SUPER_ADMIN, null)).error).toBeNull();
    expect(await current()).toBeNull();
  });

  it('the platform super-admin flag (is_super_admin, ordinary role) may mark Central and reset', async () => {
    expect((await setSource(FLAG_SUPER, 'central')).error).toBeNull();
    expect(await current()).toBe('central');
    expect((await setSource(FLAG_SUPER, null)).error).toBeNull();
    expect(await current()).toBeNull();
  });

  const setAs = (v: string | null, opts: { dbRole?: string; jwtRole?: string | null }) =>
    as(null, `UPDATE public.ims_items SET kit_source = $1 WHERE id = $2`, [v, ITEM], opts);

  it('the service role (no user, JWT role service_role) may mark Central and reset', async () => {
    expect((await setAs('central', { dbRole: 'service_role' })).error).toBeNull();
    expect(await current()).toBe('central');
    expect((await setAs(null, { dbRole: 'service_role' })).error).toBeNull();
    expect(await current()).toBeNull();
  });

  it('a direct supabase_admin / postgres session with no JWT (migration, cron) is allowed', async () => {
    expect((await setAs('central', { dbRole: 'supabase_admin', jwtRole: null })).error).toBeNull();
    expect(await current()).toBe('central');
  });

  it('anon with no user id writing Central is refused (#4346 LOW)', async () => {
    const r = await setAs('central', { dbRole: 'anon' });
    expect(r.code).toBe('42501');
    expect(await current()).toBeNull();
  });

  it('signed-out authenticated-role JWT (no uid) is refused too', async () => {
    expect((await setAs('central', { dbRole: 'authenticated' })).code).toBe('42501');
  });

  it('anon reaching a postgres-owned SECURITY DEFINER writer is still refused (JWT role anon)', async () => {
    // Function owner is the suite's superuser; force the postgres/supabase_admin
    // current_user branch by owning it with supabase_admin.
    await client.query(`ALTER FUNCTION public.test_definer_set_source(uuid, text) OWNER TO supabase_admin`);
    try {
      const r = await as(null, `SELECT public.test_definer_set_source($1, 'central')`, [ITEM], { dbRole: 'anon' });
      expect(r.code).toBe('42501');
      expect(await current()).toBeNull();
    } finally {
      await client.query(`ALTER FUNCTION public.test_definer_set_source(uuid, text) OWNER TO CURRENT_USER`);
    }
  });

  it('the trigger function is not executable by anon or authenticated', async () => {
    const r = await client.query(
      `SELECT has_function_privilege('anon', 'public.fn_ims_items_kit_source_guard()', 'EXECUTE') AS a,
              has_function_privilege('authenticated', 'public.fn_ims_items_kit_source_guard()', 'EXECUTE') AS b`,
    );
    expect(r.rows[0]).toEqual({ a: false, b: false });
  });
});

// #4346 panel round 3 LOW: the same-value upsert exemption relies on
// UNIQUE (institution_id, code); the migration must refuse to install without it.
describe('migration precondition — UNIQUE (institution_id, code)', () => {
  const NO_UNIQUE = /,\s*CONSTRAINT ims_items_institution_code_unique UNIQUE \(institution_id, code\)/;
  const triggerCount = (db: string) =>
    psql(['-d', db, '-tAc', `SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_ims_items_kit_source_guard'`]).trim();

  it('refuses to apply on a throwaway database whose ims_items lacks the unique key', () => {
    const db = `kit_source_nouniq_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${db}`]);
    try {
      const prelude = PRELUDE.replace(NO_UNIQUE, '');
      expect(prelude).not.toContain('ims_items_institution_code_unique');
      psql(['-d', db, '-c', prelude]);
      let err = '';
      try {
        psql(['-d', db, '-f', MIGRATION]);
      } catch (e) {
        err = String((e as { stderr?: string }).stderr ?? e);
      }
      expect(err).toMatch(/ims_items has no UNIQUE \(institution_id, code\)/);
      expect(triggerCount(db)).toBe('0');
    } finally {
      psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${db}`]);
    }
  });

  it('accepts an equivalent unique INDEX (not a named constraint) on the same columns', () => {
    const db = `kit_source_uidx_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${db}`]);
    try {
      const prelude =
        PRELUDE.replace(NO_UNIQUE, '') +
        '\nCREATE UNIQUE INDEX ims_items_code_inst_uidx ON public.ims_items (code, institution_id);';
      psql(['-d', db, '-c', prelude]);
      psql(['-d', db, '-f', MIGRATION]);
      expect(triggerCount(db)).toBe('1');
    } finally {
      psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${db}`]);
    }
  });
});
