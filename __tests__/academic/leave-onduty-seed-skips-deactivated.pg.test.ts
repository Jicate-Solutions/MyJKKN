/**
 * supabase/migrations/20270411090000_leave_onduty_seed_skips_deactivated_approvers.sql,
 * applied VERBATIM to a throwaway PostgreSQL 16 on a minimal schema.
 *
 * Production, 27 Sep 2026: 25 of 57 pending learner leave / on-duty requests
 * waited on a DEACTIVATED approver, because fn_seed_application_approvals took
 * the first person a flow step named without checking they were still active.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270411090000_leave_onduty_seed_skips_deactivated_approvers.sql');
const PGHOST = process.env.LEAVEOD_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.LEAVEOD_TEST_PGPORT ?? '5432';
const PGUSER = process.env.LEAVEOD_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `leaveod_seed_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const INST = '00000000-0000-4000-8000-0000000000a1';
const DEPT = '00000000-0000-4000-8000-0000000000d1';
const APP = '00000000-0000-4000-8000-0000000000e1';
const LEARNER = '00000000-0000-4000-8000-0000000000f1';
const GONE = '00000000-0000-4000-8000-000000000101'; // deactivated faculty
const ACTIVE = '00000000-0000-4000-8000-000000000102'; // active faculty
const PRINCIPAL = '00000000-0000-4000-8000-000000000103';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TYPE approver_role AS ENUM ('faculty', 'hod', 'principal', 'super_admin');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, institution_id uuid, department_id uuid,
  is_active boolean NOT NULL DEFAULT true, is_login_disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.learners_profiles (id uuid PRIMARY KEY, profile_id uuid);
CREATE TABLE public.leave_onduty_applications (id uuid PRIMARY KEY, learner_id uuid, institution_id uuid,
  department_id uuid, semester_id uuid, category text, sub_category text);
CREATE TABLE public.leave_onduty_approvals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid,
  approver_id uuid, step_order int, approver_role approver_role, status text);
CREATE TABLE public.leave_onduty_approval_flows (id uuid PRIMARY KEY, flow_steps jsonb);
CREATE FUNCTION public.get_applicable_approval_flow(uuid, uuid, uuid, text, text)
  RETURNS SETOF public.leave_onduty_approval_flows LANGUAGE sql STABLE AS $$
  SELECT * FROM public.leave_onduty_approval_flows LIMIT 1 $$;
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;
const q = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;

async function flow(steps: unknown[]) {
  await q(`DELETE FROM public.leave_onduty_approval_flows`);
  await q(`INSERT INTO public.leave_onduty_approval_flows VALUES ($1, $2)`, [randomUUID(), JSON.stringify(steps)]);
}
async function seed() {
  const [{ n }] = await q(`SELECT public.fn_seed_application_approvals($1) AS n`, [APP]);
  const rows = await q(`SELECT step_order, approver_id FROM public.leave_onduty_approvals ORDER BY step_order`);
  return { n, rows };
}

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

beforeEach(async () => {
  await q(`TRUNCATE public.leave_onduty_approvals, public.leave_onduty_applications, public.learners_profiles, public.profiles`);
  await q(
    `INSERT INTO public.profiles (id, role, institution_id, department_id, is_active, created_at) VALUES
       ($1, 'faculty', $4, $5, false, now() - interval '2 years'),
       ($2, 'faculty', $4, $5, true,  now() - interval '1 year'),
       ($3, 'principal', $4, NULL, true, now())`,
    [GONE, ACTIVE, PRINCIPAL, INST, DEPT]
  );
  await q(`INSERT INTO public.learners_profiles VALUES ($1, NULL)`, [LEARNER]);
  await q(`INSERT INTO public.leave_onduty_applications VALUES ($1, $2, $3, $4, NULL, 'onduty', 'event_participation')`,
    [APP, LEARNER, INST, DEPT]);
});

describe('fn_seed_application_approvals never routes to a deactivated approver', () => {
  it('a step naming a deactivated person first takes the next ACTIVE person it names', async () => {
    await flow([
      { step_order: 1, approver_role: 'faculty', approver_ids: [GONE, ACTIVE] },
      { step_order: 2, approver_role: 'principal', approver_ids: [PRINCIPAL] },
    ]);
    expect(await seed()).toEqual({ n: 2, rows: [{ step_order: 1, approver_id: ACTIVE }, { step_order: 2, approver_id: PRINCIPAL }] });
  });

  it('a step naming ONLY a deactivated person falls back to an active holder of the role', async () => {
    await flow([{ step_order: 1, approver_role: 'faculty', approver_ids: [GONE] }]);
    expect((await seed()).rows).toEqual([{ step_order: 1, approver_id: ACTIVE }]);
  });

  it('the single approver_id form is checked the same way', async () => {
    await flow([{ step_order: 1, approver_role: 'faculty', approver_id: GONE }]);
    expect((await seed()).rows).toEqual([{ step_order: 1, approver_id: ACTIVE }]);
  });

  it('a login-disabled account is skipped like a deactivated one', async () => {
    await q(`UPDATE public.profiles SET is_active = true, is_login_disabled = true WHERE id = $1`, [GONE]);
    await flow([{ step_order: 1, approver_role: 'faculty', approver_ids: [GONE, ACTIVE] }]);
    expect((await seed()).rows).toEqual([{ step_order: 1, approver_id: ACTIVE }]);
  });

  it('no active person anywhere for the step → that step is not seeded (the app then refuses the request, as today)', async () => {
    await q(`UPDATE public.profiles SET is_active = false WHERE id = $1`, [ACTIVE]);
    await flow([{ step_order: 1, approver_role: 'faculty', approver_ids: [GONE] }]);
    expect(await seed()).toEqual({ n: 0, rows: [] });
  });

  it('the ROLE fallback also skips a login-disabled holder of the role', async () => {
    // The earliest-created faculty in the department is login-disabled; the
    // step names nobody, so the role lookup must pass over them.
    await q(`UPDATE public.profiles SET is_active = true, is_login_disabled = true WHERE id = $1`, [GONE]);
    await flow([{ step_order: 1, approver_role: 'faculty' }]);
    expect((await seed()).rows).toEqual([{ step_order: 1, approver_id: ACTIVE }]);
  });

  it('a named approver written in UPPER CASE still matches that person (uuid comparison, as before)', async () => {
    // An older ACTIVE faculty exists, so a fallback would pick THEM — only a
    // real match on the named (upper-case) id yields ACTIVE.
    const OLDER = '00000000-0000-4000-8000-000000000104';
    const LETTERED = 'abcdef00-0000-4000-8000-0000000000ab'; // has hex letters, so case matters
    await q(`INSERT INTO public.profiles (id, role, institution_id, department_id, is_active, created_at)
             VALUES ($1, 'faculty', $3, $4, true, now() - interval '9 years'),
                    ($2, 'faculty', $3, $4, true, now())`, [OLDER, LETTERED, INST, DEPT]);
    await flow([{ step_order: 1, approver_role: 'faculty', approver_ids: [LETTERED.toUpperCase()] }]);
    expect((await seed()).rows).toEqual([{ step_order: 1, approver_id: LETTERED }]);
  });

  it('[active, "bad-id"]: picks the active person and never reads the malformed entry after it', async () => {
    await flow([{ step_order: 1, approver_role: 'faculty', approver_ids: [ACTIVE, 'bad-id'] }]);
    expect((await seed()).rows).toEqual([{ step_order: 1, approver_id: ACTIVE }]);
  });

  it('[deactivated, active, "bad-id"]: still stops at the active person before the malformed entry', async () => {
    await flow([{ step_order: 1, approver_role: 'faculty', approver_ids: [GONE, ACTIVE, 'bad-id'] }]);
    expect((await seed()).rows).toEqual([{ step_order: 1, approver_id: ACTIVE }]);
  });

  it('["bad-id", active]: raises invalid uuid, exactly as the live body does for a malformed FIRST entry', async () => {
    await flow([{ step_order: 1, approver_role: 'faculty', approver_ids: ['bad-id', ACTIVE] }]);
    await expect(seed()).rejects.toMatchObject({ code: '22P02' });
  });

  it('an active person named first is still used first (unchanged behaviour)', async () => {
    await flow([{ step_order: 1, approver_role: 'faculty', approver_ids: [ACTIVE, GONE] }]);
    expect((await seed()).rows).toEqual([{ step_order: 1, approver_id: ACTIVE }]);
  });
});
