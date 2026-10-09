/**
 * supabase/migrations/20271009100500_ai_tool_catalog_reenable_13_lookups.sql,
 * applied VERBATIM on top of 20270301090000_ai_tool_catalog.sql in a
 * throwaway PostgreSQL.
 *
 * Proves:
 *   exactly the 13 lookups that 20270301090000 switched off are switched on,
 *   bug_report_details leaves the outside-AI door (assistant only, Director
 *   2026-10-09), and every other catalog row is unchanged (all columns but
 *   updated_at);
 *   re-running is a no-op;
 *   the guard refuses, and nothing is switched on, when any one of the 13
 *   still has a known failure: it calls ai_rpc_accessible_scope, it is
 *   missing, academic_context reads is_current, or admission_analytics nests
 *   the aggregate.
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
const CATALOG = readFileSync(path.join(REPO, 'supabase/migrations/20270301090000_ai_tool_catalog.sql'), 'utf8');
const REPAIRED = readFileSync(path.join(REPO, 'supabase/migrations/20270308090000_ai_rpc_repair_dead_scope_lookups.sql'), 'utf8');
const ACADEMIC_CONTEXT = readFileSync(
  path.join(REPO, 'supabase/migrations/20270421090000_ai_academic_context_current_year.sql'),
  'utf8'
);
const REENABLE = readFileSync(
  path.join(REPO, 'supabase/migrations/20271009100500_ai_tool_catalog_reenable_13_lookups.sql'),
  'utf8'
);

const PGHOST = process.env.AI_DOOR_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.AI_DOOR_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.AI_DOOR_TEST_PGUSER ?? (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.AI_DOOR_TEST_PGPASSWORD;

const THIRTEEN = [
  'ai_rpc_academic_context',
  'ai_rpc_academic_years',
  'ai_rpc_admission_analytics',
  'ai_rpc_attendance_summary',
  'ai_rpc_bug_report_details',
  'ai_rpc_courses',
  'ai_rpc_degrees',
  'ai_rpc_faculty_assignments',
  'ai_rpc_periods',
  'ai_rpc_staff_details',
  'ai_rpc_staff_plans',
  'ai_rpc_timetable_slots',
  'ai_rpc_timetables',
];

// The minimum 20270301090000 needs (same stand-ins as personal-keys-and-menu.pg.test.ts).
const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, institution_id uuid, is_super_admin boolean DEFAULT false,
  is_active boolean DEFAULT true, is_login_disabled boolean NOT NULL DEFAULT false);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT false $f$;
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT false $f$;
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
`;

/** One function's CREATE statement, cut verbatim from a migration file. */
function createOf(sql: string, fn: string): string {
  const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$function\\$;`));
  if (!m) throw new Error(`no CREATE for ${fn}`);
  return m[0];
}

/**
 * The 13 are the REAL live bodies: 12 from 20270308090000 (#3999) and
 * academic_context from 20270421090000 (#4088, the newer one). plpgsql bodies
 * are not resolved at CREATE time, so they install without their tables.
 * Every other seeded target is a stand-in.
 */
function functions(academicContextFrom: 'repair' | 'current-year' = 'current-year'): string {
  const targets = [...new Set([...CATALOG.matchAll(/'rpc', '(ai_rpc_[a-z0-9_]+)'/g)].map((m) => m[1]))];
  const others = targets
    .filter((t) => !THIRTEEN.includes(t))
    .map((t) => `CREATE FUNCTION public.${t}() RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$;`);
  const real = THIRTEEN.map((t) =>
    createOf(t === 'ai_rpc_academic_context' && academicContextFrom === 'current-year' ? ACADEMIC_CONTEXT : REPAIRED, t)
  );
  return [...others, ...real].join('\n');
}

const SNAPSHOT = `SELECT name, kind, target, description, params, is_write, audience, requires_permission, enabled
                    FROM public.ai_tool_catalog ORDER BY name COLLATE "C"`;

let admin: Client;
let adminConnected = false;
const opened: { db: Client; name: string }[] = [];

/** A fresh database with the catalog applied; `tweak` runs before the catalog (e.g. to break one function). */
async function freshDb(tweak?: string, academicContextFrom: 'repair' | 'current-year' = 'current-year'): Promise<Client> {
  const name = `ai_reenable_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: name });
  await db.connect();
  opened.push({ db, name });
  await db.query(SCHEMA);
  await db.query(functions(academicContextFrom));
  if (tweak) await db.query(tweak);
  await db.query(CATALOG);
  return db;
}

