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
 *   the menu — door never lists is_write · BOTH audiences are empty without
 *   ai_query.view · requires_permission is honoured · anon can run nothing and
 *   nobody reads the table directly
 *   repair round 1 — the 13 always-failing tools are off · export_data is
 *   assistant-only · permission keys are filled from the config · the freeze
 *   trigger stops an owner (even with the update_own / insert_own policies
 *   that supabase/setup/03_policies.sql declares) and an administrator from
 *   re-kinding, re-enabling or extending a personal key.
 *   repair round 2 — the administrator API Keys screen (which writes as the
 *   role authenticated, through the admin's cookie session) can still rename
 *   a personal key and turn it off, but cannot re-kind, re-enable or extend it.
 *
 * REQUIRES a PostgreSQL (CI's postgres:16 service; locally
 * `brew services start postgresql@16`). Fails loudly rather than skipping.
 * Lives OUTSIDE __tests__/lib/ on purpose: the required "lib unit tests pass"
 * job (lib-unit-suite.yml) runs __tests__/lib/ with no database, while
 * test-suite.yml's gated subset runs everything else with a postgres:16
 * service — the same home as the other *.pg.test.ts files.
 * Override with AI_DOOR_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
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
                  VALUES ('zz_write_probe', 'rpc', 'ai_rpc_transport', 'probe', true)`);
  await db.query(`INSERT INTO public.ai_tool_catalog (name, kind, target, description, requires_permission)
                  VALUES ('zz_gated_probe', 'rpc', 'ai_rpc_transport', 'probe', 'billing.view')`);
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
    // 61 seeded − 13 turned off − export_data (assistant only) − the 19
    // enabled tools that need a permission key A does not hold
    expect(names(door.rows)).toHaveLength(28);
  });

  it('a super admin sees every working door tool: 61 − 13 off − export_data = 47', async () => {
    const door = await as(S, `SELECT public.fn_ai_tool_menu('door') AS m`);
    const names = (door.rows[0].m as Array<{ name: string }>).map((t) => t.name).filter((n) => !n.startsWith('zz_'));
    expect(names).toHaveLength(47);
    expect(names).not.toContain('export_data');
    const assistant = await as(S, `SELECT public.fn_ai_tool_menu('assistant') AS m`);
    const aNames = (assistant.rows[0].m as Array<{ name: string }>).map((t) => t.name);
    expect(aNames).toContain('export_data');
  });

  it('the 13 always-failing tools are off and appear in no menu', async () => {
    const off = [
      'academic_years', 'attendance_summary', 'bug_report_details', 'courses', 'degrees',
      'faculty_assignments', 'periods', 'staff_details', 'staff_plans', 'timetable_slots',
      'timetables', 'academic_context', 'admission_analytics',
    ];
    const r = await db.query(`SELECT name FROM public.ai_tool_catalog WHERE NOT enabled ORDER BY name`);
    expect(r.rows.map((x) => x.name)).toEqual([...off].sort());
    for (const aud of ['assistant', 'door']) {
      const m = await as(S, `SELECT public.fn_ai_tool_menu($1) AS m`, [aud]);
      const names = (m.rows[0].m as Array<{ name: string }>).map((t) => t.name);
      for (const n of off) expect(names, `${aud}:${n}`).not.toContain(n);
    }
  });

  it('fills requires_permission from the config only where the key exists', async () => {
    const r = await db.query(
      `SELECT name, requires_permission AS p FROM public.ai_tool_catalog
        WHERE name IN ('students_summary','admission_referrers','fee_defaulters','attendance',
                       'departments','hierarchy_summary','kpi_summary','export_data','transport')`
    );
    const got = Object.fromEntries(r.rows.map((x) => [x.name, x.p]));
    expect(got).toEqual({
      students_summary: 'learners.view',
      admission_referrers: 'learners.admissions.dashboard',
      fee_defaulters: 'billing.bills.view',
      attendance: 'academic.attendance.view',
      departments: 'organizations.departments.view',
      hierarchy_summary: null,
      kpi_summary: null,
      export_data: null,
      transport: null,
    });
    const n = await db.query(
      `SELECT count(*)::int AS n FROM public.ai_tool_catalog WHERE requires_permission IS NOT NULL AND name NOT LIKE 'zz_%'`
    );
    expect(n.rows[0].n).toBe(20);
  });

  it('honours requires_permission, with the super-admin bypass', async () => {
    const a = await as(A, `SELECT public.fn_ai_tool_menu('assistant') @> '[{"name":"zz_gated_probe"}]' AS has`);
    const s = await as(S, `SELECT public.fn_ai_tool_menu('door') @> '[{"name":"zz_gated_probe"}]' AS has`);
    expect(a.rows[0].has).toBe(false);
    expect(s.rows[0].has).toBe(true);
  });

  it('both menus are empty for a person without ai_query.view (a learner cannot list the tools)', async () => {
    for (const aud of ['door', 'assistant']) {
      const r = await as(B, `SELECT public.fn_ai_tool_menu($1) AS m`, [aud]);
      expect(r.rows[0].m, aud).toEqual([]);
    }
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
    // expire the key: shortening is the one change to its dates the freeze trigger allows
    await db.query(`UPDATE public.api_keys SET expires_at = now() - interval '1 second' WHERE id = $1`, [t.rows[0].id]);
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

  it('a personal row can never become a read/write key or outlive 90 days (CHECK + freeze trigger)', async () => {
    const k = await db.query(`SELECT id FROM public.api_keys WHERE name = 'three' AND user_id = $1`, [A]);
    await expect(
      db.query(`UPDATE public.api_keys SET permissions = '{"read": true, "write": false}' WHERE id = $1`, [k.rows[0].id])
    ).rejects.toThrow(/cannot be changed, extended or turned back on/);
    await expect(
      db.query(`UPDATE public.api_keys SET expires_at = created_at + interval '91 days' WHERE id = $1`, [k.rows[0].id])
    ).rejects.toThrow(/cannot be changed, extended or turned back on/);
    await expect(
      db.query(`INSERT INTO public.api_keys (name, key_value, key_kind, permissions) VALUES ('forged', 'x', 'personal', '{"read": false, "write": false}')`)
    ).rejects.toThrow(/api_keys_personal_shape_check/);
  });
});

// The superuser here stands in for the service role (no RLS, not the role
// authenticated). The administrator SCREEN path runs as authenticated and is
// proved separately below.
describe('freeze trigger — the service role', () => {
  const pick = async (name: string) =>
    (await db.query(`SELECT id FROM public.api_keys WHERE name = $1 AND user_id = $2`, [name, A])).rows[0].id as string;

  it('cannot re-kind a personal key into an administrator key', async () => {
    const id = await pick('three');
    await expect(
      db.query(`UPDATE public.api_keys SET key_kind = 'admin', permissions = '{"read": true, "write": false}' WHERE id = $1`, [id])
    ).rejects.toThrow(/cannot be changed, extended or turned back on/);
  });

  it('cannot turn a turned-off personal key back on', async () => {
    const id = await pick('one');
    await expect(db.query(`UPDATE public.api_keys SET is_active = true WHERE id = $1`, [id])).rejects.toThrow(
      /cannot be changed, extended or turned back on/
    );
  });

  it('cannot swap the stored secret or move the creation time', async () => {
    const id = await pick('three');
    await expect(db.query(`UPDATE public.api_keys SET key_value = 'other' WHERE id = $1`, [id])).rejects.toThrow(/cannot be changed/);
    await expect(db.query(`UPDATE public.api_keys SET created_at = now() WHERE id = $1`, [id])).rejects.toThrow(/cannot be changed/);
  });

  it('can still rename it, record its last use and turn it off', async () => {
    const id = await pick('three');
    await db.query(`UPDATE public.api_keys SET name = 'three renamed', last_used_at = now() WHERE id = $1`, [id]);
    await db.query(`UPDATE public.api_keys SET is_active = false WHERE id = $1`, [id]);
    const r = await db.query(`SELECT name, is_active FROM public.api_keys WHERE id = $1`, [id]);
    expect(r.rows[0]).toEqual({ name: 'three renamed', is_active: false });
  });

  it('leaves administrator keys alone', async () => {
    await db.query(
      `UPDATE public.api_keys SET permissions = '{"read": true, "write": true}', is_active = true WHERE name = 'legacy admin key'`
    );
    const r = await db.query(`SELECT permissions FROM public.api_keys WHERE name = 'legacy admin key'`);
    expect(r.rows[0].permissions).toEqual({ read: true, write: true });
  });
});

describe('freeze trigger — an owner writing directly (if the *_own policies are live)', () => {
  // supabase/setup/03_policies.sql declares these on user_id = auth.uid().
  // Whether production has them was not confirmed; recreate the worst case.
  beforeAll(async () => {
    await db.query(`GRANT SELECT, INSERT, UPDATE ON public.api_keys TO authenticated`);
    await db.query(`CREATE POLICY api_keys_select_own ON public.api_keys FOR SELECT USING (user_id = auth.uid())`);
    await db.query(`CREATE POLICY api_keys_insert_own ON public.api_keys FOR INSERT WITH CHECK (user_id = auth.uid())`);
    await db.query(
      `CREATE POLICY api_keys_update_own ON public.api_keys FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
    );
  });

  it('cannot flip their personal key into an administrator key with read access', async () => {
    const k = await db.query(`SELECT id FROM public.api_keys WHERE name = 'four' AND user_id = $1 AND is_active`, [A]);
    const r = await as(
      A,
      `UPDATE public.api_keys SET key_kind = 'admin', permissions = '{"read": true, "write": false}' WHERE id = $1`,
      [k.rows[0].id]
    );
    expect(r.error).toMatch(/cannot be changed, extended or turned back on/);
    const still = await db.query(`SELECT key_kind, permissions FROM public.api_keys WHERE id = $1`, [k.rows[0].id]);
    expect(still.rows[0]).toEqual({ key_kind: 'personal', permissions: { read: false, write: false } });
  });

  it('cannot turn a turned-off key back on', async () => {
    const off = await db.query(`SELECT id FROM public.api_keys WHERE name = 'one' AND user_id = $1`, [A]);
    const r = await as(A, `UPDATE public.api_keys SET is_active = true WHERE id = $1`, [off.rows[0].id]);
    expect(r.error).toMatch(/cannot be changed, extended or turned back on/);
  });

  it('cannot push the end date past what it was', async () => {
    const k = await db.query(`SELECT id FROM public.api_keys WHERE name = 'four' AND user_id = $1 AND is_active`, [A]);
    const r = await as(A, `UPDATE public.api_keys SET expires_at = expires_at + interval '1 day' WHERE id = $1`, [k.rows[0].id]);
    expect(r.error).toMatch(/cannot be changed, extended or turned back on/);
  });

  it('cannot insert a personal key directly (skipping the permission check and the 3-key limit)', async () => {
    const r = await as(
      B,
      `INSERT INTO public.api_keys (name, key_value, created_by, user_id, key_kind, permissions, created_at, expires_at)
       VALUES ('sneaky', 'h', $1, $1, 'personal', '{"read": false, "write": false}', now(), now() + interval '30 days')`,
      [B]
    );
    expect(r.error).toMatch(/made only on the Connect an outside AI page/);
  });

  it('the page’s own functions still work with the trigger in place', async () => {
    const made = await as(S, `SELECT public.fn_ai_personal_key_create('via page', 10) AS k`);
    expect(made.error).toBeUndefined();
    const off = await as(S, `SELECT public.fn_ai_personal_key_revoke($1) AS r`, [made.rows[0].k.id]);
    expect(off.rows[0].r.status).toBe('turned_off');
  });
});

