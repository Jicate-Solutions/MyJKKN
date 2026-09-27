/**
 * Behavioural proof for supabase/migrations/20270330090000_institution_department_contacts.sql
 * (BUG-003313). The file is applied VERBATIM with psql onto a throwaway database;
 * every read and write below is made as `authenticated` (or `anon`), with the
 * caller's super-admin flag and permissions set the way the production helpers
 * report them, and the suite reads back what PostgreSQL actually allowed.
 *
 * Contacts carry people's email and mobile, so they get narrower rules than the
 * institutions row (Director, 27 Sep 06:47: "visible to staff of that college,
 * editable only by college editors"):
 *   read  = super admin, or an active STAFF record (or the edit key) with access to THAT institution
 *   write = super admin, or organizations.institutions.edit AND access to THAT institution
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270330090000_institution_department_contacts.sql');
const PGHOST = process.env.CONTACTS_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.CONTACTS_TEST_PGPORT ?? '5432';
const PGUSER = process.env.CONTACTS_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `inst_contacts_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
const INST = '00000000-0000-4000-8000-00000000c001';
const OTHER = '00000000-0000-4000-8000-00000000c002';
const UID = '00000000-0000-4000-8000-000000000011';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Supabase's default: anon and authenticated get table privileges on new tables.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
-- The production helpers, driven by per-session settings.
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.super', true), '')::boolean, false) $$;
CREATE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p = ANY (string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;
-- role_has_institution_access: the institutions the caller's roles reach (own
-- college, CAS sibling, all-colleges role), as a comma list per session.
CREATE FUNCTION public.role_has_institution_access(i uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT i::text = ANY (string_to_array(coalesce(current_setting('test.insts', true), ''), ',')) $$;
GRANT EXECUTE ON FUNCTION public.is_super_admin(), public.user_has_permission(text),
  public.role_has_institution_access(uuid) TO anon, authenticated;
-- fn_my_staff_ids: the caller's ACTIVE staff records (production: public.staff
-- WHERE profile_id = auth.uid() AND is_active), as a comma list per session.
CREATE FUNCTION public.fn_my_staff_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_to_array(nullif(current_setting('test.staff', true), ''), ',')::uuid[], ARRAY[]::uuid[]) $$;
GRANT EXECUTE ON FUNCTION public.fn_my_staff_ids() TO anon, authenticated;
CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text);
INSERT INTO public.institutions VALUES ('${INST}', 'JKKN Test College'), ('${OTHER}', 'JKKN Other College');
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

/** Run `sql` as a caller; returns rows, or the error message. */
async function as(
  who: { role?: string; super?: boolean; perms?: string[]; insts?: string[]; staff?: boolean },
  sql: string,
  params: unknown[] = []
) {
  await client.query('BEGIN');
  try {
    await client.query(
      `SELECT set_config('test.uid', $1, true), set_config('test.super', $2, true),
              set_config('test.perms', $3, true), set_config('test.insts', $4, true),
              set_config('test.staff', $5, true)`,
      [UID, String(!!who.super), (who.perms ?? []).join(','), (who.insts ?? []).join(','),
       who.staff ? '00000000-0000-4000-8000-0000000005f1' : '']
    );
    await client.query(`SET LOCAL ROLE ${who.role ?? 'authenticated'}`);
    const r = await client.query(sql, params);
    await client.query('COMMIT');
    return { rows: r.rows, count: r.rowCount ?? 0, error: null as string | null };
  } catch (e) {
    await client.query('ROLLBACK');
    return { rows: [], count: 0, error: (e as Error).message };
  }
}

const insertContact = (type: string, name = 'Priya', inst = INST) =>
  `INSERT INTO public.institution_departments (institution_id, department_type, contact_name, email, mobile)
   VALUES ('${inst}', '${type}', '${name}', 'x@jkkn.ac.in', '9800000000')
   ON CONFLICT (institution_id, department_type) DO UPDATE SET contact_name = EXCLUDED.contact_name`;

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

