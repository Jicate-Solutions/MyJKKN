/**
 * Behavioural proof for supabase/migrations/20271008121730_guest_role_no_admin_rights.sql
 * (Director, 8 Oct 2026: Guest is not an admin role; nobody but a super admin
 * gives a role that grants more than they hold).
 *
 * The migration is applied VERBATIM with psql to a throwaway database, then:
 *   Part 1: the guest row loses roles.assign, assign_roles, staff.view,
 *           users.view and view_users and its is_privileged flag; a re-run is a
 *           NOTICE and writes nothing; any other state aborts with nothing changed.
 *   Part 2: fn_caller_can_grant_role(role_id) answers for auth.uid() only, with
 *           user_has_permission's (permissions->>key)::boolean reading.
 *
 * REQUIRES a local PostgreSQL and refuses to skip silently. Uses the PHC_TEST_*
 * connection overrides that .github/workflows/test-suite.yml already sets.
 *   brew services start postgresql@16
 * GUEST_ROLE_TEST_MIGRATION points it at another copy of the file (used to
 * show that each rule's test fails when the rule is taken out).
 */
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION =
  process.env.GUEST_ROLE_TEST_MIGRATION ??
  path.join(REPO, 'supabase/migrations/20271008121730_guest_role_no_admin_rights.sql');

const PGHOST = process.env.PHC_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.PHC_TEST_PGPORT ?? '5432';
const PGUSER = process.env.PHC_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_guest_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const CALLER = '00000000-0000-4000-8000-00000000c001';
const OFF_CALLER = '00000000-0000-4000-8000-00000000c002'; // deactivated, same roles
const ODD_CALLER = '00000000-0000-4000-8000-00000000c003'; // holds a.view only as "maybe", which will not cast

const GUEST_SET: Record<string, boolean> = Object.fromEntries(
  [
    'aiPulse:view.self', 'ai_pulse.view', 'assign_roles', 'calendar.view',
    'courses.participant.self', 'hr.assets.view_own', 'hr.attendance.view_self',
    'hr.documents.view_own', 'hr.fdp.view_own', 'hr.forms.submit_own',
    'hr.leave.apply', 'hr.leave.balance.view', 'hr.leave.cancel',
    'hr.leave.encashment.view', 'hr.leave.withdraw', 'hr.memos.view_own',
    'hr.performance_reviews.view_own', 'hr.promotion.apply_own',
    'hr.training.view_own', 'onlineMeeting:create', 'online_meetings.view',
    'roles.assign', 'staff.view', 'users.view', 'view_users'
  ].map((k) => [k, true])
);
const REMOVED = ['roles.assign', 'assign_roles', 'staff.view', 'users.view', 'view_users'];

const FIXTURE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $r$
BEGIN
  BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
END $r$;
-- Supabase's default: anon gets EXECUTE on every new function, apart from PUBLIC.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text,
  is_active boolean NOT NULL DEFAULT true,
  is_login_disabled boolean NOT NULL DEFAULT false
);
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key varchar(50) UNIQUE NOT NULL,
  role_name varchar(50) NOT NULL DEFAULT 'x',
  permissions jsonb DEFAULT '{}'::jsonb,
  is_privileged boolean DEFAULT false,
  institution_scope varchar(10) DEFAULT 'own',
  updated_at timestamptz
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  role_id uuid NOT NULL REFERENCES public.custom_roles(id)
);

INSERT INTO public.custom_roles (role_key, permissions, is_privileged)
VALUES ('guest', '${JSON.stringify({ ...GUEST_SET, 'some.off': false })}'::jsonb, true);

-- The caller's powers: one assigned role (a "true" string among them) and a legacy profiles.role.
INSERT INTO public.custom_roles (role_key, permissions) VALUES
  ('caller_role', '{"a.view": true, "b.edit": "true", "c.list": "yes"}'),
  ('caller_legacy', '{"d.view": true}'),
  ('odd_role', '{"a.view": "maybe"}');
