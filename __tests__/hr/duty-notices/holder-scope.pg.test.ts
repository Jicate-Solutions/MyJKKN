/**
 * HR duty notices — behavioural proof for the recipient lookups in
 * supabase/migrations/20270613101133_hr_duty_notices_onboarding_regularization.sql
 * after the review of PR #4150 (7 Oct 2026):
 *   item 1  fn_hr_role_holder_ids / fn_hr_permission_holder_ids return only
 *           people who belong to the given college, plus holders of a
 *           group-wide (institution_scope = 'all') role; with no college,
 *           only those group-wide holders — never everyone.
 *   item 7  a deactivated role makes nobody a holder, in either arm (user_roles
 *           or the legacy profiles.role), and passes on no group-wide scope.
 *   risk 6  a permission stored as a non-canonical true (the JSON string "t")
 *           counts, as it does for user_has_permission ((… ->> k)::boolean);
 *           a plain text compare with 'true' missed it.
 *   ledger  pending_user_ids exists (chase recipients on leave), defaults empty.
 *
 * The migration file is applied VERBATIM with psql, TWICE, onto plain
 * PostgreSQL with stand-ins for the tables it reads.
 *
 * Needs a local PostgreSQL 16. Without one it SKIPS — unless
 * HR_DUTY_NOTICES_TEST_PGUSER or HR_INTAKE_TEST_PGUSER is set (CI sets the
 * latter for its postgres:16 service), in which case it never skips and a
 * missing server fails loudly.
 *   brew services start postgresql@16
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20270613101133_hr_duty_notices_onboarding_regularization.sql',
);

const FORCED_USER = process.env.HR_DUTY_NOTICES_TEST_PGUSER ?? process.env.HR_INTAKE_TEST_PGUSER;
const PGHOST = process.env.HR_DUTY_NOTICES_TEST_PGHOST ?? process.env.HR_INTAKE_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HR_DUTY_NOTICES_TEST_PGPORT ?? process.env.HR_INTAKE_TEST_PGPORT ?? '5432';
const PGUSER = FORCED_USER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_hr_duty_notices_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15000,
  });
}

function reachable(): boolean {
  try {
    psql(['-d', 'postgres', '-tAc', 'SELECT 1']);
    return true;
  } catch {
    return false;
  }
}

const RUN = Boolean(FORCED_USER) || reachable();

const FIXTURE = `
DO $$ BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, role text, institution_id uuid,
  is_active boolean NOT NULL DEFAULT true, is_login_disabled boolean NOT NULL DEFAULT false
);
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role_key text UNIQUE NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}', institution_scope text NOT NULL DEFAULT 'own',
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role_id uuid NOT NULL);
CREATE TABLE public.staff (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid, institution_id uuid, is_active boolean);
CREATE TABLE public.user_institution_access (user_id uuid, institution_id uuid, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_key text NOT NULL, scope_type text NOT NULL,
  scope_id uuid, value jsonb, description text, data_type text, is_system boolean, is_active boolean
);
CREATE TABLE public.ai_routine_schedules (
  routine_id text PRIMARY KEY, enabled boolean, managed boolean, days_of_week smallint[],
  minute_of_day integer, max_only boolean
);
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
-- Supabase's default: anon (and everyone, via PUBLIC) can execute new functions.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
`;

const INST_A = randomUUID();
const INST_B = randomUUID();
const id = () => randomUUID();
const P = {
  itA: id(), // it_admin through user_roles, profile in A
  itStaffA: id(), // it_admin, profile in B but a staff row in A
  itGrantA: id(), // it_admin, profile in B, user_institution_access grant to A
  itB: id(), // it_admin in B only
  itLegacyA: id(), // legacy profiles.role = it_admin, in A
  groupHr: id(), // group_hr (scope 'all'), profile in B
  deadLegacyA: id(), // legacy profiles.role = old_it (deactivated role), in A
  deadGroupLegacy: id(), // legacy profiles.role = dead_group (deactivated, scope 'all'), in B
  disabledA: id(), // it_admin in A, login disabled
  apprA: id(), // approver_own in A
  apprB: id(), // approver_own in B
  apprAll: id(), // approver_all (scope 'all', permission stored as the string "t"), in B
  apprDeadA: id(), // approver_dead (deactivated role with the key), in A
  apprFalseA: id(), // approver_false (key = false), in A
  apprLegacyA: id(), // legacy profiles.role = approver_own, in A
};
const KEYS = ['hr.attendance.regularize_approve', 'hr.attendance.approve_team'];

let client: Client;
let tmp: string;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await client.query(sql, params)).rows as T[];
}
async function roleHolders(keys: string[], inst: string | null): Promise<string[]> {
  const r = await q<{ ids: string[] }>('SELECT public.fn_hr_role_holder_ids($1::text[], $2::uuid) AS ids', [keys, inst]);
  return [...r[0].ids].sort();
}
async function permHolders(inst: string | null): Promise<string[]> {
  const r = await q<{ ids: string[] }>('SELECT public.fn_hr_permission_holder_ids($1::text[], $2::uuid) AS ids', [KEYS, inst]);
  return [...r[0].ids].sort();
}
const sorted = (...ids: string[]) => [...ids].sort();

describe.skipIf(!RUN)('HR duty notices: recipients stay in the college (migration 20270613101133)', () => {
  beforeAll(async () => {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
    tmp = mkdtempSync(path.join(tmpdir(), 'hr-duty-notices-'));
    const fixturePath = path.join(tmp, 'fixture.sql');
    writeFileSync(fixturePath, FIXTURE);
    psql(['-d', DBNAME, '-f', fixturePath]);
    // Verbatim, twice: a re-run must be harmless.
    psql(['-d', DBNAME, '-f', MIGRATION]);
    psql(['-d', DBNAME, '-f', MIGRATION]);

    client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
    await client.connect();

    const role = async (key: string, scope: string, active: boolean, perms: Record<string, unknown> = {}) =>
      (await q<{ id: string }>(
        `INSERT INTO public.custom_roles (role_key, institution_scope, is_active, permissions) VALUES ($1, $2, $3, $4) RETURNING id`,
        [key, scope, active, JSON.stringify(perms)],
      ))[0].id;
    const it = await role('it_admin', 'own', true);
    const group = await role('group_hr', 'all', true);
    await role('old_it', 'own', false);
    await role('dead_group', 'all', false);
    const apprOwn = await role('approver_own', 'own', true, { 'hr.attendance.approve_team': true });
    const apprAll = await role('approver_all', 'all', true, { 'hr.attendance.regularize_approve': 't' });
    const apprDead = await role('approver_dead', 'own', false, { 'hr.attendance.approve_team': true });
    const apprFalse = await role('approver_false', 'own', true, { 'hr.attendance.approve_team': false });

    const person = (uid: string, inst: string, legacyRole: string | null = null, disabled = false) =>
      q('INSERT INTO public.profiles (id, institution_id, role, is_login_disabled) VALUES ($1, $2, $3, $4)', [uid, inst, legacyRole, disabled]);
    const holds = (uid: string, roleId: string) => q('INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2)', [uid, roleId]);

    await person(P.itA, INST_A); await holds(P.itA, it);
    await person(P.itStaffA, INST_B); await holds(P.itStaffA, it);
    await q('INSERT INTO public.staff (profile_id, institution_id, is_active) VALUES ($1, $2, true)', [P.itStaffA, INST_A]);
    await person(P.itGrantA, INST_B); await holds(P.itGrantA, it);
    await q('INSERT INTO public.user_institution_access (user_id, institution_id) VALUES ($1, $2)', [P.itGrantA, INST_A]);
    await person(P.itB, INST_B); await holds(P.itB, it);
    await person(P.itLegacyA, INST_A, 'it_admin');
    await person(P.groupHr, INST_B); await holds(P.groupHr, group);
    await person(P.deadLegacyA, INST_A, 'old_it');
    await person(P.deadGroupLegacy, INST_B, 'dead_group');
    await person(P.disabledA, INST_A, null, true); await holds(P.disabledA, it);

    await person(P.apprA, INST_A); await holds(P.apprA, apprOwn);
    await person(P.apprB, INST_B); await holds(P.apprB, apprOwn);
    await person(P.apprAll, INST_B); await holds(P.apprAll, apprAll);
    await person(P.apprDeadA, INST_A); await holds(P.apprDeadA, apprDead);
    await person(P.apprFalseA, INST_A); await holds(P.apprFalseA, apprFalse);
    await person(P.apprLegacyA, INST_A, 'approver_own');
  });

  afterAll(async () => {
    await client?.end();
    try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('item 1: a role\'s holders in college A — by profile, team-member record or access grant — and no one from college B', async () => {
    expect(await roleHolders(['it_admin'], INST_A)).toEqual(sorted(P.itA, P.itStaffA, P.itGrantA, P.itLegacyA));
    expect(await roleHolders(['it_admin'], INST_B)).toEqual(sorted(P.itStaffA, P.itGrantA, P.itB));
  });

  it('item 1: with no college, only group-wide holders — never every holder in every college', async () => {
    expect(await roleHolders(['it_admin'], null)).toEqual([]);
    expect(await roleHolders(['it_admin', 'group_hr'], null)).toEqual([P.groupHr]);
  });

  it('item 1: a group-wide (institution_scope = all) holder is reached from any college', async () => {
    expect(await roleHolders(['group_hr'], INST_A)).toEqual([P.groupHr]);
  });

  it('item 7: a deactivated role makes nobody a holder, and passes on no group-wide scope (legacy arm)', async () => {
    expect(await roleHolders(['old_it'], INST_A)).toEqual([]);
    expect(await roleHolders(['dead_group'], INST_A)).toEqual([]);
    expect(await roleHolders(['dead_group'], null)).toEqual([]);
  });

  it('item 1 + 7 + risk 6: approvers of college A are its own active key holders plus group-wide ones', async () => {
    expect(await permHolders(INST_A)).toEqual(sorted(P.apprA, P.apprLegacyA, P.apprAll));
    expect(await permHolders(INST_B)).toEqual(sorted(P.apprB, P.apprAll));
    expect(await permHolders(null)).toEqual([P.apprAll]);
  });

  it('both lookups stay closed to signed-in and anonymous callers', async () => {
    const r = await q<Record<string, boolean>>(`
      SELECT has_function_privilege('anon', 'public.fn_hr_role_holder_ids(text[], uuid)', 'EXECUTE') AS role_anon,
             has_function_privilege('authenticated', 'public.fn_hr_role_holder_ids(text[], uuid)', 'EXECUTE') AS role_auth,
             has_function_privilege('anon', 'public.fn_hr_permission_holder_ids(text[], uuid)', 'EXECUTE') AS perm_anon,
             has_function_privilege('authenticated', 'public.fn_hr_permission_holder_ids(text[], uuid)', 'EXECUTE') AS perm_auth,
             has_function_privilege('service_role', 'public.fn_hr_permission_holder_ids(text[], uuid)', 'EXECUTE') AS perm_service`);
    expect(r[0]).toEqual({ role_anon: false, role_auth: false, perm_anon: false, perm_auth: false, perm_service: true });
  });

  it('ledger: pending_user_ids defaults to empty and notified_count to 0 (an unsent claim)', async () => {
    const r = await q<{ pending: string[]; n: number }>(`
      INSERT INTO public.hr_duty_notices (duty_code, subject_table, subject_id, reminder_kind)
      VALUES ('A3', 'hr_attendance_regularizations', gen_random_uuid(), 'reminder')
      RETURNING pending_user_ids AS pending, notified_count AS n`);
    expect(r[0]).toEqual({ pending: [], n: 0 });
  });
});
