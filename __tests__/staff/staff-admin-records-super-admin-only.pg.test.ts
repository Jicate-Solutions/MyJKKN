/**
 * Behavioural proof for
 * supabase/migrations/20271007170139_staff_admin_records_super_admin_only.sql.
 *
 * The Director's rulings (2026-10-01): only a super admin may change the role
 * of anyone who has admin powers or would get them (staff role, profile role,
 * super admin flag, user_roles), and any change to — or deletion of — the
 * staff record of a person with admin powers needs a super admin, except the
 * photo, the phone numbers and the attendance machine code. HR Head keeps
 * every other staff write.
 *
 * The real chain is applied with psql onto a throwaway database:
 *   20260828150100 (guard + trigger) -> 20260925150000 (HR Head grants + body)
 *   -> 20260515001001 (main's sync_staff_to_profiles, installed as a trigger)
 *   -> 20260422000004 (mirror_staff_role_to_user_roles)
 *   -> 20250127 (create_preregistered_profile)
 *   -> 20260819180000 (fn_course_backfill_participant_email)
 *   -> 20271007170139 (this fix): first against drifted copies of the functions
 *   it replaces (body, SECURITY DEFINER flag, settings: it must abort and create
 *   nothing), then twice for real (it must be safe to re-run).
 * The tables are then written as `authenticated` with auth.uid() stubbed, the
 * same way PostgREST does it. is_super_admin() and user_has_permission() are
 * stand-ins with production's logic over the same tables.
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const mig = (f: string) => path.join(REPO, 'supabase/migrations', f);
const BASE_CHAIN = [
  '20260828150100_staff_role_key_guard_trigger.sql',
  '20260925150000_staff_writes_hr_head_only.sql',
  '20260515001001_sync_staff_to_profiles_login_disabled.sql',
  '20260422000004_mirror_staff_role_to_user_roles_rpc.sql',
  '20250127_create_profile_creation_function.sql',
  '20260819180000_course_participant_email_backfill.sql',
].map(mig);
// main's sync_learner_email_to_profile: on main it lives only in supabase/setup
// (no migration defines it), so the test installs a copy of that body.
const LEARNER_MAIN = path.join(__dirname, 'fixtures', 'main-sync-learner-email-to-profile.sql');
const SYNC_MAIN = BASE_CHAIN[2];
const FIX = mig('20271007170139_staff_admin_records_super_admin_only.sql');
const PGHOST = process.env.STAFF_ADMIN_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.STAFF_ADMIN_TEST_PGPORT ?? '5432';
const PGUSER = process.env.STAFF_ADMIN_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `staff_adm_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// people (profiles)
const SUPER = id(1);       // profiles.is_super_admin
const HR = id(2);          // HR Head
const ADMIN = id(3);       // administrator
const PLAIN = id(4);       // ordinary faculty
const HIDDEN = id(5);      // ordinary role on the record, but holds ceo in user_roles
const LEGACY = id(6);      // ordinary role on the record, profiles.role = administrator
const FLAGGED = id(7);     // ordinary role on the record, profiles.is_super_admin
const NEWBIE = id(8);      // ordinary person with a profile and no staff row yet
const DIRECTOR = id(9);    // on the Director list (platform.the_director_profile_ids), not a super admin
const QHR = id(24);        // holds hr_head; sign-in email and profile email differ
const STAFFADMIN = id(10); // faculty profile and roles, but their team-member record says administrator
const ROLEONLY_P = id(11); // faculty profile whose only link to S_ROLEONLY (administrator) is the email
const MIXED = id(12);      // administrator whose stored profile email is mixed case
// staff rows
const S_ADMIN = id(13);
const S_PLAIN = id(14);
const S_HIDDEN = id(15);
const S_LEGACY = id(16);
const S_FLAGGED = id(17);
const S_UNLINKED = id(18); // no profile_id; its institution email is the administrator's, so the next sync would link it to them
const S_ROLEONLY = id(19); // administrator on the record only: no profile linked yet
const S_NEWADMIN = id(20); // administrator on the record, linked to STAFFADMIN, whose profile and roles are ordinary
const S_HR = id(21);       // HR Head's own team-member record
const S_ORPHAN = id(22);   // administrator record, unlinked, and no profile carries its email
const S_NOEMAIL = id(23);  // administrator record with no profile and no email: only its own role says so
const DECIDER = id(25);    // may decide course applications (courses.applications.decide); ordinary otherwise
const EXT = id(26);        // external course participant with no email yet
const EXTADMIN = id(27);   // external course participant with no email who holds ceo
const GUEST = id(28);      // signed in with Google, waiting to be linked to a learner (role guest)
const LEARNER_X = id(30);
const MACHINE = id(40);

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

-- Production's columns for what the guards and sync_staff_to_profiles touch.
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text UNIQUE NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}',
  is_privileged boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, email text, full_name text, phone_number text, avatar_url text,
  institution_id uuid, department_id uuid, gender text, designation text,
  role text NOT NULL DEFAULT 'student', is_super_admin boolean DEFAULT false,
  is_active boolean NOT NULL DEFAULT true, is_login_disabled boolean DEFAULT false,
  is_pre_registered boolean DEFAULT false, profile_completed boolean DEFAULT false, learner_id uuid,
  is_external_participant boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false, assigned_by uuid,
  UNIQUE (user_id, role_id));
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text, last_name text DEFAULT 'X', email text, gender text, designation text,
  phone text, emergency_contact_phone text, profile_picture text,
  biometric_id text, biometric_institution_id uuid,
  institution_id uuid, department_id uuid, status text,
  role_key text REFERENCES public.custom_roles(role_key) ON UPDATE CASCADE,
  profile_id uuid REFERENCES public.profiles(id),
  institution_email text,
  is_active boolean DEFAULT true, login_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(), updated_by uuid);

-- Stand-ins with production's logic (supabase/setup/02_functions.sql).
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true) $$;
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
     WHERE ur.user_id = auth.uid() AND (cr.permissions->>permission_name)::boolean = true) $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_super_admin() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'administrator')) $$;
-- Every test institution is reachable; the scope rule is not the subject here.
CREATE FUNCTION public.role_has_institution_access(check_institution_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
GRANT EXECUTE ON FUNCTION public.is_super_admin(), public.user_has_permission(text), public.is_admin(),
  public.role_has_institution_access(uuid) TO authenticated;

-- RLS is not the subject here; the triggers are.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff, public.profiles, public.user_roles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated, service_role;
-- Two old SECURITY DEFINER bulk fixers (20250206, 20251227), with their real
-- signatures and the default grants they were created with (no REVOKE).
CREATE FUNCTION public.cleanup_migrated_staff_profiles()
RETURNS TABLE (staff_id uuid, old_profile_id uuid, new_profile_id uuid, email text, status text)
LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, 'ok'::text $$;
CREATE FUNCTION public.link_existing_profiles_to_approved_learners()
RETURNS TABLE (profile_id uuid, learner_id uuid, email text, status text)
LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::uuid, NULL::uuid, NULL::text, 'ok'::text $$;
CREATE TABLE public.learners_profiles (
  id uuid PRIMARY KEY, college_email text, institution_id uuid, department_id uuid);
GRANT SELECT, INSERT, UPDATE ON public.learners_profiles TO authenticated, service_role;

INSERT INTO public.custom_roles (role_key, is_privileged) VALUES
  ('super_admin', true), ('administrator', true), ('ceo', true),
  ('hr_head', false), ('faculty', false), ('hod', false),
  -- trusted by NAME in is_admin(), whatever its flag says
  ('admin', false);
INSERT INTO public.custom_roles (role_key, permissions) VALUES
  ('course_coordinator', '{"courses.applications.decide": true}'),
  -- may write learner records (learners_profiles policies)
  ('learner_office', '{"learners.edit": true}'),
  -- a role the learner routes accept through permissions.all
  ('everything', '{"all": true}');
INSERT INTO public.profiles (id, email, role, is_super_admin) VALUES
  ('${SUPER}', 'super@jkkn.ac.in', 'super_admin', true), ('${HR}', 'hr@jkkn.ac.in', 'hr_head', false),
  ('${ADMIN}', 'admin@jkkn.ac.in', 'administrator', false), ('${PLAIN}', 'plain@jkkn.ac.in', 'faculty', false),
  ('${HIDDEN}', 'hidden@jkkn.ac.in', 'faculty', false), ('${LEGACY}', 'legacy@jkkn.ac.in', 'administrator', false),
  ('${FLAGGED}', 'flagged@jkkn.ac.in', 'faculty', true),
  ('${NEWBIE}', 'newbie@jkkn.ac.in', 'faculty', false),
  ('${DIRECTOR}', 'director@jkkn.ac.in', 'faculty', false),
  ('${STAFFADMIN}', 'staffadmin@jkkn.ac.in', 'faculty', false),
  ('${ROLEONLY_P}', 'RoleOnly@jkkn.ac.in', 'faculty', false),
  ('${MIXED}', 'Mixed.Admin@JKKN.ac.in', 'administrator', false),
  ('${QHR}', 'qhr.profile@jkkn.ac.in', 'hr_head', false),
  ('${DECIDER}', 'decider@jkkn.ac.in', 'faculty', false);
INSERT INTO public.profiles (id, email, role) VALUES ('${GUEST}', 'guest.one@gmail.com', 'guest');
INSERT INTO public.profiles (id, email, role, is_external_participant) VALUES
  ('${EXT}', NULL, 'student', true), ('${EXTADMIN}', NULL, 'student', true);
-- Sign-in accounts: a record's identity includes every account whose email matches it.
INSERT INTO auth.users (id, email)
  SELECT id, email FROM public.profiles WHERE id IN ('${SUPER}', '${HR}', '${ADMIN}', '${PLAIN}', '${DIRECTOR}', '${NEWBIE}');
INSERT INTO auth.users (id, email) VALUES ('${QHR}', 'qhr.auth@gmail.com'), ('${DECIDER}', 'decider@jkkn.ac.in'),
  ('${EXT}', NULL), ('${EXTADMIN}', NULL);
CREATE TABLE public.platform_policies (
  policy_key text, value jsonb, scope_type text, scope_id uuid, is_active boolean);
INSERT INTO public.platform_policies VALUES
  ('platform.the_director_profile_ids', '["${DIRECTOR}"]', 'global', NULL, true);
-- Salary revisions (20270519090000), the columns the identity check reads.
CREATE TABLE public.hr_salary_revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid, status text);
GRANT SELECT, INSERT ON public.hr_salary_revision_requests TO authenticated;
-- LEGACY's login was locked, and their college set, on the profile itself;
-- their team-member record still says login on and names no college.
UPDATE public.profiles SET is_login_disabled = true, institution_id = '${MACHINE}' WHERE id = '${LEGACY}';
INSERT INTO public.user_roles (user_id, role_id)
  SELECT p, (SELECT id FROM public.custom_roles WHERE role_key = k)
    FROM (VALUES ('${HR}'::uuid, 'hr_head'), ('${QHR}', 'hr_head'), ('${ADMIN}', 'administrator'),
                 ('${PLAIN}', 'faculty'), ('${HIDDEN}', 'faculty'), ('${HIDDEN}', 'ceo'),
                 ('${LEGACY}', 'faculty'), ('${FLAGGED}', 'faculty'),
                 ('${DECIDER}', 'course_coordinator'), ('${EXTADMIN}', 'ceo'),
                 ('${HR}', 'learner_office'), ('${QHR}', 'learner_office'), ('${GUEST}', 'learner_office')) v(p, k);
`;

const SYNC_TRIGGER = `
CREATE TRIGGER trg_sync_staff_to_profiles BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.sync_staff_to_profiles();`;

// Seeded AFTER the migrations with triggers off, like a backfill: nothing is
// synced onto the profiles while seeding.
const SEED = `
SET session_replication_role = replica;
INSERT INTO public.staff (id, first_name, role_key, profile_id, institution_email) VALUES
  ('${S_ADMIN}', 'ADMIN', 'administrator', '${ADMIN}', 'admin@jkkn.ac.in'),
  ('${S_PLAIN}', 'PLAIN', 'faculty', '${PLAIN}', 'plain@jkkn.ac.in'),
  ('${S_HIDDEN}', 'HIDDEN', 'faculty', '${HIDDEN}', 'hidden@jkkn.ac.in'),
  ('${S_LEGACY}', 'LEGACY', 'faculty', '${LEGACY}', 'legacy@jkkn.ac.in'),
  ('${S_FLAGGED}', 'FLAGGED', 'faculty', '${FLAGGED}', 'flagged@jkkn.ac.in'),
  ('${S_UNLINKED}', 'UNLINKED', 'faculty', NULL, 'admin@jkkn.ac.in'),
  ('${S_ROLEONLY}', 'ROLEONLY', 'administrator', NULL, 'roleonly@jkkn.ac.in'),
  ('${S_NEWADMIN}', 'NEWADMIN', 'administrator', '${STAFFADMIN}', 'staffadmin@jkkn.ac.in'),
  ('${S_HR}', 'HRSELF', 'hr_head', '${HR}', 'hr@jkkn.ac.in'),
  ('${S_ORPHAN}', 'ORPHAN', 'administrator', NULL, 'orphan.admin@jkkn.ac.in'),
  ('${S_NOEMAIL}', 'NOEMAIL', 'administrator', NULL, NULL);
RESET session_replication_role;

-- Stand-ins for the SECURITY DEFINER flows that touch these rows on behalf of
-- someone else (photo review, bus pass sync, first-login relink). Owned by the
-- test superuser, as production's are owned by postgres.
CREATE FUNCTION public.test_definer_set_photo(p_staff uuid, p_url text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE staff SET profile_picture = p_url WHERE id = p_staff $$;
CREATE FUNCTION public.test_definer_set_role(p_staff uuid, p_role text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE staff SET role_key = p_role WHERE id = p_staff $$;
CREATE FUNCTION public.test_definer_relink(p_staff uuid, p_profile uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE staff SET profile_id = p_profile WHERE id = p_staff $$;
CREATE FUNCTION public.test_definer_set_profile_role(p_profile uuid, p_role text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE profiles SET role = p_role WHERE id = p_profile $$;
-- A SECURITY DEFINER flow that moves a record and changes its role in one
-- write: the table guard's relink checks do not see it (it runs as the owner),
-- so only the own-record role rule stands between it and the caller.
CREATE FUNCTION public.test_definer_move(p_staff uuid, p_profile uuid, p_institution_email text, p_role text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE staff SET profile_id = p_profile, institution_email = p_institution_email, email = NULL, role_key = p_role
   WHERE id = p_staff $$;
GRANT EXECUTE ON FUNCTION public.test_definer_move(uuid, uuid, text, text) TO authenticated;
CREATE FUNCTION public.test_definer_move_college(p_staff uuid, p_profile uuid, p_institution_email text, p_college uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE staff SET profile_id = p_profile, institution_email = p_institution_email, email = NULL, institution_id = p_college
   WHERE id = p_staff $$;
GRANT EXECUTE ON FUNCTION public.test_definer_move_college(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_definer_set_photo(uuid, text), public.test_definer_set_role(uuid, text),
  public.test_definer_relink(uuid, uuid), public.test_definer_set_profile_role(uuid, text) TO authenticated;
`;

const ADMIN_MSG = /Only a super admin can change the record of someone with admin powers\./;
const SELF_MSG = /You cannot change your own roles; ask a super admin\./;
const ROLE_MSG = /Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers\./;
const ASSIGN_MSG = /Only a super administrator can assign the role "administrator"/;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}
/** Apply the fix; return the error text, or null when it applied. */
function applyFix(): string | null {
  try { psql(['-d', DBNAME, '-f', FIX]); return null; }
  catch (e) { return String((e as { stderr?: string }).stderr ?? e); }
}
const fnExists = (sig: string) =>
  psql(['-d', DBNAME, '-At', '-c', `SELECT to_regprocedure('${sig}') IS NOT NULL`]).trim() === 't';

