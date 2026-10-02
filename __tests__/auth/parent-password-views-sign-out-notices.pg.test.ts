/**
 * Behavioural proof for
 * supabase/migrations/20271002150000_parent_password_views_and_sign_out_notices.sql
 * (Director rulings 2 Oct 2026).
 *
 * The migration is applied VERBATIM with psql onto a throwaway database with
 * minimal stand-ins for auth.uid(), auth.users, profiles, pp_parent_accounts
 * and the helpers it uses. Each check runs as `anon` or `authenticated` with
 * the caller set per transaction, and reads back what PostgreSQL allowed.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20271002150000_parent_password_views_and_sign_out_notices.sql'
);
const PGHOST = process.env.REVOKE_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.REVOKE_TEST_PGPORT ?? '5432';
const PGUSER = process.env.REVOKE_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `pw_views_notices_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const SUPER = '00000000-0000-4000-8000-0000000000a1';
const ADMIN = '00000000-0000-4000-8000-0000000000a2';
const MEMBER = '00000000-0000-4000-8000-0000000000b1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const PARENT_ACCOUNT = '00000000-0000-4000-8000-0000000000c1';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Supabase's default: anon and authenticated get ALL on new tables in public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES ('${SUPER}'), ('${ADMIN}'), ('${MEMBER}'), ('${OTHER}');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_super_admin boolean, role text);
INSERT INTO public.profiles VALUES ('${SUPER}', true, 'super_admin'), ('${ADMIN}', false, 'admin'),
  ('${MEMBER}', false, 'faculty'), ('${OTHER}', null, 'faculty');
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false) $$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE public.pp_parent_accounts (id uuid PRIMARY KEY);
INSERT INTO public.pp_parent_accounts VALUES ('${PARENT_ACCOUNT}');
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

/** Run one statement as `role` with auth.uid() = uid; returns rows or the error message. */
async function as(role: 'anon' | 'authenticated' | 'service_role', uid: string | null, sql: string, params: unknown[] = []) {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('test.uid', $1, true)`, [uid ?? '']);
    await client.query(`SET LOCAL ROLE ${role}`);
    const r = await client.query(sql, params);
    await client.query('COMMIT');
    return { rows: r.rows as Record<string, unknown>[], rowCount: r.rowCount ?? 0, error: null as string | null };
  } catch (e) {
    await client.query('ROLLBACK');
    return { rows: [], rowCount: 0, error: (e as Error).message };
  }
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
  await client.query(`TRUNCATE public.pp_parent_password_views, public.sign_out_notices`);
  await client.query(
    `INSERT INTO public.pp_parent_password_views (account_id, viewed_by, result) VALUES ($1, $2, 'shown')`,
    [PARENT_ACCOUNT, SUPER]
  );
  await client.query(
    `INSERT INTO public.sign_out_notices (user_id, signed_out_by) VALUES ($1, $3), ($2, $3)`,
    [MEMBER, OTHER, SUPER]
  );
  await client.query(
    `INSERT INTO public.sign_out_notices (parent_account_id, signed_out_by) VALUES ($1, $2)`,
    [PARENT_ACCOUNT, SUPER]
  );
});

describe('pp_parent_password_views — super admins only', () => {
  it('a super admin can read the view log', async () => {
    const r = await as('authenticated', SUPER, `SELECT result FROM public.pp_parent_password_views`);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ result: 'shown' }]);
  });

  it('an admin (not a super admin) sees nothing', async () => {
    const r = await as('authenticated', ADMIN, `SELECT * FROM public.pp_parent_password_views`);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(0);
  });

  it('signed-in users cannot write a view row, not even a super admin (service role only)', async () => {
    const r = await as(
      'authenticated',
      SUPER,
      `INSERT INTO public.pp_parent_password_views (account_id, viewed_by, result) VALUES ($1, $2, 'shown')`,
      [PARENT_ACCOUNT, SUPER]
    );
    expect(r.error).toMatch(/permission denied/);
  });

  it('anon has no access at all', async () => {
    const r = await as('anon', null, `SELECT * FROM public.pp_parent_password_views`);
    expect(r.error).toMatch(/permission denied/);
  });

  it('only the two results are accepted', async () => {
    await expect(
      client.query(
        `INSERT INTO public.pp_parent_password_views (account_id, viewed_by, result) VALUES ($1, $2, 'the-password')`,
        [PARENT_ACCOUNT, SUPER]
      )
    ).rejects.toThrow(/check constraint/);
  });

  it('the service role can write a view row', async () => {
    const r = await as(
      'service_role',
      null,
      `INSERT INTO public.pp_parent_password_views (account_id, viewed_by, result) VALUES ($1, $2, 'changed_by_parent')`,
      [PARENT_ACCOUNT, SUPER]
    );
    expect(r.error).toBeNull();
  });
});

describe('sign_out_notices — own rows only, seen_at only', () => {
  it('a person sees only their own notice (not another person, not a parent row)', async () => {
    const r = await as('authenticated', MEMBER, `SELECT user_id FROM public.sign_out_notices`);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ user_id: MEMBER }]);
  });

  it('a person can mark their own notice seen', async () => {
    const r = await as(
      'authenticated',
      MEMBER,
      `UPDATE public.sign_out_notices SET seen_at = now() WHERE user_id = $1`,
      [MEMBER]
    );
    expect(r.error).toBeNull();
    expect(r.rowCount).toBe(1);
  });

  it("marking someone else's notice touches nothing", async () => {
    const r = await as('authenticated', MEMBER, `UPDATE public.sign_out_notices SET seen_at = now() WHERE user_id = $1`, [
      OTHER,
    ]);
    expect(r.error).toBeNull();
    expect(r.rowCount).toBe(0);
  });

  it('no other column can be changed (e.g. moving the date or the target)', async () => {
    const r1 = await as('authenticated', MEMBER, `UPDATE public.sign_out_notices SET signed_out_at = now() WHERE user_id = $1`, [
      MEMBER,
    ]);
    expect(r1.error).toMatch(/permission denied/);
    const r2 = await as('authenticated', MEMBER, `UPDATE public.sign_out_notices SET user_id = $2 WHERE user_id = $1`, [
      MEMBER,
      OTHER,
    ]);
    expect(r2.error).toMatch(/permission denied/);
  });

  it('signed-in users cannot add or delete notices', async () => {
    const ins = await as(
      'authenticated',
      MEMBER,
      `INSERT INTO public.sign_out_notices (user_id, signed_out_by) VALUES ($1, $1)`,
      [MEMBER]
    );
    expect(ins.error).toMatch(/permission denied/);
    const del = await as('authenticated', MEMBER, `DELETE FROM public.sign_out_notices WHERE user_id = $1`, [MEMBER]);
    expect(del.error).toMatch(/permission denied/);
  });

  it('anon has no access at all', async () => {
    const r = await as('anon', null, `SELECT * FROM public.sign_out_notices`);
    expect(r.error).toMatch(/permission denied/);
  });

  it('exactly one target: a person OR a parent account', async () => {
    await expect(
      client.query(`INSERT INTO public.sign_out_notices (signed_out_by) VALUES ($1)`, [SUPER])
    ).rejects.toThrow(/sign_out_notices_one_target/);
    await expect(
      client.query(
        `INSERT INTO public.sign_out_notices (user_id, parent_account_id, signed_out_by) VALUES ($1, $2, $3)`,
        [MEMBER, PARENT_ACCOUNT, SUPER]
      )
    ).rejects.toThrow(/sign_out_notices_one_target/);
  });
});
