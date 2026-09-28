/**
 * Behavioural proof for supabase/migrations/20260901103634_ims_unit_conversions_rls_allow_global.sql.
 *
 * That file was applied to production on 2026-09-01 by hand and never committed
 * (production had a fix main did not). It is recorded here byte-for-byte from the
 * production ledger (supabase_migrations.schema_migrations.statements, md5
 * cb78c493f2fd252c88f2f44b67c5e588; the live ims_unit_conversion_in_scope body
 * matches it, read 2026-09-28). The ship wave skips a version already in the
 * ledger, so committing it changes nothing live.
 *
 * The bug it fixed: every ims_unit_conversions policy scoped the row through its
 * ITEM, and item_id is nullable (a store-wide or global conversion), so a
 * store-scoped insert by anyone but a super admin was always refused with
 * "new row violates row-level security policy".
 *
 * The file is applied VERBATIM with psql onto a throwaway database and the table
 * is used as `authenticated` / `anon`, with the college set and role the
 * production helpers would report.
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20260901103634_ims_unit_conversions_rls_allow_global.sql');
const PGHOST = process.env.IMS_UC_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.IMS_UC_TEST_PGPORT ?? '5432';
const PGUSER = process.env.IMS_UC_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `ims_uc_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const OWN = '00000000-0000-4000-8000-00000000e001';
const OTHER = '00000000-0000-4000-8000-00000000e002';
const STORE_OWN = '00000000-0000-4000-8000-00000000e011';
const STORE_OTHER = '00000000-0000-4000-8000-00000000e012';
const ITEM_OWN = '00000000-0000-4000-8000-00000000e021';
const UNIT_A = '00000000-0000-4000-8000-00000000e031';
const UNIT_B = '00000000-0000-4000-8000-00000000e032';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Stand-ins for the production helpers the migration calls, answering from test settings.
CREATE FUNCTION public.get_current_user_role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.role', true), '') $$;
CREATE FUNCTION public.ims_accessible_institution_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  SELECT unnest(string_to_array(nullif(current_setting('test.insts', true), ''), ',')::uuid[]) $$;
GRANT EXECUTE ON FUNCTION public.get_current_user_role(), public.ims_accessible_institution_ids() TO authenticated;
CREATE TABLE public.ims_items  (id uuid PRIMARY KEY, institution_id uuid);
CREATE TABLE public.ims_stores (id uuid PRIMARY KEY, institution_id uuid);
-- Production's columns (information_schema, 2026-09-28).
CREATE TABLE public.ims_unit_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.ims_items(id),
  from_unit_id uuid NOT NULL, to_unit_id uuid NOT NULL,
  conversion_factor numeric NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  store_id uuid REFERENCES public.ims_stores(id));
GRANT SELECT ON public.ims_items, public.ims_stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ims_unit_conversions TO anon, authenticated;
INSERT INTO public.ims_items  VALUES ('${ITEM_OWN}', '${OWN}');
INSERT INTO public.ims_stores VALUES ('${STORE_OWN}', '${OWN}'), ('${STORE_OTHER}', '${OTHER}');
`;

// The pre-fix INSERT rule (20260226_fix_ims_rls_policies.sql shape): scoped through the ITEM only.
const PRE_FIX_INSERT = `
DROP POLICY "ims_unit_conversions_insert" ON public.ims_unit_conversions;
CREATE POLICY "ims_unit_conversions_insert" ON public.ims_unit_conversions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ims_items i WHERE i.id = item_id
    AND (i.institution_id IN (SELECT public.ims_accessible_institution_ids())
         OR (SELECT public.get_current_user_role()) = 'super_admin')));`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

/** Run `sql` as a role in a transaction that is ALWAYS rolled back; `setup` runs first as the owner. */
async function as(who: { role?: string; appRole?: string; insts?: string[] }, sql: string, setup = '') {
  await client.query('BEGIN');
  try {
    if (setup) await client.query(setup);
    await client.query(`SELECT set_config('test.role', $1, true), set_config('test.insts', $2, true)`,
      [who.appRole ?? 'hod', (who.insts ?? []).join(',')]);
    await client.query(`SET LOCAL ROLE ${who.role ?? 'authenticated'}`);
    const r = await client.query(sql);
    return { rows: r.rows, error: null as string | null };
  } catch (e) {
    return { rows: [] as Record<string, unknown>[], error: (e as Error).message };
  } finally {
    await client.query('ROLLBACK');
  }
}

const insert = (item: string | null, store: string | null) =>
  `INSERT INTO public.ims_unit_conversions (item_id, store_id, from_unit_id, to_unit_id, conversion_factor)
   VALUES (${item ? `'${item}'` : 'NULL'}, ${store ? `'${store}'` : 'NULL'}, '${UNIT_A}', '${UNIT_B}', 12) RETURNING id`;
const RLS = /row-level security/;
const MEMBER = { insts: [OWN] };

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
  await client.query(`INSERT INTO public.ims_unit_conversions (item_id, store_id, from_unit_id, to_unit_id, conversion_factor) VALUES
    (NULL, NULL, '${UNIT_A}', '${UNIT_B}', 1000),
    (NULL, '${STORE_OWN}', '${UNIT_A}', '${UNIT_B}', 10),
    (NULL, '${STORE_OTHER}', '${UNIT_A}', '${UNIT_B}', 20)`);
});
afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('ims_unit_conversions RLS — a store-scoped conversion is allowed (20260901103634)', () => {
  it('a store-scoped insert by a non-super-admin at their own college SUCCEEDS', async () => {
    const r = await as(MEMBER, insert(null, STORE_OWN));
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(1);
  });

  it('non-vacuity: under the pre-fix item-only rule the same insert is REFUSED', async () => {
    const r = await as(MEMBER, insert(null, STORE_OWN), PRE_FIX_INSERT);
    expect(r.error).toMatch(RLS);
  });

  it("a store-scoped insert for ANOTHER college's store is refused", async () => {
    const r = await as(MEMBER, insert(null, STORE_OTHER));
    expect(r.error).toMatch(RLS);
  });

  it('an item-scoped insert at their own college still succeeds', async () => {
    const r = await as(MEMBER, insert(ITEM_OWN, null));
    expect(r.error).toBeNull();
  });

  it('a global conversion (no item, no store) can be created by a super admin only', async () => {
    expect((await as(MEMBER, insert(null, null))).error).toMatch(RLS);
    expect((await as({ appRole: 'super_admin' }, insert(null, null))).error).toBeNull();
  });

  it('a non-super-admin reads global rows and their own store, not another college\'s store', async () => {
    const r = await as(MEMBER, 'SELECT conversion_factor::int AS f FROM public.ims_unit_conversions ORDER BY 1');
    expect(r.error).toBeNull();
    expect(r.rows.map((x) => x.f)).toEqual([10, 1000]);
  });

  it("an update cannot move a row into another college's store", async () => {
    const r = await as(MEMBER,
      `UPDATE public.ims_unit_conversions SET store_id = '${STORE_OTHER}' WHERE store_id = '${STORE_OWN}' RETURNING id`);
    expect(r.error).toMatch(RLS);
  });

  it('a signed-out caller reads nothing (anon is revoked)', async () => {
    const r = await as({ role: 'anon' }, 'SELECT count(*) FROM public.ims_unit_conversions');
    expect(r.error).toMatch(/permission denied/);
  });
});