let client: Client;
const drift: Record<string, { error: string | null; created: boolean; sig: string }> = {};

/** Run `sqls` in order as `role` with auth.uid() = uid, in a transaction that is ALWAYS rolled back.
 *  Returns the last statement's rows, or the first error. */
async function as(uid: string | null, sqls: string | string[], role = 'authenticated') {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('test.uid', $1, true)`, [uid ?? '']);
    await client.query(`SET LOCAL ROLE ${role}`);
    let r = { rows: [] as Record<string, unknown>[], rowCount: 0 as number | null };
    for (const sql of Array.isArray(sqls) ? sqls : [sqls]) r = await client.query(sql);
    return { rows: r.rows, rowCount: r.rowCount, error: null as string | null };
  } catch (e) {
    return { rows: [] as Record<string, unknown>[], rowCount: 0, error: (e as Error).message };
  } finally {
    await client.query('ROLLBACK');
  }
}

/** Like as(), but starts as the test superuser; the statements switch role themselves. */
async function asOwner(sqls: string[]) {
  await client.query('BEGIN');
  try {
    let r = { rows: [] as Record<string, unknown>[], rowCount: 0 as number | null };
    for (const sql of sqls) r = await client.query(sql);
    return { rows: r.rows, rowCount: r.rowCount, error: null as string | null };
  } catch (e) {
    return { rows: [] as Record<string, unknown>[], rowCount: 0, error: (e as Error).message };
  } finally {
    await client.query('ROLLBACK');
  }
}

const set = (row: string, assignments: string) =>
  `UPDATE public.staff SET ${assignments} WHERE id = '${row}' RETURNING id`;
const setRole = (row: string, role: string) => set(row, `role_key = '${role}'`);
const markLeft = (row: string) => set(row, 'is_active = false');
const rename = (row: string) => set(row, `first_name = 'CHANGED'`);
const remove = (row: string) => `DELETE FROM public.staff WHERE id = '${row}' RETURNING id`;
const profileOf = (person: string) =>
  `SELECT role, is_active, is_login_disabled, phone_number, email, institution_id
     FROM public.profiles WHERE id = '${person}'`;

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  for (const f of BASE_CHAIN) psql(['-d', DBNAME, '-f', f]);
  psql(['-d', DBNAME, '-f', LEARNER_MAIN]);
  psql(['-d', DBNAME, '-c', SYNC_TRIGGER]);

  // Drift: a copy that differs from main (body, SECURITY DEFINER flag or
  // settings) must abort the whole file. Each tamper is undone before the next.
  const tamper = (key: string, sig: string, apply: string, undo: () => void) => {
    psql(['-d', DBNAME, '-c', apply]);
    drift[key] = { error: applyFix(), created: fnExists('public.fn_staff_link_has_admin_powers(uuid,text)'), sig };
    undo();
  };
  tamper('syncSettings', 'sync_staff_to_profiles()',
    `ALTER FUNCTION public.sync_staff_to_profiles() SET search_path TO 'public', 'pg_temp'`,
    () => psql(['-d', DBNAME, '-c', `ALTER FUNCTION public.sync_staff_to_profiles() SET search_path TO 'public'`]));
  tamper('syncBody', 'sync_staff_to_profiles()',
    readFileSync(SYNC_MAIN, 'utf8').replace('Priority 1: durable FK', 'Priority one: durable FK'),
    () => psql(['-d', DBNAME, '-f', SYNC_MAIN]));
  tamper('guardDefiner', 'fn_staff_guard_role_key()',
    `ALTER FUNCTION public.fn_staff_guard_role_key() SECURITY INVOKER`,
    () => psql(['-d', DBNAME, '-c', `ALTER FUNCTION public.fn_staff_guard_role_key() SECURITY DEFINER`]));
  tamper('mirror', 'mirror_staff_role_to_user_roles(uuid,text)',
    `ALTER FUNCTION public.mirror_staff_role_to_user_roles(uuid, text) SET search_path TO 'pg_temp', 'public'`,
    () => psql(['-d', DBNAME, '-c', `ALTER FUNCTION public.mirror_staff_role_to_user_roles(uuid, text) SET search_path TO 'public'`]));
  tamper('prereg', 'create_preregistered_profile(uuid,text,text,text,text,uuid,uuid)',
    `ALTER FUNCTION public.create_preregistered_profile(uuid, text, text, text, text, uuid, uuid) SET search_path TO 'pg_temp', 'public'`,
    () => psql(['-d', DBNAME, '-c', `ALTER FUNCTION public.create_preregistered_profile(uuid, text, text, text, text, uuid, uuid) SET search_path TO 'public'`]));

  tamper('backfill', 'fn_course_backfill_participant_email(uuid,text)',
    `ALTER FUNCTION public.fn_course_backfill_participant_email(uuid, text) SET search_path TO 'pg_temp', 'public'`,
    () => psql(['-d', DBNAME, '-c', `ALTER FUNCTION public.fn_course_backfill_participant_email(uuid, text) SET search_path TO 'public'`]));

  tamper('learner', 'sync_learner_email_to_profile()',
    `ALTER FUNCTION public.sync_learner_email_to_profile() SET search_path TO 'public'`,
    () => psql(['-d', DBNAME, '-c', `ALTER FUNCTION public.sync_learner_email_to_profile() RESET search_path`]));

  // For real, twice.
  for (let i = 0; i < 2; i++) {
    const err = applyFix();
    if (err) throw new Error(`20271007170139 failed on run ${i + 1}: ${err}`);
  }
  psql(['-d', DBNAME, '-c', SEED]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
}, 120_000);
afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('the file\'s own fingerprints: header, drift table and bodies agree', () => {
  // A stale fingerprint in the header misleads whoever checks production
  // before applying; a stale one in the drift table makes a re-run abort.
  const src = readFileSync(FIX, 'utf8');
  const header = src.slice(src.indexOf('The ones this file installs'), src.indexOf('Read them with:'));
  for (const [fn, label] of [
    ['sync_staff_to_profiles', 'sync_staff_to_profiles()'],
    ['fn_staff_guard_role_key', 'fn_staff_guard_role_key()'],
    ['mirror_staff_role_to_user_roles', 'mirror_staff_role_to_user_roles(...)'],
    ['create_preregistered_profile', 'create_preregistered_profile(...)'],
    ['sync_learner_email_to_profile', 'sync_learner_email_to_profile()'],
    ['fn_course_backfill_participant_email', 'fn_course_backfill_participant_email(uuid, text)'],
  ]) {
    it(fn, () => {
      const body = src.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\bAS (\\$\\w*\\$)([\\s\\S]*?)\\1`))![2];
      const md5 = createHash('md5').update(body.replace(/\r/g, '').replace(/^[ \t\n]+|[ \t\n]+$/g, '')).digest('hex');
      const row = src.match(new RegExp(`\\('public\\.${fn}\\([^']*',\\n\\s*'[0-9a-f]{32}'[^\\n]*\\n\\s*'([0-9a-f]{32})'`))![1];
      const afterLabel = header.slice(header.indexOf(label));
      const inHeader = afterLabel.match(/body md5 ([0-9a-f]{32})/)![1];
      expect({ drift_table: row, header: inHeader }).toEqual({ drift_table: md5, header: md5 });
    });
  }
});