INSERT INTO public.profiles (id, role) VALUES
  ('${CALLER}', 'caller_legacy'),
  ('${OFF_CALLER}', 'caller_legacy'),
  ('${ODD_CALLER}', NULL);
UPDATE public.profiles SET is_active = false WHERE id = '${OFF_CALLER}';
INSERT INTO public.user_roles (user_id, role_id)
SELECT p, (SELECT id FROM public.custom_roles WHERE role_key = 'caller_role')
FROM unnest(ARRAY['${CALLER}', '${OFF_CALLER}']::uuid[]) p;
INSERT INTO public.user_roles (user_id, role_id)
SELECT '${ODD_CALLER}', id FROM public.custom_roles WHERE role_key = 'odd_role';

-- Roles someone might be given.
INSERT INTO public.custom_roles (role_key, permissions, is_privileged, institution_scope) VALUES
  ('subset',          '{"a.view": true, "b.edit": true, "d.view": "t", "z.off": false}', false, 'own'),
  ('empty',           '{}',                                    false, 'own'),
  ('extra_key',       '{"a.view": true, "e.secret": true}',    false, 'own'),
  ('extra_key_str',   '{"a.view": true, "e.secret": "yes"}',   false, 'own'),
  ('scope_all',       '{"a.view": true}',                      false, 'all'),
  ('scope_null',      '{"a.view": true}',                      false, NULL),
  ('privileged',      '{"a.view": true}',                      true,  'own'),
  ('privileged_null', '{"a.view": true}',                      NULL,  'own'),
  ('array_perms',     '["a.view"]',                            false, 'own'),
  ('nested_perms',    '{"a": {"view": true}}',                 false, 'own'),
  ('null_perms',      NULL,                                    false, 'own'),
  ('uncastable',      '{"a.view": "maybe"}',                   false, 'own'),
  ('only_a',          '{"a.view": true}',                      false, 'own');
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

/** Apply the migration verbatim; returns psql's stderr (the NOTICEs), throws it on failure. */
function applyMigration(): string {
  const r = spawnSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', '-d', DBNAME, '-f', MIGRATION],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) throw new Error(r.stderr || `psql exited ${r.status}`);
  return r.stderr;
}

let client: Client;
let tmp: string;

async function guest() {
  const r = await client.query(
    `SELECT permissions, is_privileged, updated_at FROM public.custom_roles WHERE role_key = 'guest'`
  );
  return r.rows[0] as { permissions: Record<string, unknown>; is_privileged: boolean | null; updated_at: Date | null };
}

async function setGuest(perms: Record<string, unknown>, privileged: boolean | null) {
  await client.query(
    `UPDATE public.custom_roles SET permissions = $1::jsonb, is_privileged = $2, updated_at = NULL WHERE role_key = 'guest'`,
    [JSON.stringify(perms), privileged]
  );
}

