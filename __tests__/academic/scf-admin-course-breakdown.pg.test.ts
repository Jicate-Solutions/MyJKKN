/**
 * Behavioural proof for supabase/migrations/20270412090000_scf_admin_course_breakdown.sql
 * (BUG-004624). The file is applied VERBATIM with psql onto a throwaway database
 * and the function is called as `authenticated` / `anon`, with the leadership
 * key and institution access set the way the production helpers report them.
 *
 * What it must do: split one teacher's feedback BY COURSE for leadership, over
 * the whole window (not only low sessions), scoped to the colleges the caller
 * reaches, aggregates only.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270412090000_scf_admin_course_breakdown.sql');
const PGHOST = process.env.SCF_BREAKDOWN_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.SCF_BREAKDOWN_TEST_PGPORT ?? '5432';
const PGUSER = process.env.SCF_BREAKDOWN_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `scf_breakdown_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
const INST = '00000000-0000-4000-8000-00000000d001';
const OTHER = '00000000-0000-4000-8000-00000000d002';
const UID = '00000000-0000-4000-8000-000000000021';
const LEAD_KEY = 'academic.session_feedback.leadership.view';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.super', true), '')::boolean, false) $$;
CREATE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p = ANY (string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;
CREATE FUNCTION public.role_has_institution_access(i uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT i::text = ANY (string_to_array(coalesce(current_setting('test.insts', true), ''), ',')) $$;
GRANT EXECUTE ON FUNCTION public.is_super_admin(), public.user_has_permission(text),
  public.role_has_institution_access(uuid) TO anon, authenticated;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, institution_id uuid, role text, is_super_admin boolean DEFAULT false);
INSERT INTO public.profiles VALUES ('${UID}', '${INST}', 'hod', false);
CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text);
INSERT INTO public.institutions VALUES ('${INST}', 'JKKN Test College'), ('${OTHER}', 'JKKN Other College');
CREATE TABLE public.staff (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, institution_email text,
                           is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.session_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid, attendance_date date, period_id text,
  course_code text, course_name text, faculty_id uuid, faculty_email text, understood int);
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

async function as(who: { role?: string; super?: boolean; perms?: string[]; insts?: string[] }, sql: string) {
  await client.query('BEGIN');
  try {
    await client.query(
      `SELECT set_config('test.uid', $1, true), set_config('test.super', $2, true),
              set_config('test.perms', $3, true), set_config('test.insts', $4, true)`,
      [UID, String(!!who.super), (who.perms ?? []).join(','), (who.insts ?? []).join(',')]
    );
    await client.query(`SET LOCAL ROLE ${who.role ?? 'authenticated'}`);
    const r = await client.query(sql);
    await client.query('COMMIT');
    return { rows: r.rows, error: null as string | null };
  } catch (e) {
    await client.query('ROLLBACK');
    return { rows: [] as Record<string, unknown>[], error: (e as Error).message };
  }
}

/** n responses for one session (date, period, course) at a college, all rating `understood`. */
function session(inst: string, date: string, period: string, code: string, name: string, email: string, understood: number[]) {
  return understood
    .map((u) => `('${inst}', '${date}', '${period}', '${code}', '${name}', '${email}', ${u})`)
    .join(',\n');
}

const CALL = `SELECT faculty_email, course_code, course_name, sessions::int, responses::int,
                     avg_understood::float AS avg, low_sessions::int AS low
              FROM public.fn_scf_admin_course_breakdown('2026-09-01', '2026-09-30')`;

const HOD = { perms: [LEAD_KEY], insts: [INST] };

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
  // One teacher, two courses at the HOD's college: MB101 two sessions (one low),
  // MB202 one strong session. Plus a course at another college the HOD must not see.
  await client.query(`INSERT INTO public.session_feedback
    (institution_id, attendance_date, period_id, course_code, course_name, faculty_email, understood) VALUES
    ${session(INST, '2026-09-10', 'P1', 'MB101', 'Supply Chain', 'asha@jkkn.ac.in', [2, 2, 2])},
    ${session(INST, '2026-09-11', 'P1', 'MB101', 'Supply Chain', 'asha@jkkn.ac.in', [4, 4, 4])},
    ${session(INST, '2026-09-12', 'P2', 'MB202', 'HR Management', 'asha@jkkn.ac.in', [5, 5, 5, 5])},
    ${session(OTHER, '2026-09-12', 'P3', 'CS301', 'Networks', 'ravi@jkkn.ac.in', [1, 1, 1])}`);
});
afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('fn_scf_admin_course_breakdown — one row per teacher per course', () => {
  it("a HOD sees one teacher's two courses as two rows, with each course's own numbers", async () => {
    const r = await as(HOD, CALL);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([
      { faculty_email: 'asha@jkkn.ac.in', course_code: 'MB101', course_name: 'Supply Chain', sessions: 2, responses: 6, avg: 3, low: 1 },
      { faculty_email: 'asha@jkkn.ac.in', course_code: 'MB202', course_name: 'HR Management', sessions: 1, responses: 4, avg: 5, low: 0 },
    ]);
  });

  it("another college's courses stay out of a HOD's view", async () => {
    const r = await as(HOD, CALL);
    expect(r.rows.map((x) => x.course_code)).not.toContain('CS301');
  });

  it('a super admin sees every college', async () => {
    // Row scope reads profiles.is_super_admin (as production does), not only the helper.
    await client.query(`UPDATE public.profiles SET is_super_admin = true WHERE id = '${UID}'`);
    try {
      const r = await as({ super: true }, CALL);
      expect(r.rows.map((x) => x.course_code).sort()).toEqual(['CS301', 'MB101', 'MB202']);
    } finally {
      await client.query(`UPDATE public.profiles SET is_super_admin = false WHERE id = '${UID}'`);
    }
  });

  it('without the leadership key the call is refused', async () => {
    const r = await as({ perms: ['academic.attendance.view'], insts: [INST] }, CALL);
    expect(r.error).toMatch(/not authorized/);
  });

  it('anon cannot execute it at all', async () => {
    const r = await as({ role: 'anon' }, CALL);
    expect(r.error).toMatch(/permission denied/);
  });
});