// The mutation runner (supabase/tests/staff-admin-powers/run-mutations.mjs)
// mutates the migration alone; it skips this block so a mutant is caught by
// behaviour, not by the copy differing. It has its own mutant for the copy.
describe.skipIf(!!process.env.STAFF_ADMIN_MUTATION_RUN)('the setup copy (supabase/setup/02_functions.sql) matches every function this file creates, byte for byte', () => {
  const src = readFileSync(FIX, 'utf8');
  const setup = readFileSync(path.join(REPO, 'supabase/setup/02_functions.sql'), 'utf8');
  const statement = (fn: string) =>
    new RegExp(`CREATE (?:OR REPLACE )?FUNCTION (?:public\\.)?${fn}\\([\\s\\S]*?\\bAS (\\$\\w*\\$)[\\s\\S]*?\\1;`, 'g');
  const names = [...new Set([...src.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((x) => x[1]))];
  it('covers every function', () => expect(names.length).toBeGreaterThan(15));
  for (const fn of names) {
    it(fn, () => {
      const mine = [...src.matchAll(statement(fn))].map((x) => x[0]);
      const copies = [...setup.matchAll(statement(fn))].map((x) => x[0]);
      expect(copies.length, `${fn} has no copy in setup`).toBeGreaterThan(0);
      // the last copy in the file is the one a fresh setup ends with
      expect(copies[copies.length - 1]).toBe(mine[mine.length - 1]);
    });
  }
});

describe('drift check: the file changes nothing when a function it replaces differs from main', () => {
  for (const key of ['syncSettings', 'syncBody', 'guardDefiner', 'mirror', 'prereg', 'backfill', 'learner']) {
    it(`${key}: aborts, names the function, creates nothing`, () => {
      const d = drift[key];
      expect(d.error).toContain(`Drift: public.${d.sig}`);
      expect(d.created).toBe(false);
    });
  }
});

describe('HR Head and the record of someone with admin powers', () => {
  it('demoting an administrator to an ordinary role is REFUSED', async () => {
    expect((await as(HR, setRole(S_ADMIN, 'faculty'))).error).toMatch(ADMIN_MSG);
  });

  it('promoting an ordinary member to administrator is REFUSED', async () => {
    expect((await as(HR, setRole(S_PLAIN, 'administrator'))).error).toMatch(ASSIGN_MSG);
  });

  it('creating a new team-member record that is an administrator is REFUSED', async () => {
    expect((await as(HR, `INSERT INTO public.staff (first_name, role_key, institution_email)
                           VALUES ('NEW', 'administrator', 'someone.new@jkkn.ac.in') RETURNING id`)).error).toMatch(ASSIGN_MSG);
  });

  it('marking an administrator as left (inactive, or a status) is REFUSED', async () => {
    expect((await as(HR, markLeft(S_ADMIN))).error).toMatch(ADMIN_MSG);
    expect((await as(HR, set(S_ADMIN, `status = 'relieved'`))).error).toMatch(ADMIN_MSG);
  });

  it('college, email, profile link, login and name are REFUSED', async () => {
    for (const a of [
      `institution_id = '${MACHINE}'`, `institution_email = 'other@jkkn.ac.in'`,
      `profile_id = '${PLAIN}'`, 'login_enabled = false', `first_name = 'CHANGED'`,
    ]) {
      expect((await as(HR, set(S_ADMIN, a))).error, a).toMatch(ADMIN_MSG);
    }
  });

  it('deleting an administrator is REFUSED', async () => {
    expect((await as(HR, remove(S_ADMIN))).error).toMatch(ADMIN_MSG);
  });

  it('photo, phone numbers and attendance machine code are ALLOWED (second ruling)', async () => {
    for (const a of [
      `profile_picture = 'https://x/p.jpg'`, `phone = '9000000001'`, `emergency_contact_phone = '9000000002'`,
      `biometric_id = '42', biometric_institution_id = '${MACHINE}'`,
      `phone = '9000000003', updated_at = now(), updated_by = '${HR}'`,
    ]) {
      const r = await as(HR, set(S_ADMIN, a));
      expect(r.error, a).toBeNull();
      expect(r.rowCount, a).toBe(1);
    }
  });

  it('a small field together with anything else is REFUSED, naming the other columns', async () => {
    const r = await as(HR, set(S_ADMIN, `phone = '9000000001', first_name = 'CHANGED', gender = 'female'`));
    expect(r.error).toMatch(ADMIN_MSG);
    expect(r.error).toContain('this edit also changes: first_name, gender.');
  });

  it('a pure no-op update passes, and a blank where the database has nothing counts as no change', async () => {
    for (const a of ['first_name = first_name', `status = '', phone = '9000000004'`]) {
      const r = await as(HR, set(S_ADMIN, a));
      expect(r.error, a).toBeNull();
      expect(r.rowCount, a).toBe(1);
    }
  });

  it('admin powers held OUTSIDE the role on the record are protected too', async () => {
    // privileged role in user_roles (ceo) while staff.role_key is faculty
    expect((await as(HR, markLeft(S_HIDDEN))).error).toMatch(ADMIN_MSG);
    expect((await as(HR, remove(S_HIDDEN))).error).toMatch(ADMIN_MSG);
    expect((await as(HR, setRole(S_HIDDEN, 'hod'))).error).toMatch(ADMIN_MSG);
    // privileged legacy profiles.role
    expect((await as(HR, markLeft(S_LEGACY))).error).toMatch(ADMIN_MSG);
    // profiles.is_super_admin
    expect((await as(HR, markLeft(S_FLAGGED))).error).toMatch(ADMIN_MSG);
    // a privileged role on the record alone, nobody linked yet
    expect((await as(HR, markLeft(S_ROLEONLY))).error).toMatch(ADMIN_MSG);
  });
});

describe('pointing a team-member record at someone with admin powers', () => {
  const insert = (profile: string | null, email: string | null) =>
    `INSERT INTO public.staff (first_name, role_key, profile_id, institution_email)
     VALUES ('NEW', 'faculty', ${profile ? `'${profile}'` : 'NULL'}, ${email ? `'${email}'` : 'NULL'}) RETURNING id`;

  it('HR Head creating a team-member record linked to an administrator (by profile or by email) is REFUSED', async () => {
    expect((await as(HR, insert(ADMIN, null))).error).toMatch(ADMIN_MSG);
    expect((await as(HR, insert(null, 'admin@jkkn.ac.in'))).error).toMatch(ADMIN_MSG);
    expect((await as(HR, insert(null, ' ADMIN@jkkn.ac.in '))).error).toMatch(ADMIN_MSG);
    expect((await as(HR, insert(null, 'hidden@jkkn.ac.in'))).error).toMatch(ADMIN_MSG); // ceo in user_roles
    expect((await as(HR, insert(null, 'flagged@jkkn.ac.in'))).error).toMatch(ADMIN_MSG); // super admin flag
  });

  it('HR Head re-pointing an ordinary row at an administrator is REFUSED', async () => {
    expect((await as(HR, set(S_PLAIN, `profile_id = '${ADMIN}'`))).error).toMatch(ADMIN_MSG);
    expect((await as(HR, set(S_PLAIN, `profile_id = NULL, institution_email = 'admin@jkkn.ac.in'`))).error)
      .toMatch(ADMIN_MSG);
  });

  it('an unlinked row whose email is an administrator\'s counts as their record', async () => {
    expect((await as(HR, rename(S_UNLINKED))).error).toMatch(ADMIN_MSG);
    expect((await as(HR, remove(S_UNLINKED))).error).toMatch(ADMIN_MSG);
  });

  it('HR Head may still create and link ordinary people', async () => {
    for (const sql of [
      insert(NEWBIE, 'newbie@jkkn.ac.in'),
      insert(null, 'brand.new@jkkn.ac.in'),
      set(S_PLAIN, `institution_email = 'plain.new@jkkn.ac.in'`),
    ]) {
      const r = await as(HR, sql);
      expect(r.error).toBeNull();
      expect(r.rowCount).toBe(1);
    }
  });

  it('a super admin may; the first-login relink (SECURITY DEFINER) still may', async () => {
    expect((await as(SUPER, insert(ADMIN, 'admin@jkkn.ac.in'))).error).toBeNull();
    expect((await as(HR, `SELECT public.test_definer_relink('${S_PLAIN}', '${ADMIN}')`)).error).toBeNull();
  });
});

describe('HR Head keeps every write on ordinary team members', () => {
  it('edits, marks as left, changes to another ordinary role, deletes', async () => {
    for (const sql of [rename(S_PLAIN), markLeft(S_PLAIN), setRole(S_PLAIN, 'hod'), remove(S_PLAIN)]) {
      const r = await as(HR, sql);
      expect(r.error).toBeNull();
      expect(r.rowCount).toBe(1);
    }
  });
});

describe('a super admin may do all of it', () => {
  it('demote, promote, mark as left, edit, delete', async () => {
    for (const sql of [
      setRole(S_ADMIN, 'faculty'), setRole(S_PLAIN, 'administrator'), markLeft(S_ADMIN),
      rename(S_ADMIN), remove(S_ADMIN), markLeft(S_HIDDEN), remove(S_HIDDEN),
    ]) {
      const r = await as(SUPER, sql);
      expect(r.error).toBeNull();
      expect(r.rowCount).toBe(1);
    }
  });
});

describe('other callers', () => {
  it('an administrator (not a super admin) cannot change another administrator either', async () => {
    expect((await as(ADMIN, rename(S_LEGACY))).error).toMatch(ADMIN_MSG);
  });

  it('no session (service role, cron, migrations) is unchanged — the API routes check in code', async () => {
    const r = await as(null, markLeft(S_ADMIN), 'service_role');
    expect(r.error).toBeNull();
    expect(r.rowCount).toBe(1);
  });

  it('a SECURITY DEFINER flow (photo review, bus pass, first-login relink) may still touch the row', async () => {
    const r = await as(HR, `SELECT public.test_definer_set_photo('${S_ADMIN}', 'https://x/p.jpg')`);
    expect(r.error).toBeNull();
  });

  it('…but a role change touching a privileged role is refused even there (ruling 1)', async () => {
    expect((await as(HR, `SELECT public.test_definer_set_role('${S_ADMIN}', 'faculty')`)).error).toMatch(ADMIN_MSG);
    expect((await as(HR, `SELECT public.test_definer_set_role('${S_PLAIN}', 'administrator')`)).error).toMatch(ASSIGN_MSG);
  });
});

describe('sync_staff_to_profiles copies role and login state only when they change', () => {
  it('a photo edit by HR Head does not demote someone whose profile role is administrator', async () => {
    const r = await as(HR, [set(S_LEGACY, `profile_picture = 'https://x/p.jpg'`), profileOf(LEGACY)]);
    expect(r.error).toBeNull();
    // role kept, and the login lock set on the profile is not undone either
    expect(r.rows[0]).toMatchObject({ role: 'administrator', is_active: true, is_login_disabled: true });
  });

  it('a phone edit does not re-open an account that was closed on the profile itself', async () => {
    const r = await asOwner([
      `UPDATE public.profiles SET is_active = false WHERE id = '${PLAIN}'`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      set(S_PLAIN, `phone = '9222222222'`),
      profileOf(PLAIN),
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({ is_active: false, phone_number: '9222222222' });
  });

  it('nor does the photo review (SECURITY DEFINER), which the guard lets through', async () => {
    const r = await as(HR, [`SELECT public.test_definer_set_photo('${S_LEGACY}', 'https://x/p.jpg')`, profileOf(LEGACY)]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({ role: 'administrator' });
  });

  it('other fields still sync; role still syncs when role_key changes', async () => {
    let r = await as(HR, [set(S_PLAIN, `phone = '9111111111'`), profileOf(PLAIN)]);
    expect(r.rows[0]).toMatchObject({ role: 'faculty', phone_number: '9111111111' });
    r = await as(HR, [setRole(S_PLAIN, 'hod'), profileOf(PLAIN)]);
    expect(r.rows[0]).toMatchObject({ role: 'hod' });
  });

  it('login state still syncs when is_active / login_enabled change, and on a new row', async () => {
    let r = await as(HR, [markLeft(S_PLAIN), profileOf(PLAIN)]);
    expect(r.rows[0]).toMatchObject({ is_active: false });
    r = await as(HR, [set(S_PLAIN, 'login_enabled = false'), profileOf(PLAIN)]);
    expect(r.rows[0]).toMatchObject({ is_active: false, is_login_disabled: true });
    r = await as(HR, [
      `INSERT INTO public.staff (first_name, role_key, profile_id, institution_email)
       VALUES ('NEW', 'hod', '${NEWBIE}', 'newbie@jkkn.ac.in')`,
      profileOf(NEWBIE),
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({ role: 'hod' });
  });
});

describe('profiles: role, super admin flag and status of people with admin powers', () => {
  const upd = (person: string, a: string) => `UPDATE public.profiles SET ${a} WHERE id = '${person}' RETURNING id`;
  const ins = (cols: string, vals: string) =>
    `INSERT INTO public.profiles (id, email, ${cols}) VALUES (gen_random_uuid(), 'x@jkkn.ac.in', ${vals}) RETURNING id`;

  it('an ordinary person cannot make themselves an administrator or a super admin', async () => {
    expect((await as(PLAIN, upd(PLAIN, `role = 'administrator'`))).error).toMatch(SELF_MSG);
    expect((await as(PLAIN, upd(PLAIN, `role = 'super_admin'`))).error).toMatch(SELF_MSG);
    expect((await as(PLAIN, upd(PLAIN, 'is_super_admin = true'))).error).toMatch(ROLE_MSG);
  });

  it('nor change their own role at all, however ordinary (e.g. to HR Head)', async () => {
    expect((await as(PLAIN, upd(PLAIN, `role = 'hr_head'`))).error).toMatch(SELF_MSG);
    expect((await as(HR, upd(HR, `role = 'hod'`))).error).toMatch(SELF_MSG);
    expect((await as(SUPER, upd(SUPER, `role = 'hod'`))).error).toBeNull();
  });

  it('HR Head cannot demote, deactivate or lock out someone with admin powers', async () => {
    expect((await as(HR, upd(LEGACY, `role = 'faculty'`))).error).toMatch(ROLE_MSG);
    expect((await as(HR, upd(ADMIN, 'is_active = false'))).error).toMatch(ROLE_MSG);
    expect((await as(HR, upd(HIDDEN, 'is_login_disabled = true'))).error).toMatch(ROLE_MSG);
    expect((await as(HR, upd(FLAGGED, 'is_super_admin = false'))).error).toMatch(ROLE_MSG);
  });

  it('nor create a profile with admin powers', async () => {
    expect((await as(HR, ins('role', `'administrator'`))).error).toMatch(ROLE_MSG);
    expect((await as(HR, ins('role, is_super_admin', `'faculty', true`))).error).toMatch(ROLE_MSG);
  });

  it('everything else still works', async () => {
    for (const [who, sql] of [
      [PLAIN, upd(PLAIN, `phone_number = '9222222222'`)],
      [HR, upd(ADMIN, `phone_number = '9222222222'`)],
      [HR, upd(PLAIN, 'is_active = false')],
      [HR, ins('role', `'faculty'`)],
    ] as const) {
      const r = await as(who, sql);
      expect(r.error, sql).toBeNull();
      expect(r.rowCount, sql).toBe(1);
    }
  });

  it('a super admin may; a SECURITY DEFINER flow (first-login relink) still may', async () => {
    expect((await as(SUPER, upd(ADMIN, `role = 'faculty'`))).error).toBeNull();
    expect((await as(SUPER, upd(PLAIN, 'is_super_admin = true'))).error).toBeNull();
    expect((await as(HR, `SELECT public.test_definer_set_profile_role('${NEWBIE}', 'administrator')`)).error).toBeNull();
  });
});

describe('user_roles: giving or taking a privileged role, or changing the roles of someone with admin powers', () => {
  const role = (k: string) => `(SELECT id FROM public.custom_roles WHERE role_key = '${k}')`;
  const give = (person: string, k: string) =>
    `INSERT INTO public.user_roles (user_id, role_id) VALUES ('${person}', ${role(k)}) RETURNING id`;
  const take = (person: string, k: string) =>
    `DELETE FROM public.user_roles WHERE user_id = '${person}' AND role_id = ${role(k)} RETURNING id`;

  it('a non-super-admin is REFUSED', async () => {
    expect((await as(HR, give(PLAIN, 'administrator'))).error).toMatch(ROLE_MSG);
    expect((await as(HR, take(ADMIN, 'administrator'))).error).toMatch(ROLE_MSG);
    expect((await as(HR, give(ADMIN, 'hod'))).error).toMatch(ROLE_MSG);
    expect((await as(HR, take(HIDDEN, 'faculty'))).error).toMatch(ROLE_MSG);
    expect((await as(ADMIN, give(PLAIN, 'ceo'))).error).toMatch(ROLE_MSG);
  });

  it('nobody but a super admin changes their own roles, however ordinary', async () => {
    expect((await as(HR, give(HR, 'hod'))).error).toMatch(SELF_MSG);
    expect((await as(HR, take(HR, 'hr_head'))).error).toMatch(SELF_MSG);
    expect((await as(PLAIN, give(PLAIN, 'hr_head'))).error).toMatch(SELF_MSG);
    expect((await as(SUPER, give(SUPER, 'hod'))).error).toBeNull();
  });

  it('ordinary roles for ordinary people still work', async () => {
    for (const sql of [give(PLAIN, 'hod'), take(PLAIN, 'faculty')]) {
      const r = await as(HR, sql);
      expect(r.error, sql).toBeNull();
      expect(r.rowCount, sql).toBe(1);
    }
  });

  it('a super admin may', async () => {
    for (const sql of [give(PLAIN, 'administrator'), take(ADMIN, 'administrator')]) {
      expect((await as(SUPER, sql)).error, sql).toBeNull();
    }
  });
});

describe('sync_staff_to_profiles: a link is what the writer changed, not what it found', () => {
  const adminBefore = { role: 'administrator', is_active: true, is_login_disabled: false, email: 'admin@jkkn.ac.in', institution_id: null };

  const unlinkedAfter = `SELECT profile_id FROM public.staff WHERE id = '${S_UNLINKED}'`;

  it('a phone edit on an unlinked ordinary row carrying an administrator\'s email neither links nor writes their profile', async () => {
    let r = await as(HR, [set(S_UNLINKED, `phone = '9333333333'`), profileOf(ADMIN)]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({ ...adminBefore, phone_number: null });
    r = await as(HR, [set(S_UNLINKED, `phone = '9333333333'`), unlinkedAfter]);
    expect(r.rows[0]).toEqual({ profile_id: null });
    r = await as(HR, [set(S_UNLINKED, `biometric_id = '9'`), profileOf(ADMIN)]);
    expect(r.rows[0]).toMatchObject({ ...adminBefore, phone_number: null });
  });

  it('…and so does the same edit made with no session (the service-role PATCH route)', async () => {
    const r = await as(null, [set(S_UNLINKED, `phone = '9333333333'`), profileOf(ADMIN)], 'service_role');
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({ ...adminBefore, phone_number: null });
  });

  it('marking an UNLINKED ordinary member as left still locks their login (as on main), signed in or not', async () => {
    const x = id(91);
    const setup = [
      `INSERT INTO public.profiles (id, email, role) VALUES ('${x}', 'unlinked@jkkn.ac.in', 'faculty')`,
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.staff (id, first_name, role_key, institution_email) VALUES ('${x}', 'U', 'faculty', 'unlinked@jkkn.ac.in')`,
      `SET LOCAL session_replication_role = origin`,
    ];
    for (const who of [HR, null]) {
      const r = await (who
        ? asOwner([...setup, `SELECT set_config('test.uid', '${who}', true)`, 'SET LOCAL ROLE authenticated',
                   set(x, 'is_active = false, login_enabled = false'), profileOf(x)])
        : asOwner([...setup, 'SET LOCAL ROLE service_role', set(x, 'is_active = false, login_enabled = false'), profileOf(x)]));
      expect(r.error, String(who)).toBeNull();
      expect(r.rows[0], String(who)).toMatchObject({ is_active: false, is_login_disabled: true });
    }
  });

  it('a photo edit does not copy the record\'s (empty) college over the profile\'s', async () => {
    const r = await as(HR, [set(S_LEGACY, `profile_picture = 'https://x/p.jpg'`), profileOf(LEGACY)]);
    expect(r.rows[0]).toMatchObject({ institution_id: MACHINE, email: 'legacy@jkkn.ac.in' });
  });

  it('a change of college on a linked row still reaches the profile', async () => {
    const r = await as(HR, [set(S_PLAIN, `institution_id = '${MACHINE}'`), profileOf(PLAIN)]);
    expect(r.rows[0]).toMatchObject({ institution_id: MACHINE });
  });
});

describe('profiles: college, email and delete of people with admin powers', () => {
  const upd = (person: string, a: string) => `UPDATE public.profiles SET ${a} WHERE id = '${person}' RETURNING id`;

  it('HR Head cannot change their college or email, or delete their profile', async () => {
    expect((await as(HR, upd(ADMIN, `institution_id = '${MACHINE}'`))).error).toMatch(ROLE_MSG);
    expect((await as(HR, upd(HIDDEN, `email = 'other@jkkn.ac.in'`))).error).toMatch(ROLE_MSG);
    expect((await as(HR, `DELETE FROM public.profiles WHERE id = '${FLAGGED}' RETURNING id`)).error).toMatch(ROLE_MSG);
  });

  it('an ordinary profile may still be moved, re-addressed and deleted', async () => {
    const x = id(90);
    const r = await as(HR, [
      `INSERT INTO public.profiles (id, email, role) VALUES ('${x}', 'x@jkkn.ac.in', 'faculty')`,
      upd(x, `institution_id = '${MACHINE}', email = 'y@jkkn.ac.in'`),
      `DELETE FROM public.profiles WHERE id = '${x}' RETURNING id`,
    ]);
    expect(r.error).toBeNull();
    expect(r.rowCount).toBe(1);
  });

  it('a super admin may', async () => {
    expect((await as(SUPER, upd(ADMIN, `institution_id = '${MACHINE}', email = 'a2@jkkn.ac.in'`))).error).toBeNull();
  });
});

describe('admin powers held only through the role on a team-member record count everywhere', () => {
  const upd = (person: string, a: string) => `UPDATE public.profiles SET ${a} WHERE id = '${person}' RETURNING id`;

  it('HR Head cannot deactivate or re-address the profile of someone whose record says administrator', async () => {
    expect((await as(HR, upd(STAFFADMIN, 'is_active = false'))).error).toMatch(ROLE_MSG);
    expect((await as(HR, upd(STAFFADMIN, `email = 'other@jkkn.ac.in'`))).error).toMatch(ROLE_MSG);
  });

  it('…also when the record is linked to the profile only by its institution email (any case)', async () => {
    expect((await as(HR, upd(ROLEONLY_P, 'is_active = false'))).error).toMatch(ROLE_MSG);
    const r = await as(HR, `SELECT public.fn_staff_link_has_admin_powers('${ROLEONLY_P}', NULL) AS powers`);
    expect(r.rows[0]).toEqual({ powers: true });
  });

  it('the helper the routes ask (users PATCH, toggle-status, manage-auth, roles…) agrees with the record helper', async () => {
    const r = await as(HR, `SELECT public.fn_staff_link_has_admin_powers('${STAFFADMIN}', NULL) AS by_profile,
                                   public.fn_staff_link_has_admin_powers(NULL, 'StaffAdmin@jkkn.ac.in') AS by_email,
                                   public.fn_staff_record_has_admin_powers('${S_NEWADMIN}') AS record,
                                   public.fn_staff_link_has_admin_powers('${NEWBIE}', NULL) AS ordinary`);
    expect(r.rows[0]).toEqual({ by_profile: true, by_email: true, record: true, ordinary: false });
  });
});

describe('mirror_staff_role_to_user_roles (SECURITY DEFINER) follows the ruling', () => {
  const mirror = (person: string, k: string) => `SELECT public.mirror_staff_role_to_user_roles('${person}', '${k}')`;
  const rolesOf = (person: string) =>
    `SELECT string_agg(cr.role_key, ',' ORDER BY cr.role_key) AS roles FROM public.user_roles ur
       JOIN public.custom_roles cr ON cr.id = ur.role_id WHERE ur.user_id = '${person}'`;

  it('HR Head cannot wipe the roles of someone with admin powers', async () => {
    expect((await as(HR, mirror(HIDDEN, 'faculty'))).error).toMatch(ROLE_MSG);
  });

  it('nor hand out a privileged role through it', async () => {
    expect((await as(HR, mirror(STAFFADMIN, 'administrator'))).error).toMatch(ROLE_MSG);
  });

  it('an ordinary mirror still works; a super admin may do either', async () => {
    let r = await as(HR, [mirror(PLAIN, 'faculty'), rolesOf(PLAIN)]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({ roles: 'faculty' });
    r = await as(SUPER, [mirror(HIDDEN, 'faculty'), rolesOf(HIDDEN)]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({ roles: 'faculty' });
  });
});

describe('create_preregistered_profile (SECURITY DEFINER) follows the ruling', () => {
  const prereg = (role: string) =>
    `SELECT id FROM public.create_preregistered_profile(gen_random_uuid(), 'pre-${role}@jkkn.ac.in', 'PRE', '${role}')`;

  it('an administrator (allowed to pre-register, not super admin) cannot pre-register a privileged role', async () => {
    expect((await as(ADMIN, prereg('administrator'))).error).toMatch(ROLE_MSG);
    expect((await as(ADMIN, prereg('ceo'))).error).toMatch(ROLE_MSG);
  });

  it('…but may pre-register an ordinary one; who may call it is unchanged (main\'s role-name gate)', async () => {
    expect((await as(ADMIN, prereg('faculty'))).error).toBeNull();
    expect((await as(HR, prereg('faculty'))).error).toMatch(/Insufficient permissions/);
    expect((await as(PLAIN, prereg('faculty'))).error).toMatch(/Faculty can only create profiles for their own institution/);
  });

  it('a super admin may pre-register any role', async () => {
    expect((await as(SUPER, prereg('administrator'))).error).toBeNull();
  });
});

describe('fn_staff_identity_change_refusal: who a record belongs to (asked by the service-role routes)', () => {
  const q = (v: string | null) => (v ? `'${v}'` : 'NULL');
  const ask = (row: string | null, profile: string | null, email: string | null, instEmail: string | null) =>
    `SELECT public.fn_staff_identity_change_refusal(${q(row)}, ${q(profile)},
       ${q(email)}, ${q(instEmail)}) AS answer`;
  const answer = async (who: string, sql: string) => {
    const r = await as(who, sql);
    expect(r.error).toBeNull();
    return r.rows[0].answer;
  };

  it('a super admin re-pointing a record at their OWN account is refused (super admins included)', async () => {
    expect(await answer(SUPER, ask(S_PLAIN, PLAIN, null, ' Super@JKKN.ac.in '))).toBe('self_or_director');
    expect(await answer(SUPER, ask(null, SUPER, null, null))).toBe('self_or_director');
  });

  it('re-pointing a record at, or away from, a Director-list member is refused', async () => {
    expect(await answer(HR, ask(S_PLAIN, PLAIN, 'director@jkkn.ac.in', 'plain@jkkn.ac.in'))).toBe('self_or_director');
    expect(await answer(SUPER, ask(null, null, null, 'director@jkkn.ac.in'))).toBe('self_or_director');
  });

  it('an ordinary joiner, an ordinary email edit and an unchanged identity are allowed', async () => {
    expect(await answer(HR, ask(null, null, 'joiner@gmail.com', 'joiner@jkkn.ac.in'))).toBeNull();
    expect(await answer(HR, ask(S_PLAIN, PLAIN, 'new.personal@gmail.com', 'plain@jkkn.ac.in'))).toBeNull();
    // an email edit that does move the record to another ordinary account
    expect(await answer(HR, ask(S_PLAIN, PLAIN, 'newbie@jkkn.ac.in', 'plain@jkkn.ac.in'))).toBeNull();
    expect(await answer(SUPER, ask(S_PLAIN, PLAIN, null, 'PLAIN@jkkn.ac.in'))).toBeNull();
  });

  it('any identity change while a salary revision is waiting or approved is refused', async () => {
    for (const status of ['waiting_principal', 'waiting_director', 'approved']) {
      const r = await as(HR, [
        `INSERT INTO public.hr_salary_revision_requests (staff_id, status) VALUES ('${S_PLAIN}', '${status}')`,
        ask(S_PLAIN, PLAIN, 'newbie@jkkn.ac.in', 'plain@jkkn.ac.in'),
      ]);
      expect(r.rows[0].answer, status).toBe('salary_request');
    }
    // an edit that keeps the same accounts is not an identity change
    const sameAccounts = await as(HR, [
      `INSERT INTO public.hr_salary_revision_requests (staff_id, status) VALUES ('${S_PLAIN}', 'waiting_director')`,
      ask(S_PLAIN, PLAIN, 'new.personal@gmail.com', 'plain@jkkn.ac.in'),
    ]);
    expect(sameAccounts.rows[0].answer).toBeNull();
    const settled = await as(HR, [
      `INSERT INTO public.hr_salary_revision_requests (staff_id, status) VALUES ('${S_PLAIN}', 'applied')`,
      ask(S_PLAIN, PLAIN, 'newbie@jkkn.ac.in', 'plain@jkkn.ac.in'),
    ]);
    expect(settled.rows[0].answer).toBeNull();
  });

  it('only those who may write team-member records may ask; anon may not call it', async () => {
    expect((await as(PLAIN, ask(S_PLAIN, PLAIN, null, null))).error).toMatch(/Insufficient permission/);
    expect((await as(null, ask(S_PLAIN, PLAIN, null, null), 'anon')).error).toMatch(/permission denied/);
  });
});

describe('round 6: own role through one\'s own record, learner emails, taken emails, mixed case', () => {
  const upd = (person: string, a: string) => `UPDATE public.profiles SET ${a} WHERE id = '${person}' RETURNING id`;
  const LEARNER_MSG = /college email belongs to someone with admin powers/;
  const TAKEN_MSG = /That email belongs to someone with admin powers/;

  it('HR Head cannot change the role on their own record (by profile link or by email); a super admin can', async () => {
    expect((await as(HR, setRole(S_HR, 'hod'))).error).toMatch(SELF_MSG);
    const x = id(92);
    const r = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.staff (id, first_name, role_key, institution_email) VALUES ('${x}', 'HR2', 'faculty', 'HR@jkkn.ac.in')`,
      `SET LOCAL session_replication_role = origin`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      setRole(x, 'hod'),
    ]);
    expect(r.error).toMatch(SELF_MSG);
    expect((await as(SUPER, setRole(S_HR, 'hod'))).error).toBeNull();
  });

  it('…nor replace their own roles through mirror_staff_role_to_user_roles', async () => {
    expect((await as(HR, `SELECT public.mirror_staff_role_to_user_roles('${HR}', 'hr_head')`)).error).toMatch(SELF_MSG);
  });

  it('HR Head may not make an ordinary person an administrator directly on the profile', async () => {
    expect((await as(HR, upd(PLAIN, `role = 'administrator'`))).error).toMatch(ROLE_MSG);
  });

  it('a learner record carrying an administrator\'s email cannot turn them into a learner account, even via the service role', async () => {
    const r = await as(null, [
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'admin@jkkn.ac.in')`,
    ], 'service_role');
    expect(r.error).toMatch(LEARNER_MSG);
    const r2 = await as(null, [
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'learner.x@jkkn.ac.in')`,
      `UPDATE public.learners_profiles SET college_email = 'staffadmin@jkkn.ac.in' WHERE id = '${LEARNER_X}'`,
    ], 'service_role');
    expect(r2.error).toMatch(LEARNER_MSG);
  });

  it('…nor through the learner\'s already-linked profile, or by moving the learner onto an administrator\'s email', async () => {
    // linked branch: the profile already linked to the learner has admin powers
    let r = await asOwner([
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'learner.x@jkkn.ac.in')`,
      `UPDATE public.profiles SET learner_id = '${LEARNER_X}' WHERE id = '${STAFFADMIN}'`,
      'SET LOCAL ROLE service_role',
      `UPDATE public.learners_profiles SET college_email = 'fresh.x@jkkn.ac.in' WHERE id = '${LEARNER_X}'`,
    ]);
    expect(r.error).toMatch(LEARNER_MSG);
    // transfer branch: the learner is linked to an ordinary profile, the new
    // email belongs to an unlinked administrator profile
    r = await asOwner([
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'learner.x@jkkn.ac.in')`,
      `UPDATE public.profiles SET learner_id = '${LEARNER_X}' WHERE id = '${NEWBIE}'`,
      'SET LOCAL ROLE service_role',
      `UPDATE public.learners_profiles SET college_email = 'admin@jkkn.ac.in' WHERE id = '${LEARNER_X}'`,
    ]);
    expect(r.error).toMatch(LEARNER_MSG);
  });

  it('…while a waiting guest sign-in is still linked as before', async () => {
    const r = await as(null, [
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'guest.one@gmail.com')`,
      `SELECT role, learner_id FROM public.profiles WHERE id = '${GUEST}'`,
    ], 'service_role');
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ role: 'student', learner_id: LEARNER_X });
  });

  it('nobody but a super admin takes an email that belongs to someone with admin powers', async () => {
    expect((await as(HR, upd(NEWBIE, `email = 'Orphan.Admin@jkkn.ac.in'`))).error).toMatch(TAKEN_MSG);
    expect((await as(HR, `INSERT INTO public.profiles (id, email, role) VALUES (gen_random_uuid(), 'orphan.admin@jkkn.ac.in', 'faculty') RETURNING id`)).error)
      .toMatch(TAKEN_MSG);
    expect((await as(SUPER, upd(PLAIN, `email = 'orphan.admin@jkkn.ac.in'`))).error).toBeNull();
  });

  it('an ordinary edit never attaches an unlinked administrator record to a profile found by email', async () => {
    const r = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `UPDATE public.profiles SET email = 'orphan.admin@jkkn.ac.in' WHERE id = '${PLAIN}'`,
      `SET LOCAL session_replication_role = origin`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      set(S_ORPHAN, `phone = '9444444444'`),
      `SELECT s.profile_id, p.role FROM public.staff s, public.profiles p WHERE s.id = '${S_ORPHAN}' AND p.id = '${PLAIN}'`,
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ profile_id: null, role: 'faculty' });
  });

  it('a stored mixed-case email still counts', async () => {
    const r = await as(HR, `SELECT public.fn_staff_link_has_admin_powers(NULL, 'mixed.admin@jkkn.ac.in') AS by_email`);
    expect(r.rows[0]).toEqual({ by_email: true });
    expect((await as(HR, upd(NEWBIE, `email = 'MIXED.ADMIN@jkkn.ac.in'`))).error).toMatch(TAKEN_MSG);
  });
});

describe('round 7: linking a record to oneself, pre-registering with an admin\'s email, record-role-only admins', () => {
  const SELFLINK_MSG = /You cannot link a team-member record to your own account/;
  const TAKEN_MSG = /That email belongs to someone with admin powers/;
  const hrRole = `SELECT role FROM public.profiles WHERE id = '${HR}'`;

  it('(a) HR Head cannot create a record linked to their own profile', async () => {
    const r = await as(HR, [
      `INSERT INTO public.staff (first_name, role_key, profile_id, institution_email) VALUES ('ME', 'hod', '${HR}', 'fresh.hr@jkkn.ac.in')`,
    ]);
    expect(r.error).toMatch(SELFLINK_MSG);
  });

  it('(b) nor re-point an existing record at themselves', async () => {
    const r = await as(HR, [
      setRole(S_PLAIN, 'hod'),
      set(S_PLAIN, `profile_id = '${HR}', institution_email = 'fresh.hr@jkkn.ac.in'`),
    ]);
    expect(r.error).toMatch(SELFLINK_MSG);
  });

  it('(c) nor create a record found by their own email (any case); their role stays hr_head', async () => {
    expect((await as(HR, `INSERT INTO public.staff (first_name, role_key, institution_email) VALUES ('ME', 'hod', 'HR@jkkn.ac.in')`)).error)
      .toMatch(SELFLINK_MSG);
    const r = await as(HR, hrRole);
    expect(r.rows[0]).toEqual({ role: 'hr_head' });
  });

  it('a super admin may link a record to anyone, themselves included', async () => {
    expect((await as(SUPER, `INSERT INTO public.staff (first_name, role_key, profile_id, institution_email)
                             VALUES ('SA', 'faculty', '${SUPER}', 'super@jkkn.ac.in') RETURNING id`)).error).toBeNull();
  });

  it('the own-record role check also holds when only the profile link says so', async () => {
    const y = id(93);
    const r = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.staff (id, first_name, role_key, profile_id, institution_email) VALUES ('${y}', 'HR3', 'faculty', '${HR}', 'other.hr@jkkn.ac.in')`,
      `SET LOCAL session_replication_role = origin`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      setRole(y, 'hod'),
    ]);
    expect(r.error).toMatch(SELF_MSG);
  });

  it('a record whose only admin power is its own role is still protected', async () => {
    expect((await as(HR, markLeft(S_NOEMAIL))).error).toMatch(ADMIN_MSG);
  });

  const prereg = (email: string) =>
    `SELECT id FROM public.create_preregistered_profile(gen_random_uuid(), '${email}', 'PRE', 'faculty')`;

  it('pre-registration refuses an administrator\'s email (unlinked record, or a case variant), unless super admin', async () => {
    expect((await as(ADMIN, prereg('orphan.admin@jkkn.ac.in'))).error).toMatch(TAKEN_MSG);
    expect((await as(ADMIN, prereg('ADMIN@jkkn.ac.in'))).error).toMatch(TAKEN_MSG);
    expect((await as(SUPER, prereg('orphan.admin@jkkn.ac.in'))).error).toBeNull();
  });

  it('…and its "already exists" check ignores case', async () => {
    expect((await as(ADMIN, prereg('PLAIN@jkkn.ac.in'))).error).toMatch(/already exists/);
  });
});

describe('round 8: the sources of privilege are locked', () => {
  const upd = (person: string, a: string) => `UPDATE public.profiles SET ${a} WHERE id = '${person}' RETURNING id`;
  const roles = (a: string, where: string) => `UPDATE public.custom_roles SET ${a} WHERE ${where} RETURNING id`;
  const ROLES_MSG = /Only a super admin can change a role that carries admin powers/;
  const HELD_MSG = /You cannot change a role you hold yourself/;
  const HOLDER_MSG = /Someone who holds this role has admin powers\. Only a super admin can rename or delete it\./;

  it('A. a role trusted by name (admin) counts as privileged even un-flagged', async () => {
    expect((await as(HR, setRole(S_PLAIN, 'admin'))).error).toMatch(/Only a super administrator can assign the role "admin"/);
    expect((await as(HR, upd(PLAIN, `role = 'admin'`))).error).toMatch(ROLE_MSG);
    expect((await as(HR, `INSERT INTO public.user_roles (user_id, role_id)
                           SELECT '${PLAIN}', id FROM public.custom_roles WHERE role_key = 'admin' RETURNING id`)).error).toMatch(ROLE_MSG);
    const r = await as(HR, `SELECT public.fn_staff_role_key_is_privileged('admin') AS a, public.fn_staff_role_key_is_privileged('Administrator') AS b,
                                   public.fn_staff_role_key_is_privileged('hod') AS c`);
    expect(r.rows[0]).toEqual({ a: true, b: true, c: false });
  });

  it('B. an administrator cannot un-flag administrator, nor touch any privileged role', async () => {
    expect((await as(ADMIN, roles('is_privileged = false', `role_key = 'administrator'`))).error).toMatch(ROLES_MSG);
    expect((await as(HR, roles(`permissions = '{"x": true}'`, `role_key = 'ceo'`))).error).toMatch(ROLES_MSG);
    expect((await as(HR, roles(`permissions = '{"x": true}'`, `role_key = 'admin'`))).error).toMatch(ROLES_MSG);
    expect((await as(HR, `DELETE FROM public.custom_roles WHERE role_key = 'ceo' RETURNING id`)).error).toMatch(ROLES_MSG);
  });

  it('B. nobody flags a role, renames one into a trusted name, or creates a privileged one', async () => {
    expect((await as(HR, roles('is_privileged = true', `role_key = 'hod'`))).error).toMatch(ROLES_MSG);
    expect((await as(HR, roles(`role_key = 'Administrator'`, `role_key = 'hod'`))).error)
      .toMatch(ROLES_MSG);
    expect((await as(HR, `INSERT INTO public.custom_roles (role_key, is_privileged) VALUES ('boss', true) RETURNING id`)).error).toMatch(ROLES_MSG);
    expect((await as(HR, `INSERT INTO public.custom_roles (role_key) VALUES ('super_admin2'), ('ADMIN') RETURNING id`)).error).toMatch(ROLES_MSG);
  });

  it('B. nobody changes a role they hold themselves (e.g. adds roles.edit to the role they hold)', async () => {
    expect((await as(PLAIN, roles(`permissions = '{"roles.edit": true}'`, `role_key = 'faculty'`))).error).toMatch(HELD_MSG);
    const grant = `permissions = '{"x.y": true}'`;
    expect((await as(HR, roles(grant, `role_key = 'hr_head'`))).error).toMatch(HELD_MSG);
  });

  it('B. ordinary role work still goes through, and a rename reaches team-member records by cascade', async () => {
    const z = id(94);
    const r = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.staff (id, first_name, role_key) VALUES ('${z}', 'Z', 'hod')`,
      `SET LOCAL session_replication_role = origin`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      roles(`permissions = '{"x": true}'`, `role_key = 'hod'`),
      roles(`role_key = 'head_of_dept'`, `role_key = 'hod'`),
      `SELECT role_key FROM public.staff WHERE id = '${z}'`,
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ role_key: 'head_of_dept' });
    // faculty is held by LEGACY, whose record says faculty and whose profile
    // says administrator: renaming it would copy the new key onto their profile.
    const held = await as(HR, [
      `DO $$ BEGIN UPDATE public.custom_roles SET role_key = 'faculty_x' WHERE role_key = 'faculty';
         EXCEPTION WHEN OTHERS THEN PERFORM set_config('test.err', SQLERRM, true); END $$`,
      `SELECT current_setting('test.err', true) AS err,
              (SELECT role FROM public.profiles WHERE id = '${LEGACY}') AS legacy_role,
              (SELECT role_key FROM public.staff WHERE id = '${S_LEGACY}') AS legacy_record`,
    ]);
    expect(held.error).toBeNull();
    expect(held.rows[0]).toEqual({ err: expect.stringMatching(HOLDER_MSG), legacy_role: 'administrator', legacy_record: 'faculty' });
    expect((await as(HR, `INSERT INTO public.custom_roles (role_key) VALUES ('clerk') RETURNING id`)).error).toBeNull();
    expect((await as(SUPER, roles('is_privileged = false', `role_key = 'administrator'`))).error).toBeNull();
  });

  it('C. nobody but a super admin changes their own email', async () => {
    expect((await as(PLAIN, upd(PLAIN, `email = 'plain.new@jkkn.ac.in'`))).error).toMatch(/You cannot change your own email/);
    expect((await as(SUPER, upd(SUPER, `email = 'super.new@jkkn.ac.in'`))).error).toBeNull();
  });

  it('C. another person\'s email may not become one a team-member record carries (any case)', async () => {
    expect((await as(HR, upd(NEWBIE, `email = 'PLAIN@jkkn.ac.in'`))).error).toMatch(/belongs to a team-member record/);
    expect((await as(HR, upd(NEWBIE, `email = 'newbie.2@jkkn.ac.in'`))).error).toBeNull();
    expect((await as(SUPER, upd(NEWBIE, `email = 'plain@jkkn.ac.in'`))).error).toBeNull();
  });

  it('D. identity includes profiles found by email: a profile email that differs from the sign-in email still counts', async () => {
    const r = await as(QHR, `SELECT public.fn_staff_identity_change_refusal(NULL, NULL, NULL, 'QHR.Profile@jkkn.ac.in') AS answer`);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ answer: 'self_or_director' });
  });

  it('E. HR Head cannot re-link a learner onto, or confine, someone with admin powers', async () => {
    expect((await as(HR, upd(ADMIN, `learner_id = '${LEARNER_X}'`))).error).toMatch(ROLE_MSG);
    expect((await as(HR, upd(ADMIN, 'is_external_participant = true'))).error).toMatch(ROLE_MSG);
    expect((await as(HR, upd(NEWBIE, 'is_external_participant = true'))).error).toBeNull();
  });
});

describe('round 9: role renames and deletes, the course email backfill, new accounts with a team-member email', () => {
  const HOLDER_MSG = /Someone who holds this role has admin powers\. Only a super admin can rename or delete it\./;
  const roles = (a: string, where: string) => `UPDATE public.custom_roles SET ${a} WHERE ${where} RETURNING id`;
  const countRoles = (person: string) => `SELECT count(*)::int AS n FROM public.user_roles WHERE user_id = '${person}'`;
  const backfill = (profile: string, email: string) =>
    `SELECT public.fn_course_backfill_participant_email('${profile}', '${email}')`;
  const emailOf = (person: string) => `SELECT email FROM public.profiles WHERE id = '${person}'`;
  const insertProfile = (email: string) =>
    `INSERT INTO public.profiles (id, email, role) VALUES (gen_random_uuid(), '${email}', 'faculty') RETURNING id`;

  it('1. HR Head cannot rename a role an administrator holds; the administrator keeps their admin powers', async () => {
    expect((await as(HR, roles(`role_key = 'faculty_x'`, `role_key = 'faculty'`))).error).toMatch(HOLDER_MSG);
    const r = await as(HR, [
      `DO $$ BEGIN UPDATE public.custom_roles SET role_key = 'faculty_x' WHERE role_key = 'faculty';
         EXCEPTION WHEN OTHERS THEN NULL; END $$`,
      `SELECT public.fn_staff_record_has_admin_powers('${S_LEGACY}') AS powers`,
    ]);
    expect(r.rows[0]).toEqual({ powers: true });
  });

  it('1. HR Head cannot delete a role an administrator holds in user_roles; their roles stay', async () => {
    const r = await asOwner([
      `INSERT INTO public.user_roles (user_id, role_id) SELECT '${ADMIN}', id FROM public.custom_roles WHERE role_key = 'hod'`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      `DO $$ BEGIN DELETE FROM public.custom_roles WHERE role_key = 'hod';
         EXCEPTION WHEN OTHERS THEN PERFORM set_config('test.err', SQLERRM, true); END $$`,
      `SELECT current_setting('test.err', true) AS err, (${countRoles(ADMIN)}) AS n`,
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ err: expect.stringMatching(HOLDER_MSG), n: 2 });
  });

  it('1. a role held only through a profile role counts too', async () => {
    const r = await asOwner([
      `INSERT INTO public.custom_roles (role_key) VALUES ('warden')`,
      `UPDATE public.profiles SET role = 'warden', is_super_admin = true WHERE id = '${FLAGGED}'`,
      `DELETE FROM public.user_roles WHERE user_id = '${FLAGGED}'`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      `DO $$ BEGIN UPDATE public.custom_roles SET role_key = 'warden_x' WHERE role_key = 'warden';
         EXCEPTION WHEN OTHERS THEN PERFORM set_config('test.err', SQLERRM, true); END $$`,
      `SELECT current_setting('test.err', true) AS err`,
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0].err).toMatch(HOLDER_MSG);
  });

  it('1. a role nobody with admin powers holds may still be renamed and deleted; its permissions may change; a super admin may do either', async () => {
    const r = await asOwner([
      `INSERT INTO public.custom_roles (role_key) VALUES ('librarian')`,
      `INSERT INTO public.user_roles (user_id, role_id) SELECT '${NEWBIE}', id FROM public.custom_roles WHERE role_key = 'librarian'`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      roles(`role_key = 'librarian_2'`, `role_key = 'librarian'`),
      `DELETE FROM public.custom_roles WHERE role_key = 'librarian_2' RETURNING id`,
      roles(`permissions = '{"x": true}'`, `role_key = 'faculty'`),
    ]);
    expect(r.error).toBeNull();
    expect((await as(SUPER, roles(`role_key = 'faculty_x'`, `role_key = 'faculty'`))).error).toBeNull();
  });

  it('2. the course email backfill: only those who may decide course applications', async () => {
    expect((await as(PLAIN, backfill(EXT, 'ext.person@gmail.com'))).error)
      .toMatch(/Only someone who may decide course applications/);
    expect((await as(HR, backfill(EXT, 'ext.person@gmail.com'))).error)
      .toMatch(/Only someone who may decide course applications/);
  });

  it('2. never the caller\'s own profile, nor someone with admin powers', async () => {
    const own = await asOwner([
      `UPDATE public.profiles SET email = NULL, is_external_participant = true WHERE id = '${DECIDER}'`,
      `SELECT set_config('test.uid', '${DECIDER}', true)`, 'SET LOCAL ROLE authenticated',
      backfill(DECIDER, 'decider.alt@gmail.com'),
    ]);
    expect(own.error).toMatch(/You cannot change your own email/);
    expect((await as(DECIDER, backfill(EXTADMIN, 'ext.admin@gmail.com'))).error).toMatch(ROLE_MSG);
  });

  it('2. never an email of someone with admin powers, on a team-member record, or on another account (any case)', async () => {
    for (const [email, msg] of [
      ['Admin@JKKN.ac.in', /belongs to someone with admin powers/],
      ['orphan.admin@jkkn.ac.in', /belongs to someone with admin powers/],
      ['PLAIN@jkkn.ac.in', /belongs to a team-member record/],
      ['Decider@jkkn.ac.in', /already belongs to another account/],
      ['newbie@JKKN.ac.in', /already belongs to another account/],
      ['qhr.auth@gmail.com', /already belongs to another account/],
      ['QHR.Profile@jkkn.ac.in', /already belongs to another account/],
    ] as const) {
      const r = await as(DECIDER, [backfill(EXT, email)]);
      expect(r.error, email).toMatch(msg);
    }
  });

  it('2. the real use still works: a new address for a participant with none, never overwriting one', async () => {
    let r = await as(DECIDER, [backfill(EXT, ' Ext.Person@gmail.com '), emailOf(EXT)]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ email: 'Ext.Person@gmail.com' });
    r = await as(null, [backfill(EXT, 'ext.person@gmail.com'), emailOf(EXT)], 'service_role');
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ email: 'ext.person@gmail.com' });
    r = await asOwner([
      `UPDATE public.profiles SET email = 'kept@gmail.com' WHERE id = '${EXT}'`,
      `SELECT set_config('test.uid', '${DECIDER}', true)`, 'SET LOCAL ROLE authenticated',
      backfill(EXT, 'other@gmail.com'), emailOf(EXT),
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ email: 'kept@gmail.com' });
    r = await as(SUPER, [backfill(EXT, 'plain@jkkn.ac.in'), emailOf(EXT)]);
    expect(r.error).toMatch(/already belongs to another account/);
  });

  it('2. the service role is held to the same email rules', async () => {
    expect((await as(null, backfill(EXT, 'PLAIN@jkkn.ac.in'), 'service_role')).error).toMatch(/belongs to a team-member record/);
    expect((await as(null, backfill(EXTADMIN, 'ext.admin@gmail.com'), 'service_role')).error).toMatch(ROLE_MSG);
  });

  it('4. an administrator, who may not change roles on team-member records, may rename a role only ordinary people hold; the records follow', async () => {
    const z = id(95);
    const r2 = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.staff (id, first_name, role_key) VALUES ('${z}', 'Z', 'hod')`,
      `SET LOCAL session_replication_role = origin`,
      `SELECT set_config('test.uid', '${ADMIN}', true)`, 'SET LOCAL ROLE authenticated',
      roles(`role_key = 'head_of_dept'`, `role_key = 'hod'`),
      `SELECT role_key FROM public.staff WHERE id = '${z}'`,
    ]);
    expect(r2.error).toBeNull();
    expect(r2.rows[0]).toEqual({ role_key: 'head_of_dept' });
  });

  it('4. a role trusted by name (admin), un-flagged and held by nobody, may not be renamed or deleted by a non-super-admin', async () => {
    const ROLES_MSG = /Only a super admin can change a role that carries admin powers/;
    expect((await as(HR, roles(`role_key = 'admin_old'`, `role_key = 'admin'`))).error).toMatch(ROLES_MSG);
    expect((await as(HR, `DELETE FROM public.custom_roles WHERE role_key = 'admin' RETURNING id`)).error).toMatch(ROLES_MSG);
    expect((await as(SUPER, `DELETE FROM public.custom_roles WHERE role_key = 'admin' RETURNING id`)).error).toBeNull();
  });

  it('6. a learner record carrying an administrator\'s SIGN-IN email (not their profile email, any case) is refused', async () => {
    const LEARNER_MSG = /college email belongs to someone with admin powers/;
    const r = await asOwner([
      `UPDATE auth.users SET email = 'admin.signin@gmail.com' WHERE id = '${ADMIN}'`,
      'SET LOCAL ROLE service_role',
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'Admin.SignIn@gmail.com')`,
    ]);
    expect(r.error).toMatch(LEARNER_MSG);
    const h = await asOwner([
      `UPDATE auth.users SET email = 'admin.signin@gmail.com' WHERE id = '${ADMIN}'`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      `SELECT public.fn_staff_link_has_admin_powers(NULL, ' ADMIN.SIGNIN@gmail.com') AS by_sign_in`,
    ]);
    expect(h.rows[0]).toEqual({ by_sign_in: true });
  });

  it('6. the learner email sync matches emails ignoring case: an unlinked profile is linked, a linked learner moves', async () => {
    let r = await as(null, [
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'Guest.One@GMAIL.com')`,
      `SELECT role, learner_id FROM public.profiles WHERE id = '${GUEST}'`,
    ], 'service_role');
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ role: 'student', learner_id: LEARNER_X });
    const lp = id(96);
    r = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'lp@gmail.com')`,
      `INSERT INTO public.profiles (id, email, learner_id) VALUES ('${lp}', 'lp@gmail.com', '${LEARNER_X}')`,
      `SET LOCAL session_replication_role = origin`,
      'SET LOCAL ROLE service_role',
      `UPDATE public.learners_profiles SET college_email = 'GUEST.one@gmail.com' WHERE id = '${LEARNER_X}'`,
      `SELECT (SELECT learner_id FROM public.profiles WHERE id = '${GUEST}') AS guest,
              (SELECT learner_id FROM public.profiles WHERE id = '${lp}') AS old`,
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ guest: LEARNER_X, old: null });
  });

  it('7. the two old bulk fixers are for the service role only', async () => {
    for (const fn of ['cleanup_migrated_staff_profiles', 'link_existing_profiles_to_approved_learners']) {
      expect((await as(SUPER, `SELECT * FROM public.${fn}()`)).error, fn).toMatch(/permission denied/);
      expect((await as(HR, `SELECT * FROM public.${fn}()`)).error, fn).toMatch(/permission denied/);
      expect((await as(null, `SELECT * FROM public.${fn}()`, 'anon')).error, fn).toMatch(/permission denied/);
      expect((await as(null, `SELECT * FROM public.${fn}()`, 'service_role')).error, fn).toBeNull();
    }
  });

  it('8. a change of case in the institution email is not a relink: nothing is copied onto the profile', async () => {
    // no session (the service-role PATCH route): LEGACY's record says faculty,
    // their profile says administrator
    let r = await as(null, [
      set(S_LEGACY, `institution_email = 'Legacy@JKKN.ac.in'`),
      profileOf(LEGACY),
    ], 'service_role');
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({ role: 'administrator', is_login_disabled: true, institution_id: MACHINE });
    // signed in: HR Head re-casing the email on their own record is not linking it to themselves
    r = await as(HR, [set(S_HR, `institution_email = 'HR@jkkn.ac.in'`)]);
    expect(r.error).toBeNull();
    // a real change still counts: pointing an ordinary record at HR Head's own email
    expect((await as(HR, set(S_PLAIN, `institution_email = 'HR@JKKN.ac.in'`))).error).toMatch(/You cannot link a team-member record to your own account/);
  });

  it('3. HR Head cannot create an account carrying an email a team-member record carries (any case)', async () => {
    expect((await as(HR, insertProfile('PLAIN@JKKN.ac.in'))).error).toMatch(/belongs to a team-member record/);
    expect((await as(HR, insertProfile('brand.new@jkkn.ac.in'))).error).toBeNull();
    expect((await as(SUPER, insertProfile('PLAIN@JKKN.ac.in'))).error).toBeNull();
    expect((await as(null, insertProfile('PLAIN@JKKN.ac.in'), 'service_role')).error).toBeNull();
  });
});

describe('round 9: every rule has a test that fails without it (mutation survivors of round 8)', () => {
  const HELD_MSG = /You cannot change a role you hold yourself/;
  const HOLDER_MSG = /Someone who holds this role has admin powers\. Only a super admin can rename or delete it\./;
  const LEARNER_MSG = /college email belongs to someone with admin powers/;
  const roles = (a: string, where: string) => `UPDATE public.custom_roles SET ${a} WHERE ${where} RETURNING id`;
  const OWN_LINK_MSG = /You cannot link a team-member record to your own account/;

  it('a record found by the caller\'s sign-in email, or by their profile email, is their own (they differ for QHR)', async () => {
    const ins = (email: string) =>
      `INSERT INTO public.staff (first_name, role_key, institution_email) VALUES ('Q', 'faculty', '${email}') RETURNING id`;
    expect((await as(QHR, ins('QHR.Auth@gmail.com'))).error).toMatch(OWN_LINK_MSG);
    expect((await as(QHR, ins('qhr.profile@JKKN.ac.in'))).error).toMatch(OWN_LINK_MSG);
  });

  it('a stored blank and a NULL are the same value on the record of someone with admin powers', async () => {
    const r = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `UPDATE public.staff SET designation = '' WHERE id = '${S_ADMIN}'`,
      `SET LOCAL session_replication_role = origin`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      set(S_ADMIN, `designation = NULL, phone = '9000000005'`),
    ]);
    expect(r.error).toBeNull();
    expect(r.rowCount).toBe(1);
  });

  it('the own-record role rule looks at the record before AND after the write (a SECURITY DEFINER flow)', async () => {
    // before: HR Head's own record moved to NEWBIE and its role changed in one write
    expect((await as(HR, `SELECT public.test_definer_move('${S_HR}', '${NEWBIE}', 'newbie@jkkn.ac.in', 'hod')`)).error).toMatch(SELF_MSG);
    // after: an ordinary record moved to HR Head and its role changed in one write
    expect((await as(HR, `SELECT public.test_definer_move('${S_PLAIN}', '${HR}', NULL, 'hod')`)).error).toMatch(SELF_MSG);
    // neither: an ordinary record moved to another ordinary person still may
    expect((await as(HR, `SELECT public.test_definer_move('${S_PLAIN}', '${NEWBIE}', 'newbie@jkkn.ac.in', 'hod')`)).error).toBeNull();
  });

  it('changing the role on an ordinary record needs the role-change permission', async () => {
    expect((await as(ADMIN, setRole(S_PLAIN, 'hod'))).error)
      .toMatch(/Only HR Head or a super administrator can change a/);
  });

  it('identity includes the sign-in email, before and after the write', async () => {
    let r = await as(QHR, `SELECT public.fn_staff_identity_change_refusal(NULL, NULL, NULL, 'QHR.Auth@gmail.com') AS answer`);
    expect(r.rows[0]).toEqual({ answer: 'self_or_director' });
    const q = id(97);
    r = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.staff (id, first_name, role_key, institution_email) VALUES ('${q}', 'Q', 'faculty', 'qhr.auth@gmail.com')`,
      `SET LOCAL session_replication_role = origin`,
      `SELECT set_config('test.uid', '${QHR}', true)`, 'SET LOCAL ROLE authenticated',
      `SELECT public.fn_staff_identity_change_refusal('${q}', NULL, NULL, 'someone.else@jkkn.ac.in') AS answer`,
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ answer: 'self_or_director' });
  });

  it('a learner linked to someone with admin powers cannot be moved onto another profile\'s email (their account would be closed)', async () => {
    const r = await asOwner([
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'learner.x@jkkn.ac.in')`,
      `UPDATE public.profiles SET learner_id = '${LEARNER_X}' WHERE id = '${STAFFADMIN}'`,
      'SET LOCAL ROLE service_role',
      `UPDATE public.learners_profiles SET college_email = 'guest.one@gmail.com' WHERE id = '${LEARNER_X}'`,
    ]);
    expect(r.error).toMatch(LEARNER_MSG);
  });

  it('a role the caller holds through user_roles only, or through their profile role only, is theirs', async () => {
    expect((await as(DECIDER, roles(`permissions = '{"x": true}'`, `role_key = 'course_coordinator'`))).error).toMatch(HELD_MSG);
    expect((await as(DECIDER, roles(`permissions = '{"x": true}'`, `role_key = 'faculty'`))).error).toMatch(HELD_MSG);
  });

  it('a role held by someone with admin powers only through a team-member record cannot be renamed', async () => {
    const r = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.staff (id, first_name, role_key, profile_id) VALUES ('${id(98)}', 'ADM2', 'hod', '${ADMIN}')`,
      `SET LOCAL session_replication_role = origin`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      roles(`role_key = 'head_of_dept'`, `role_key = 'hod'`),
    ]);
    expect(r.error).toMatch(HOLDER_MSG);
  });

  it('a personal email on a team-member record counts as that record\'s', async () => {
    const r = await asOwner([
      `UPDATE public.staff SET email = 'plain.personal@gmail.com' WHERE id = '${S_PLAIN}'`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      `UPDATE public.profiles SET email = 'Plain.Personal@gmail.com' WHERE id = '${NEWBIE}' RETURNING id`,
    ]);
    expect(r.error).toMatch(/belongs to a team-member record/);
  });
});