async function offTargets(db: Client): Promise<string[]> {
  const r = await db.query(`SELECT target FROM public.ai_tool_catalog WHERE NOT enabled ORDER BY target COLLATE "C"`);
  return r.rows.map((x) => x.target);
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

describe('switching the 13 lookups back on', () => {
  it('starts from exactly the 13 that 20270301090000 switched off', async () => {
    const db = await freshDb();
    expect(await offTargets(db)).toEqual(THIRTEEN);
  });

  it('switches on exactly those 13 and leaves every other row unchanged', async () => {
    const db = await freshDb();
    // a bystander someone else switched off must stay off
    await db.query(`UPDATE public.ai_tool_catalog SET enabled = false WHERE target = 'ai_rpc_user_context'`);
    const before = (await db.query(SNAPSHOT)).rows;
    await db.query(REENABLE);
    const after = (await db.query(SNAPSHOT)).rows;

    expect(await offTargets(db)).toEqual(['ai_rpc_user_context']);
    expect(after).toHaveLength(before.length);
    for (let i = 0; i < before.length; i++) {
      const was = before[i];
      const now = after[i];
      if (was.target === 'ai_rpc_bug_report_details') {
        expect(was.audience).toEqual(['assistant', 'door']);
        expect({ ...now, enabled: false, audience: was.audience }).toEqual(was);
        expect(now.enabled).toBe(true);
        expect(now.audience).toEqual(['assistant']);
      } else if (THIRTEEN.includes(was.target) && was.kind === 'rpc') {
        expect({ ...now, enabled: false }).toEqual(was);
        expect(now.enabled).toBe(true);
      } else {
        expect(now).toEqual(was);
      }
    }
  });

  it('also switches on when academic_context is still #3999\'s body (20270421090000 not yet applied)', async () => {
    const db = await freshDb(undefined, 'repair');
    const body = await db.query(
      `SELECT prosrc FROM pg_proc WHERE proname = 'ai_rpc_academic_context'`
    );
    // really #3999's version, not #4088's
    const bodyOf = (sql: string) => createOf(sql, 'ai_rpc_academic_context').split('$function$')[1];
    expect(body.rows[0].prosrc).toBe(bodyOf(REPAIRED));
    expect(body.rows[0].prosrc).not.toBe(bodyOf(ACADEMIC_CONTEXT));
    await db.query(REENABLE);
    expect(await offTargets(db)).toEqual([]);
  });

  it('re-running changes nothing', async () => {
    const db = await freshDb();
    await db.query(REENABLE);
    const once = (await db.query(`SELECT name, enabled, updated_at FROM public.ai_tool_catalog ORDER BY name COLLATE "C"`)).rows;
    await db.query(REENABLE);
    const twice = (await db.query(`SELECT name, enabled, updated_at FROM public.ai_tool_catalog ORDER BY name COLLATE "C"`)).rows;
    expect(twice).toEqual(once);
  });
});

describe('the guard refuses and switches nothing on', () => {
  /** Replaces one of the 13 with a body that has the given text. */
  const swap = (fn: string, body: string) =>
    `DROP FUNCTION public.${fn}; CREATE FUNCTION public.${fn}() RETURNS jsonb LANGUAGE plpgsql AS $f$ ${body} $f$;`;
  const cases: [string, string, RegExp][] = [
    [
      'a lookup with no college-scope check at all (a bare body)',
      swap('ai_rpc_courses', `BEGIN /* [scope-repair 2026-09-24] */ RETURN (SELECT jsonb_agg(c) FROM courses c); END`),
      /no college-scope check in the live body.*ai_rpc_courses/,
    ],
    [
      'a scoped lookup without 20270308090000\'s repair',
      swap('ai_rpc_degrees', `BEGIN PERFORM public.role_has_institution_access(NULL::uuid); RETURN '{}'::jsonb; END`),
      /scope repair is not in the live body.*ai_rpc_degrees/,
    ],
    [
      'a lookup still calls ai_rpc_accessible_scope (any case)',
      swap('ai_rpc_periods', `BEGIN /* [scope-repair 2026-09-24] */ PERFORM public.role_has_institution_access(NULL::uuid);
         PERFORM public.AI_RPC_ACCESSIBLE_SCOPE (auth.uid()); RETURN '{}'::jsonb; END`),
      /still calls the missing ai_rpc_accessible_scope.*ai_rpc_periods/,
    ],
    [
      'academic_context still reads is_current',
      swap('ai_rpc_academic_context', `BEGIN PERFORM public.role_has_institution_access(NULL::uuid);
         RETURN (SELECT jsonb_agg(y) FROM academic_years y WHERE y.IS_CURRENT); END`),
      /academic_context still reads is_current/,
    ],
    [
      'admission_analytics still nests the aggregate (any case or spacing)',
      swap('ai_rpc_admission_analytics', `BEGIN PERFORM public.role_has_institution_access(NULL::uuid);
         RETURN (SELECT JSONB_OBJECT_AGG( to_char( created_at, 'YYYY-MM'), 1) FROM (SELECT now() AS created_at) s); END`),
      /admission_analytics still nests an aggregate/,
    ],
  ];

  for (const [label, breakIt, message] of cases) {
    it(label, async () => {
      const db = await freshDb(breakIt);
      await expect(db.query(REENABLE)).rejects.toThrow(message);
      expect(await offTargets(db)).toEqual(THIRTEEN);
    });
  }

  it('one of the 13 functions is missing', async () => {
    const db = await freshDb();
    await db.query(`DROP FUNCTION public.ai_rpc_staff_plans`);
    await expect(db.query(REENABLE)).rejects.toThrow(/function\(s\) missing.*ai_rpc_staff_plans/);
    expect(await offTargets(db)).toEqual(THIRTEEN);
  });
});
