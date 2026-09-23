/**
 * supabase/migrations/20270301090000_ai_tool_catalog.sql, applied VERBATIM to a
 * throwaway PostgreSQL, then exercised as real signed-in callers (SET ROLE
 * authenticated + request.jwt.claim.sub, the way PostgREST does it).
 *
 * Proves the rules the page and the door rely on:
 *   personal keys — only with ai_query.view · at most 3 working · at most 90
 *   days · list never carries the secret · revoke only your own · the stored
 *   hash is SHA-256 of the plaintext exactly as Node computes it · a personal
 *   row cannot be edited into a read/write key (the CHECK)
 *   the menu — door never lists is_write · door is empty without
 *   ai_query.view · requires_permission is honoured · anon can run nothing and
 *   nobody reads the table directly.
 *
 * REQUIRES a PostgreSQL (CI's postgres:16 service; locally
 * `brew services start postgresql@16`). Fails loudly rather than skipping.
 * Override with AI_DOOR_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270301090000_ai_tool_catalog.sql');

const PGHOST = process.env.AI_DOOR_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.AI_DOOR_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.AI_DOOR_TEST_PGUSER ?? (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.AI_DOOR_TEST_PGPASSWORD;
const DBNAME = `ai_door_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const A = 'aaaaaaaa-0000-4000-8000-000000000001'; // holds ai_query.view
const B = 'bbbbbbbb-0000-4000-8000-000000000002'; // does not
const S = 'cccccccc-0000-4000-8000-000000000003'; // super admin, no permission row

const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Supabase grants EXECUTE on new functions to anon by default; reproduced so the
-- migration's REVOKE has something real to revoke.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
GRANT USAGE ON SCHEMA auth, extensions, public TO anon, authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, institution_id uuid, is_super_admin boolean DEFAULT false);
CREATE TABLE public.test_perms (user_id uuid, key text);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $f$ SELECT COALESCE((SELECT is_super_admin FROM profiles WHERE id = auth.uid()), false) $f$;
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $f$ SELECT EXISTS (SELECT 1 FROM test_perms WHERE user_id = auth.uid() AND key = permission_name) $f$;
-- api_keys as supabase/setup/01_tables.sql + 20260306_mcp_user_bound_api_keys + institution_id
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key_value VARCHAR(255) NOT NULL,
  created_by UUID,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{"read": true, "write": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  institution_id uuid,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT CHECK (user_role IN ('student', 'faculty', 'admin', 'super_admin')),
  department_id UUID
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
INSERT INTO public.api_keys (name, key_value) VALUES ('legacy admin key', 'legacy-hash');
INSERT INTO auth.users VALUES ('${A}'), ('${B}'), ('${S}');
INSERT INTO public.profiles VALUES ('${A}', 'dddddddd-0000-4000-8000-000000000004', false), ('${B}', NULL, false), ('${S}', NULL, true);
INSERT INTO public.test_perms VALUES ('${A}', 'ai_query.view');
`;

let admin: Client;
let db: Client;
let adminConnected = false;
let dbConnected = false;
const migrationSql = readFileSync(MIGRATION, 'utf8');

/** Stand-ins for the seeded functions — the migration asserts every target exists. */
function stubsFor(sql: string): string {
  const targets = [...new Set([...sql.matchAll(/'rpc', '(ai_rpc_[a-z0-9_]+)'/g)].map((m) => m[1]))];
  return targets
    .map((t) => `CREATE FUNCTION public.${t}() RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$;`)
    .join('\n');
}

async function as<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  await db.query('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.query(uid === null ? 'SET ROLE anon' : 'SET ROLE authenticated');
  try {
    const r = await db.query(sql, params);
    return { rows: r.rows as T[] };
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  } finally {
    await db.query('RESET ROLE');
  }
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
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  dbConnected = true;
  await db.query(SCHEMA);
  await db.query(stubsFor(migrationSql));
  await db.query(migrationSql);
  // a write tool another lane might add, and a permission-gated tool
  await db.query(`INSERT INTO public.ai_tool_catalog (name, kind, target, description, is_write)
                  VALUES ('zz_write_probe', 'rpc', 'ai_rpc_courses', 'probe', true)`);
  await db.query(`INSERT INTO public.ai_tool_catalog (name, kind, target, description, requires_permission)
                  VALUES ('zz_gated_probe', 'rpc', 'ai_rpc_courses', 'probe', 'billing.view')`);
}, 60_000);