describe('round 10: the personal email, moving one\'s own record, sign-in emails, one\'s own college', () => {
  const OWN_LINK_MSG = /You cannot link a team-member record to your own account/;
  const MOVE_OWN_MSG = /You cannot move your own team-member record to another account/;
  const LEARNER_MSG = /college email belongs to someone with admin powers/;
  const upd = (person: string, a: string) => `UPDATE public.profiles SET ${a} WHERE id = '${person}' RETURNING id`;

  it('1a. HR Head cannot give an ordinary record their own address as its personal email', async () => {
    expect((await as(HR, set(S_PLAIN, `email = 'HR@jkkn.ac.in'`))).error).toMatch(OWN_LINK_MSG);
    expect((await as(HR, set(S_PLAIN, `email = 'plain.home@gmail.com'`))).error).toBeNull();
  });

  it('1b. nor create a record whose personal email is their own', async () => {
    expect((await as(HR, `INSERT INTO public.staff (first_name, role_key, email, institution_email)
                           VALUES ('X', 'faculty', 'hr@JKKN.ac.in', 'x.new@jkkn.ac.in') RETURNING id`)).error).toMatch(OWN_LINK_MSG);
  });

  it('1c. nor move their own record to someone else; the sync never copies their role onto that person', async () => {
    const r = await as(HR, [
      `DO $$ BEGIN UPDATE public.staff SET profile_id = '${NEWBIE}', institution_email = 'newbie@jkkn.ac.in' WHERE id = '${S_HR}';
         EXCEPTION WHEN OTHERS THEN PERFORM set_config('test.err', SQLERRM, true); END $$`,
      `SELECT current_setting('test.err', true) AS err, (SELECT role FROM public.profiles WHERE id = '${NEWBIE}') AS newbie_role`,
    ]);
    expect(r.rows[0]).toEqual({ err: expect.stringMatching(MOVE_OWN_MSG), newbie_role: 'faculty' });
  });

  it('1d. nor unlink their own record onto a fresh email; a super admin may do all of these', async () => {
    expect((await as(HR, set(S_HR, `profile_id = NULL, institution_email = 'fresh.hr@jkkn.ac.in'`))).error).toMatch(MOVE_OWN_MSG);
    expect((await as(SUPER, set(S_HR, `profile_id = NULL, institution_email = 'fresh.hr@jkkn.ac.in'`))).error).toBeNull();
    expect((await as(SUPER, set(S_PLAIN, `email = 'super@jkkn.ac.in'`))).error).toBeNull();
  });

  it('2. a privileged record carrying a person\'s SIGN-IN email gives them admin powers, by profile and by email alike', async () => {
    const r = await asOwner([
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.staff (id, first_name, role_key, institution_email) VALUES ('${id(99)}', 'QA', 'administrator', ' QHR.Auth@gmail.com')`,
      `SET LOCAL session_replication_role = origin`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      `SELECT public.fn_staff_link_has_admin_powers('${QHR}', NULL) AS by_profile,
              public.fn_staff_link_has_admin_powers(NULL, 'qhr.auth@gmail.com') AS by_email`,
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ by_profile: true, by_email: true });
  });

  it('2. a stored profile email with outer spaces still counts (helper and learner sync)', async () => {
    const ws = id(100);
    const setup = [
      `INSERT INTO public.profiles (id, email, role) VALUES ('${ws}', ' Ws.Admin@JKKN.ac.in ', 'administrator')`,
    ];
    let r = await asOwner([...setup, `SELECT public.fn_staff_link_has_admin_powers(NULL, 'ws.admin@jkkn.ac.in') AS by_email`]);
    expect(r.rows[0]).toEqual({ by_email: true });
    r = await asOwner([...setup, 'SET LOCAL ROLE service_role',
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'ws.admin@jkkn.ac.in')`]);
    expect(r.error).toMatch(LEARNER_MSG);
  });

  it('4. nobody but a super admin changes their own college or learner link', async () => {
    expect((await as(PLAIN, upd(PLAIN, `institution_id = '${MACHINE}'`))).error).toMatch(/You cannot change your own college or learner link/);
    expect((await as(PLAIN, upd(PLAIN, `learner_id = '${LEARNER_X}'`))).error).toMatch(/You cannot change your own college or learner link/);
    expect((await as(PLAIN, upd(PLAIN, `full_name = 'Plain P'`))).error).toBeNull();
    expect((await as(HR, upd(PLAIN, `institution_id = '${MACHINE}'`))).error).toBeNull();
    expect((await as(SUPER, upd(SUPER, `institution_id = '${MACHINE}'`))).error).toBeNull();
  });
});

