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

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
INSERT INTO public.profiles VALUES
  ('${COLLEGE_USER}', 'staff'), ('${STORE_ADMIN}', 'store_admin'),
  ('${SUPER_ADMIN}', 'super_admin'), ('${NO_ROLE}', NULL);
-- Live shape: SELECT role FROM profiles WHERE id = auth.uid(), SECURITY DEFINER.
CREATE FUNCTION public.get_current_user_role() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() $$;
CREATE TABLE public.ims_items (
  id uuid PRIMARY KEY,
  name text,
  institution_id uuid,
  kit_source varchar(10) CHECK (kit_source IS NULL OR kit_source IN ('central','college'))
);
-- A SECURITY DEFINER writer, to prove a signed-in caller is not exempt through it.
CREATE FUNCTION public.test_definer_set_source(p_id uuid, p_source text) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ims_items SET kit_source = p_source WHERE id = p_id $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ims_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_role(), public.test_definer_set_source(uuid, text) TO authenticated;
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

let client: Client;

/** Run `sql` as `authenticated` with auth.uid() = uid (null = no JWT user). */
async function as(uid: string | null, sql: string, params: unknown[] = []) {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('test.uid', $1, true)`, [uid ?? '']);
    await client.query('SET LOCAL ROLE authenticated');
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

async function seed(v: string | null) {
  await client.query(`UPDATE public.ims_items SET kit_source = $1 WHERE id = $2`, [v, ITEM]);
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
  await client.query(`INSERT INTO public.ims_items (id, name) VALUES ($1, 'Apron')`, [ITEM]);
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

  it('a write with no JWT user (service role / migration / cron) is allowed', async () => {
    expect((await setSource(null, 'central')).error).toBeNull();
    expect((await setSource(null, null)).error).toBeNull();
    expect(await current()).toBeNull();
  });

  it('the trigger function is not executable by anon or authenticated', async () => {
    const r = await client.query(
      `SELECT has_function_privilege('anon', 'public.fn_ims_items_kit_source_guard()', 'EXECUTE') AS a,
              has_function_privilege('authenticated', 'public.fn_ims_items_kit_source_guard()', 'EXECUTE') AS b`,
    );
    expect(r.rows[0]).toEqual({ a: false, b: false });
  });
});