describe('institution_departments — who may save and see contacts', () => {
  it('a super admin can save a contact and edit it again (one row per type)', async () => {
    expect((await as({ super: true }, insertContact('accounts'))).error).toBeNull();
    expect((await as({ super: true }, insertContact('accounts', 'Priya R'))).error).toBeNull();
    const r = await as({ super: true }, `SELECT contact_name FROM public.institution_departments WHERE department_type = 'accounts'`);
    expect(r.rows).toEqual([{ contact_name: 'Priya R' }]);
  });

  const EDITOR = { perms: ['organizations.institutions.edit'], insts: [INST] };
  const STAFF = { insts: [INST], staff: true };

  it("an editor of THIS college can save and edit its contact", async () => {
    expect((await as(EDITOR, insertContact('admission'))).error).toBeNull();
    expect((await as(EDITOR, insertContact('admission', 'Priya K'))).error).toBeNull();
  });

  it("the edit key alone is not enough: an editor cannot write ANOTHER college's contacts", async () => {
    expect((await as(EDITOR, insertContact('admission', 'X', OTHER))).error).toMatch(/row-level security/);
    await as({ super: true }, insertContact('placement', 'Other Priya', OTHER));
    const upd = await as(EDITOR, `UPDATE public.institution_departments SET mobile = '0' WHERE institution_id = '${OTHER}' RETURNING id`);
    expect(upd.count).toBe(0);
    const del = await as(EDITOR, `DELETE FROM public.institution_departments WHERE institution_id = '${OTHER}' RETURNING id`);
    expect(del.count).toBe(0);
  });

  it("staff of the college see its contacts but not another college's, and cannot write", async () => {
    const mine = await as(STAFF, `SELECT count(*)::int n FROM public.institution_departments WHERE institution_id = '${INST}'`);
    expect(mine.rows[0].n).toBeGreaterThan(0);
    const theirs = await as(STAFF, `SELECT count(*)::int n FROM public.institution_departments WHERE institution_id = '${OTHER}'`);
    expect(theirs.rows[0].n).toBe(0);
    expect((await as(STAFF, insertContact('placement'))).error).toMatch(/row-level security/);
    // A global view key does not widen reading to other colleges.
    const viewKey = await as({ perms: ['organizations.institutions.view'], insts: [INST], staff: true },
      `SELECT count(*)::int n FROM public.institution_departments WHERE institution_id = '${OTHER}'`);
    expect(viewKey.rows[0].n).toBe(0);
  });

  it("a student of the college sees no contact — even with NO learner link (a missing link is not proof of staff)", async () => {
    // Production, 27 Sep: 270 student profiles have learner_id NULL. College
    // access alone, without an active staff record, must not reveal contacts.
    const r = await as({ insts: [INST] }, `SELECT count(*)::int n FROM public.institution_departments`);
    expect(r.rows[0].n).toBe(0);
  });

  it('an ordinary signed-in user with no college access sees no contact and cannot write one', async () => {
    const read = await as({}, `SELECT count(*)::int n FROM public.institution_departments`);
    expect(read.rows[0].n).toBe(0);
    expect((await as({}, insertContact('transportation'))).error).toMatch(/row-level security/);
    const upd = await as({}, `UPDATE public.institution_departments SET mobile = '0' RETURNING id`);
    expect(upd.count).toBe(0);
    const del = await as({}, `DELETE FROM public.institution_departments RETURNING id`);
    expect(del.count).toBe(0);
  });

  it('anon has no access at all', async () => {
    expect((await as({ role: 'anon', super: true }, `SELECT 1 FROM public.institution_departments`)).error).toMatch(/permission denied/);
  });

  it('refuses a blank name and an unknown department type', async () => {
    expect((await as({ super: true }, insertContact('accounts', '  '))).error).toMatch(/check constraint/);
    expect((await as({ super: true }, insertContact('canteen'))).error).toMatch(/check constraint/);
  });

  it('contacts go when their institution is deleted', async () => {
    await client.query(`DELETE FROM public.institutions WHERE id = '${INST}'`);
    const r = await client.query(`SELECT count(*)::int n FROM public.institution_departments WHERE institution_id = '${INST}'`);
    expect(r.rows[0].n).toBe(0);
    const other = await client.query(`SELECT count(*)::int n FROM public.institution_departments WHERE institution_id = '${OTHER}'`);
    expect(other.rows[0].n).toBe(1);
  });
});