describe('round 11: one\'s own college through one\'s own record, pre-registration, learner college emails', () => {
  const OWN_COLLEGE_MSG = /You cannot move your own team-member record to another college/;
  const COLLEGE_B = id(41);
  const prereg = (email: string) =>
    `SELECT id FROM public.create_preregistered_profile(gen_random_uuid(), '${email}', 'New Person', 'faculty')`;
  const refusal = (email: string, learner: string | null = null) =>
    `SELECT public.fn_learner_email_refusal('${email}', ${learner ? `'${learner}'` : 'NULL'}) AS answer`;

  it('1. HR Head cannot move their own record to another college; the sync never reaches their profile', async () => {
    const r = await as(HR, [
      `DO $$ BEGIN UPDATE public.staff SET institution_id = '${COLLEGE_B}' WHERE id = '${S_HR}';
         EXCEPTION WHEN OTHERS THEN PERFORM set_config('test.err', SQLERRM, true); END $$`,
      `SELECT current_setting('test.err', true) AS err, (SELECT institution_id FROM public.profiles WHERE id = '${HR}') AS college`,
    ]);
    expect(r.rows[0]).toEqual({ err: expect.stringMatching(OWN_COLLEGE_MSG), college: null });
  });

  it('1. …nor through a SECURITY DEFINER flow, before or after a move; other people\'s moves and a super admin\'s stay allowed', async () => {
    expect((await as(HR, `SELECT public.test_definer_move_college('${S_HR}', '${NEWBIE}', 'newbie@jkkn.ac.in', '${COLLEGE_B}')`)).error)
      .toMatch(OWN_COLLEGE_MSG);
    expect((await as(HR, `SELECT public.test_definer_move_college('${S_PLAIN}', '${HR}', NULL, '${COLLEGE_B}')`)).error)
      .toMatch(OWN_COLLEGE_MSG);
    expect((await as(HR, set(S_PLAIN, `institution_id = '${COLLEGE_B}'`))).error).toBeNull();
    expect((await as(SUPER, set(S_HR, `institution_id = '${COLLEGE_B}'`))).error).toBeNull();
  });

  it('2. pre-registration refuses an email a team-member record carries (its personal email too), unless a super admin', async () => {
    const r = await asOwner([
      `UPDATE public.staff SET email = 'plain.personal@gmail.com' WHERE id = '${S_PLAIN}'`,
      `SELECT set_config('test.uid', '${ADMIN}', true)`, 'SET LOCAL ROLE authenticated',
      prereg('Plain.Personal@gmail.com'),
    ]);
    expect(r.error).toMatch(/belongs to a team-member record/);
    const ok = await asOwner([
      `UPDATE public.staff SET email = 'plain.personal@gmail.com' WHERE id = '${S_PLAIN}'`,
      `SELECT set_config('test.uid', '${SUPER}', true)`, 'SET LOCAL ROLE authenticated',
      prereg('plain.personal@gmail.com'),
    ]);
    expect(ok.error).toBeNull();
    expect((await as(ADMIN, prereg('brand.new.person@gmail.com'))).error).toBeNull();
  });

  it('3. a learner\'s college email: the caller\'s own (sign-in or profile), a colleague\'s, a non-learner account\'s', async () => {
    const ask = async (who: string | null, sql: string, role = 'authenticated') => (await as(who, sql, role)).rows[0]?.answer ?? null;
    // a signed-in learner writer who is not a super admin gets ONE word
    expect(await ask(HR, refusal(' HR@JKKN.ac.in '))).toBe('refused');
    expect(await ask(QHR, refusal('qhr.auth@GMAIL.com'))).toBe('refused');   // own sign-in email, nobody else's
    expect(await ask(GUEST, refusal('Guest.One@gmail.com'))).toBe('refused'); // own profile email, a guest's
    expect(await ask(HR, refusal('Plain@jkkn.ac.in'))).toBe('refused');
    expect(await ask(HR, refusal('decider@jkkn.ac.in'))).toBe('refused');
    expect(await ask(HR, refusal('brand.new.learner@jkkn.ac.in'))).toBeNull();
    // a super admin and the service role get the reason; a super admin is
    // spared only "your own email"
    expect(await ask(SUPER, refusal('super@jkkn.ac.in'))).toBe('other_account');
    expect(await ask(SUPER, refusal('brand.new.learner@jkkn.ac.in'))).toBeNull();
    expect(await ask(SUPER, refusal('plain@jkkn.ac.in'))).toBe('team_member');
    expect(await ask(null, refusal('decider@jkkn.ac.in'), 'service_role')).toBe('other_account');
  });

  it('3. only learner writers, the learner themself and the service role may ask', async () => {
    expect((await as(PLAIN, refusal('decider@jkkn.ac.in'))).error).toMatch(/Only someone who may write learner records/);
    expect((await as(DECIDER, refusal('plain@jkkn.ac.in'))).error).toMatch(/Only someone who may write learner records/);
    const all = await asOwner([
      `INSERT INTO public.user_roles (user_id, role_id) SELECT '${PLAIN}', id FROM public.custom_roles WHERE role_key = 'everything'`,
      `SELECT set_config('test.uid', '${PLAIN}', true)`, 'SET LOCAL ROLE authenticated',
      refusal('decider@jkkn.ac.in'),
    ]);
    expect(all.error).toBeNull();
    expect(all.rows[0]).toEqual({ answer: 'refused' });
    const onboarding = await asOwner([
      `INSERT INTO public.custom_roles (role_key, permissions) VALUES ('onboarding_desk', '{"learners.onboarding.edit": true}')`,
      `INSERT INTO public.user_roles (user_id, role_id) SELECT '${DECIDER}', id FROM public.custom_roles WHERE role_key = 'onboarding_desk'`,
      `SELECT set_config('test.uid', '${DECIDER}', true)`, 'SET LOCAL ROLE authenticated',
      refusal('plain@jkkn.ac.in'),
    ]);
    expect(onboarding.error).toBeNull();
    const own = await asOwner([
      `INSERT INTO public.profiles (id, email, role, learner_id) VALUES ('${id(105)}', 'learner.me@jkkn.ac.in', 'student', '${LEARNER_X}')`,
      `SELECT set_config('test.uid', '${id(105)}', true)`, 'SET LOCAL ROLE authenticated',
      `SELECT public.fn_learner_email_refusal('learner.me.new@jkkn.ac.in', '${LEARNER_X}') AS answer`,
    ]);
    expect(own.error).toBeNull();
    expect(own.rows[0]).toEqual({ answer: null });
  });

  it('3. an ordinary new learner, the existing learner\'s own email, and a waiting guest or learner sign-in are allowed', async () => {
    const r = await asOwner([
      `INSERT INTO public.profiles (id, email, role, learner_id) VALUES ('${id(101)}', 'learner.own@jkkn.ac.in', 'faculty', '${LEARNER_X}')`,
      `INSERT INTO public.profiles (id, email, role) VALUES ('${id(102)}', 'guest.wait@gmail.com', 'guest'), ('${id(103)}', 'stud.wait@gmail.com', 'student')`,
      `SELECT set_config('test.uid', '${HR}', true)`, 'SET LOCAL ROLE authenticated',
      `SELECT public.fn_learner_email_refusal('brand.new.learner@jkkn.ac.in', NULL) AS fresh,
              public.fn_learner_email_refusal('learner.own@jkkn.ac.in', '${LEARNER_X}') AS own_learner,
              public.fn_learner_email_refusal('learner.own@jkkn.ac.in', NULL) AS someone_elses,
              public.fn_learner_email_refusal('guest.wait@gmail.com', NULL) AS guest,
              public.fn_learner_email_refusal('stud.wait@gmail.com', NULL) AS waiting_learner`,
    ]);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ fresh: null, own_learner: null, someone_elses: 'refused', guest: null, waiting_learner: null });
  });
});