afterAll(async () => {
  if (dbConnected) await db.end();
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME}`);
    await admin.end();
  }
});

describe('migration', () => {
  it('applies twice (idempotent) and seeds 61 read-only tools, none of them excluded', async () => {
    await db.query(migrationSql);
    const r = await db.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE is_write)::int AS writes
         FROM public.ai_tool_catalog WHERE name NOT LIKE 'zz_%'`
    );
    expect(r.rows[0]).toEqual({ n: 61, writes: 0 });
    const excluded = await db.query(
      `SELECT count(*)::int AS n FROM public.ai_tool_catalog
        WHERE target IN ('ai_rpc_send_notification','ai_rpc_bulk_notification','ai_rpc_mark_notification_read',
                         'ai_rpc_push_subscriptions','ai_rpc_users','ai_rpc_user_roles','ai_rpc_custom_roles',
                         'ai_rpc_institution_access','ai_rpc_validate_permission')`
    );
    expect(excluded.rows[0].n).toBe(0);
  });

  it('leaves the existing admin key as an admin key', async () => {
    const r = await db.query(`SELECT key_kind FROM public.api_keys WHERE name = 'legacy admin key'`);
    expect(r.rows[0].key_kind).toBe('admin');
  });
});

describe('who can run what', () => {
  it('anon can run none of the new functions and cannot read the catalog', async () => {
    for (const sql of [
      `SELECT public.fn_ai_tool_menu('door')`,
      `SELECT public.fn_ai_personal_key_create('x', 10)`,
      `SELECT public.fn_ai_personal_key_list()`,
      `SELECT public.fn_ai_personal_key_revoke(gen_random_uuid())`,
      `SELECT count(*) FROM public.ai_tool_catalog`,
    ]) {
      const r = await as(null, sql);
      expect(r.error, sql).toMatch(/permission denied/);
    }
  });

  it('a signed-in person cannot read the catalog table directly', async () => {
    const r = await as(A, `SELECT count(*) FROM public.ai_tool_catalog`);
    expect(r.error).toMatch(/permission denied/);
  });
});

describe('fn_ai_tool_menu', () => {
  it('assistant sees the write probe; door never does', async () => {
    const assistant = await as(A, `SELECT public.fn_ai_tool_menu('assistant') AS m`);
    const door = await as(A, `SELECT public.fn_ai_tool_menu('door') AS m`);
    const names = (rows: any[]) => (rows[0].m as Array<{ name: string }>).map((t) => t.name);
    expect(names(assistant.rows)).toContain('zz_write_probe');
    expect(names(door.rows)).not.toContain('zz_write_probe');
    expect((door.rows[0].m as Array<{ is_write: boolean }>).every((t) => t.is_write === false)).toBe(true);
    expect(names(door.rows)).toHaveLength(61);
  });

  it('honours requires_permission, with the super-admin bypass', async () => {
    const a = await as(A, `SELECT public.fn_ai_tool_menu('assistant') @> '[{"name":"zz_gated_probe"}]' AS has`);
    const s = await as(S, `SELECT public.fn_ai_tool_menu('door') @> '[{"name":"zz_gated_probe"}]' AS has`);
    expect(a.rows[0].has).toBe(false);
    expect(s.rows[0].has).toBe(true);
  });

  it('door is empty for a person without ai_query.view', async () => {
    const r = await as(B, `SELECT public.fn_ai_tool_menu('door') AS m`);
    expect(r.rows[0].m).toEqual([]);
  });

  it('refuses an unknown audience', async () => {
    const r = await as(A, `SELECT public.fn_ai_tool_menu('everyone')`);
    expect(r.error).toMatch(/Unknown audience/);
  });
});