describe('freeze trigger — the administrator API Keys screen (runs as the role authenticated)', () => {
  // app/api/system/api-keys/[id]/route.ts builds its client from the ANON key
  // and the admin's cookie session, so its UPDATE runs as authenticated. Give
  // the super admin an all-rows policy, the way an admin screen needs one.
  beforeAll(async () => {
    await db.query(`GRANT DELETE ON public.api_keys TO authenticated`);
    await db.query(
      `CREATE POLICY api_keys_admin_all ON public.api_keys FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())`
    );
  });

  const livePersonal = async () => {
    const made = await as(A, `SELECT public.fn_ai_personal_key_create('admin screen probe', 30) AS k`);
    if (made.error) {
      // free a slot: turn off one of A's working keys through the page function
      const any = await db.query(
        `SELECT id FROM public.api_keys WHERE key_kind = 'personal' AND user_id = $1 AND is_active AND expires_at > now() LIMIT 1`,
        [A]
      );
      await as(A, `SELECT public.fn_ai_personal_key_revoke($1)`, [any.rows[0].id]);
      const again = await as(A, `SELECT public.fn_ai_personal_key_create('admin screen probe', 30) AS k`);
      expect(again.error).toBeUndefined();
      return again.rows[0].k.id as string;
    }
    return made.rows[0].k.id as string;
  };

  it('can turn somebody’s personal key off — exactly the PATCH {is_active:false} the screen sends', async () => {
    const id = await livePersonal();
    const r = await as(S, `UPDATE public.api_keys SET is_active = false, updated_at = now() WHERE id = $1 RETURNING is_active`, [id]);
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([{ is_active: false }]);
    const row = await db.query(`SELECT is_active FROM public.api_keys WHERE id = $1`, [id]);
    expect(row.rows[0].is_active).toBe(false);
  });

  it('can rename it', async () => {
    const id = await livePersonal();
    const r = await as(S, `UPDATE public.api_keys SET name = 'renamed by admin' WHERE id = $1 RETURNING name`, [id]);
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([{ name: 'renamed by admin' }]);
  });

  it('cannot give it read access, re-kind it, extend it or turn it back on', async () => {
    const id = await livePersonal();
    for (const set of [
      `permissions = '{"read": true, "write": false}'`,
      `key_kind = 'admin', permissions = '{"read": true, "write": false}'`,
      `expires_at = expires_at + interval '1 day'`,
    ]) {
      const r = await as(S, `UPDATE public.api_keys SET ${set} WHERE id = $1`, [id]);
      expect(r.error, set).toMatch(/cannot be changed, extended or turned back on/);
    }
    await as(S, `UPDATE public.api_keys SET is_active = false WHERE id = $1`, [id]);
    const back = await as(S, `UPDATE public.api_keys SET is_active = true WHERE id = $1`, [id]);
    expect(back.error).toMatch(/cannot be changed, extended or turned back on/);
  });

  it('can still delete it', async () => {
    const id = await livePersonal();
    const r = await as(S, `DELETE FROM public.api_keys WHERE id = $1 RETURNING id`, [id]);
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(1);
  });

  it('still cannot create a personal key directly', async () => {
    const r = await as(
      S,
      `INSERT INTO public.api_keys (name, key_value, created_by, user_id, key_kind, permissions, created_at, expires_at)
       VALUES ('admin forged', 'h', $1, $1, 'personal', '{"read": false, "write": false}', now(), now() + interval '30 days')`,
      [A]
    );
    expect(r.error).toMatch(/made only on the Connect an outside AI page/);
  });

  it('the legacy administrator key still toggles as before', async () => {
    const r = await as(S, `UPDATE public.api_keys SET is_active = false WHERE name = 'legacy admin key' RETURNING is_active`);
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([{ is_active: false }]);
  });
});