describe('round 12: the learner email sync refuses a colleague\'s email for every caller', () => {
  const TEAM_MSG = /college email belongs to a team-member record/;
  const OTHER_MSG = /college email belongs to an account that is not a learner's/;

  it('P1. HR Head inserting a learner with a team member\'s email (any case) fails; the colleague\'s role is unchanged', async () => {
    const r = await as(HR, [
      `DO $$ BEGIN INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', ' PLAIN@jkkn.ac.in');
         EXCEPTION WHEN OTHERS THEN PERFORM set_config('test.err', SQLERRM, true); END $$`,
      `SELECT current_setting('test.err', true) AS err, (SELECT role FROM public.profiles WHERE id = '${PLAIN}') AS plain_role,
              (SELECT learner_id FROM public.profiles WHERE id = '${PLAIN}') AS plain_learner`,
    ]);
    expect(r.rows[0]).toEqual({ err: expect.stringMatching(TEAM_MSG), plain_role: 'faculty', plain_learner: null });
  });

  it('P2. the same through the service role (a change request approved) and for a super admin; HR Head\'s own account is a team member\'s too', async () => {
    const r = await asOwner([
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'learner.x@jkkn.ac.in')`,
      'SET LOCAL ROLE service_role',
      `DO $$ BEGIN UPDATE public.learners_profiles SET college_email = 'hr@jkkn.ac.in' WHERE id = '${LEARNER_X}';
         EXCEPTION WHEN OTHERS THEN PERFORM set_config('test.err', SQLERRM, true); END $$`,
      `SELECT current_setting('test.err', true) AS err, (SELECT role FROM public.profiles WHERE id = '${HR}') AS hr_role,
              (SELECT learner_id FROM public.profiles WHERE id = '${HR}') AS hr_learner`,
    ]);
    expect(r.rows[0]).toEqual({ err: expect.stringMatching(TEAM_MSG), hr_role: 'hr_head', hr_learner: null });
    expect((await as(SUPER, `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'plain@jkkn.ac.in')`)).error)
      .toMatch(TEAM_MSG);
  });

  it('an account that is not a learner\'s (no team-member record) is refused for everyone; a guest, a new email and the learner\'s own profile are not', async () => {
    expect((await as(null, `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'Decider@jkkn.ac.in')`, 'service_role')).error)
      .toMatch(OTHER_MSG);
    expect((await as(null, `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'brand.new.learner@jkkn.ac.in')`, 'service_role')).error)
      .toBeNull();
    const own = await asOwner([
      `INSERT INTO public.profiles (id, email, role, learner_id) VALUES ('${id(104)}', 'old.address@gmail.com', 'faculty', '${LEARNER_X}')`,
      `SET LOCAL session_replication_role = replica`,
      `INSERT INTO public.learners_profiles (id, college_email) VALUES ('${LEARNER_X}', 'old.address@gmail.com')`,
      `SET LOCAL session_replication_role = origin`,
      'SET LOCAL ROLE service_role',
      `UPDATE public.learners_profiles SET college_email = 'OLD.address@gmail.com ' WHERE id = '${LEARNER_X}' RETURNING id`,
    ]);
    expect(own.error).toBeNull();
  });
});

describe('the helpers', () => {
  it('fn_staff_record_has_admin_powers answers from the role on the record, the profile flag, the profile role and user_roles', async () => {
    const r = await as(HR, `SELECT s.first_name, public.fn_staff_record_has_admin_powers(s.id) AS powers
                              FROM public.staff s ORDER BY s.first_name`);
    expect(r.error).toBeNull();
    expect(Object.fromEntries(r.rows.map((x) => [x.first_name, x.powers]))).toEqual({
      ADMIN: true, FLAGGED: true, HIDDEN: true, HRSELF: false, LEGACY: true, NEWADMIN: true, NOEMAIL: true, ORPHAN: true, PLAIN: false,
      ROLEONLY: true, UNLINKED: true,
    });
  });

  it('none is callable by anon', async () => {
    for (const sql of [
      `SELECT public.fn_staff_record_has_admin_powers('${S_ADMIN}')`,
      `SELECT public.fn_staff_role_key_is_privileged('administrator')`,
      `SELECT public.fn_staff_link_has_admin_powers(NULL, 'admin@jkkn.ac.in')`,
      `SELECT public.fn_custom_role_is_privileged(gen_random_uuid())`,
      `SELECT public.fn_staff_record_is_callers(NULL, NULL, NULL)`,
      `SELECT public.fn_caller_holds_role(NULL, NULL)`,
      `SELECT public.fn_email_on_staff_record('x')`,
      `SELECT public.fn_role_held_by_admin_powers(NULL, 'faculty')`,
      `SELECT public.fn_course_backfill_participant_email('${EXT}', 'x@gmail.com')`,
      `SELECT * FROM public.cleanup_migrated_staff_profiles()`,
      `SELECT * FROM public.link_existing_profiles_to_approved_learners()`,
      `SELECT public.fn_learner_email_refusal('x@gmail.com', NULL)`,
      `SELECT public.fn_learner_email_taken('x@gmail.com', NULL)`,
    ]) {
      expect((await as(null, sql, 'anon')).error, sql).toMatch(/permission denied/);
    }
  });
});