async function canGrant(roleKey: string, uid: string | null = CALLER): Promise<boolean> {
  await client.query(`SELECT set_config('test.uid', $1, false)`, [uid ?? '']);
  const r = await client.query(
    `SELECT public.fn_caller_can_grant_role((SELECT id FROM public.custom_roles WHERE role_key = $1)) AS ok`,
    [roleKey]
  );
  return r.rows[0].ok;
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}; this proof will not pretend to pass.\n` +
        String(e?.stderr || e?.message || e)
    );
  }
  tmp = mkdtempSync(path.join(tmpdir(), 'guest-'));
  const fixturePath = path.join(tmp, 'fixture.sql');
  writeFileSync(fixturePath, FIXTURE);
  psql(['-d', DBNAME, '-f', fixturePath]);
  applyMigration(); // verbatim, first run
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

describe('fn_caller_can_grant_role: no escalation', () => {
  it('allows a role whose every granted key the caller holds (assigned role, legacy role, "true"/"t" strings)', async () => {
    expect(await canGrant('subset')).toBe(true);
  });

  it('allows a role that grants nothing', async () => {
    expect(await canGrant('empty')).toBe(true);
  });

  it('refuses a role with a key the caller lacks', async () => {
    expect(await canGrant('extra_key')).toBe(false);
  });

  it('a "yes"-string grant on the role counts as granting, so a key the caller lacks is refused', async () => {
    expect(await canGrant('extra_key_str')).toBe(false);
  });

  it('refuses scope all, and a NULL scope', async () => {
    expect(await canGrant('scope_all')).toBe(false);
    expect(await canGrant('scope_null')).toBe(false);
  });

  it('refuses a privileged role, and a NULL flag', async () => {
    expect(await canGrant('privileged')).toBe(false);
    expect(await canGrant('privileged_null')).toBe(false);
  });

  it('refuses unreadable permissions: array, nested object, NULL, a value that will not cast', async () => {
    expect(await canGrant('array_perms')).toBe(false);
    expect(await canGrant('nested_perms')).toBe(false);
    expect(await canGrant('null_perms')).toBe(false);
    expect(await canGrant('uncastable')).toBe(false);
  });

  it('refuses when the caller is deactivated, signed out, or the role id is unknown', async () => {
    expect(await canGrant('only_a', OFF_CALLER)).toBe(false);
    expect(await canGrant('only_a', null)).toBe(false);
    await client.query(`SELECT set_config('test.uid', $1, false)`, [CALLER]);
    const r = await client.query(`SELECT public.fn_caller_can_grant_role(gen_random_uuid()) AS ok`);
    expect(r.rows[0].ok).toBe(false);
  });

  it("refuses when one of the caller's own values for that key will not cast", async () => {
    expect(await canGrant('only_a', ODD_CALLER)).toBe(false);
  });

  it('is SECURITY DEFINER with a fixed search_path; anon cannot run it, authenticated can', async () => {
    const r = await client.query(`
      SELECT p.prosecdef,
             p.proconfig,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
      FROM pg_proc p WHERE p.proname = 'fn_caller_can_grant_role'`);
    expect(r.rows[0].prosecdef).toBe(true);
    expect(r.rows[0].proconfig).toContain('search_path=public');
    expect(r.rows[0].anon_exec).toBe(false);
    expect(r.rows[0].auth_exec).toBe(true);
  });
});

describe('Part 1: the guest row', () => {
  it('first run: both key spellings gone, the flag cleared, the other 20 grants and an off key kept', async () => {
    const g = await guest();
    for (const k of REMOVED) expect(g.permissions).not.toHaveProperty(k);
    expect(Object.values(g.permissions).filter((v) => v === true)).toHaveLength(20);
    expect(g.permissions['some.off']).toBe(false);
    expect(g.is_privileged).toBe(false);
    expect(g.updated_at).not.toBeNull();
  });

  it('a re-run is a NOTICE and writes nothing', async () => {
    await client.query(`UPDATE public.custom_roles SET updated_at = NULL WHERE role_key = 'guest'`);
    const notices = applyMigration();
    expect(notices).toMatch(/nothing to do/);
    expect((await guest()).updated_at).toBeNull();
  });

  it.each([
    ['an extra key', { ...GUEST_SET, 'x.y': true }, true],
    ['the full set but the flag already false', GUEST_SET, false],
    ['the keys gone but the flag still true', Object.fromEntries(Object.entries(GUEST_SET).filter(([k]) => !REMOVED.includes(k))), true],
    ['one admin key put back', { ...Object.fromEntries(Object.entries(GUEST_SET).filter(([k]) => !REMOVED.includes(k))), 'roles.assign': true }, false]
  ])('drift aborts with nothing changed: %s', async (_label, perms, privileged) => {
    await setGuest(perms, privileged);
    expect(() => applyMigration()).toThrow();
    const g = await guest();
    expect(g.permissions).toEqual(perms);
    expect(g.is_privileged).toBe(privileged);
    expect(g.updated_at).toBeNull();
  });

  it('a missing guest row aborts', async () => {
    await client.query(`UPDATE public.custom_roles SET role_key = 'guest_gone' WHERE role_key = 'guest'`);
    expect(() => applyMigration()).toThrow(/guest role not found/);
  });
});