describe('personal keys', () => {
  it('only a person with ai_query.view can make one', async () => {
    const r = await as(B, `SELECT public.fn_ai_personal_key_create('b', 10)`);
    expect(r.error).toMatch(/need access to the AI Assistant/);
  });

  it('at most 90 days', async () => {
    const r = await as(A, `SELECT public.fn_ai_personal_key_create('too long', 91)`);
    expect(r.error).toMatch(/between 1 and 90 days/);
  });

  it('stores only the SHA-256 of the key, exactly as Node hashes it, and returns the plaintext once', async () => {
    const r = await as(S, `SELECT public.fn_ai_personal_key_create('hash probe', 5) AS k`);
    const plain = r.rows[0].k.key as string;
    expect(plain).toMatch(/^jkkn_pk_[0-9a-f]{48}$/);
    const stored = await db.query(`SELECT key_value, expires_at - created_at AS life FROM public.api_keys WHERE id = $1`, [
      r.rows[0].k.id,
    ]);
    expect(stored.rows[0].key_value).toBe(createHash('sha256').update(plain).digest('hex'));
    expect(stored.rows[0].key_value).not.toContain('jkkn_pk_');
  });

  it('at most 3 working keys; turning one off frees a slot', async () => {
    for (const n of ['one', 'two', 'three']) {
      const r = await as(A, `SELECT public.fn_ai_personal_key_create($1, 90) AS k`, [n]);
      expect(r.error, n).toBeUndefined();
    }
    const fourth = await as(A, `SELECT public.fn_ai_personal_key_create('four', 90)`);
    expect(fourth.error).toMatch(/already have 3 working keys/);

    const one = await db.query(`SELECT id FROM public.api_keys WHERE name = 'one' AND user_id = $1`, [A]);
    const off = await as(A, `SELECT public.fn_ai_personal_key_revoke($1) AS r`, [one.rows[0].id]);
    expect(off.rows[0].r.status).toBe('turned_off');

    const again = await as(A, `SELECT public.fn_ai_personal_key_create('four', 90) AS k`);
    expect(again.error).toBeUndefined();
  });

  it('an expired key does not count toward the 3', async () => {
    const t = await db.query(`SELECT id FROM public.api_keys WHERE name = 'two' AND user_id = $1`, [A]);
    // age the key: both timestamps move back together, so the 90-day CHECK still holds
    await db.query(
      `UPDATE public.api_keys SET created_at = now() - interval '100 days', expires_at = now() - interval '10 days' WHERE id = $1`,
      [t.rows[0].id]
    );
    const r = await as(A, `SELECT public.fn_ai_personal_key_create('five', 30) AS k`);
    expect(r.error).toBeUndefined();
  });

  it('list shows only your own keys, with status, and never the secret or its hash', async () => {
    const a = await as(A, `SELECT public.fn_ai_personal_key_list() AS l`);
    const list = a.rows[0].l as Array<Record<string, unknown>>;
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(new Set(list.map((k) => k.status))).toEqual(new Set(['working', 'turned_off', 'expired']));
    const text = JSON.stringify(list);
    expect(text).not.toMatch(/key_value|jkkn_pk_/);
    for (const k of list) expect(Object.keys(k).sort()).toEqual(['created_at', 'expires_at', 'id', 'last_used_at', 'name', 'status']);

    const b = await as(B, `SELECT public.fn_ai_personal_key_list() AS l`);
    expect(b.rows[0].l).toEqual([]);
  });

  it('nobody can turn off somebody else’s key', async () => {
    const k = await db.query(`SELECT id FROM public.api_keys WHERE name = 'three' AND user_id = $1`, [A]);
    const r = await as(B, `SELECT public.fn_ai_personal_key_revoke($1)`, [k.rows[0].id]);
    expect(r.error).toMatch(/Key not found/);
    const still = await db.query(`SELECT is_active FROM public.api_keys WHERE id = $1`, [k.rows[0].id]);
    expect(still.rows[0].is_active).toBe(true);
  });

  it('revoke cannot touch an administrator key', async () => {
    const k = await db.query(`SELECT id FROM public.api_keys WHERE name = 'legacy admin key'`);
    const r = await as(S, `SELECT public.fn_ai_personal_key_revoke($1)`, [k.rows[0].id]);
    expect(r.error).toMatch(/Key not found/);
  });

  it('deleting the owner’s account still works (user_id is ON DELETE SET NULL) and leaves a dead key', async () => {
    const D = 'eeeeeeee-0000-4000-8000-000000000005';
    await db.query(`INSERT INTO auth.users VALUES ($1)`, [D]);
    await db.query(`INSERT INTO public.profiles VALUES ($1, NULL, false)`, [D]);
    await db.query(`INSERT INTO public.test_perms VALUES ($1, 'ai_query.view')`, [D]);
    const made = await as(D, `SELECT public.fn_ai_personal_key_create('leaver', 30) AS k`);
    expect(made.error).toBeUndefined();
    await expect(db.query(`DELETE FROM auth.users WHERE id = $1`, [D])).resolves.toBeDefined();
    const row = await db.query(`SELECT user_id, permissions FROM public.api_keys WHERE id = $1`, [made.rows[0].k.id]);
    expect(row.rows[0].user_id).toBeNull();
    expect(row.rows[0].permissions).toEqual({ read: false, write: false });
  });

  it('a personal row can never become a read/write key or outlive 90 days (CHECK)', async () => {
    const k = await db.query(`SELECT id FROM public.api_keys WHERE name = 'three' AND user_id = $1`, [A]);
    await expect(
      db.query(`UPDATE public.api_keys SET permissions = '{"read": true, "write": false}' WHERE id = $1`, [k.rows[0].id])
    ).rejects.toThrow(/api_keys_personal_shape_check/);
    await expect(
      db.query(`UPDATE public.api_keys SET expires_at = created_at + interval '91 days' WHERE id = $1`, [k.rows[0].id])
    ).rejects.toThrow(/api_keys_personal_shape_check/);
    await expect(
      db.query(`INSERT INTO public.api_keys (name, key_value, key_kind, permissions) VALUES ('forged', 'x', 'personal', '{"read": false, "write": false}')`)
    ).rejects.toThrow(/api_keys_personal_shape_check/);
  });
});
