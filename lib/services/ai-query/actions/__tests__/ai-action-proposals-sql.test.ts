/**
 * AI Assistant actions — the database half, proved on a real PostgreSQL.
 *
 * supabase/migrations/20270302090000_ai_action_proposals.sql and
 * 20270302090100_ai_action_proposals_owner_only.sql are applied VERBATIM, in
 * order, to a throwaway database over a minimal stand-in of the production
 * objects they touch (profiles, staff, projects, project_members, institutions,
 * custom_roles, learners_profiles, ai_jobs, notifications, and the three
 * permission helpers, whose answers each test sets explicitly). Every
 * assertion reads what PostgreSQL actually did.
 *
 * What must hold:
 *   - proposing never sends: no notifications / user_notifications row;
 *   - the caller needs the same permission the normal screen needs;
 *   - only people the caller can reach are resolved; learners through
 *     profiles.learner_id; more than 200 is refused; the same person asked for
 *     twice is never reported as "not reachable";
 *   - every person on the card carries college, role and an identifier;
 *   - email needs notifications.send; a task needs both people on the project;
 *   - a card is refused unless it can be attached to an answer being written;
 *   - a card stuck in "Sending…" is closed as failed after 10 minutes;
 *   - a claim succeeds exactly once (the second is ALREADY_CONFIRMED);
 *   - permission and recipients are re-checked at claim time;
 *   - cancelled and expired proposals cannot be claimed;
 *   - owner-only: another person's claim, cancel and read see nothing;
 *   - authenticated cannot write the table directly; anon executes nothing.
 *
 * REQUIRES a PostgreSQL (deliberately loud, not skipped, when none is reachable):
 *   brew services start postgresql@16
 * Override with AIACT_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
// AIACT_TEST_MIGRATION_DIR lets a mutation run point the suite at an altered
// copy without touching the repo's own files.
const MIGRATION_DIR = process.env.AIACT_TEST_MIGRATION_DIR ?? path.join(REPO, 'supabase/migrations');
const MIGRATION = path.join(MIGRATION_DIR, '20270302090000_ai_action_proposals.sql');
const MIGRATION_OWNER_ONLY = path.join(MIGRATION_DIR, '20270302090100_ai_action_proposals_owner_only.sql');
const applyMigrations = async (c: Client) => {
  await c.query(readFileSync(MIGRATION, 'utf8'));
  await c.query(readFileSync(MIGRATION_OWNER_ONLY, 'utf8'));
};

// The zero-tolerance PEOPLE words, read from the terminology gate's own
// dictionary (.claude/skills/jkkn-terminologies) so this list cannot drift:
// every CRITICAL_TERMS pattern whose replacement is a learner / Senior Learner /
// team member word.
const PEOPLE_REPLACEMENTS = new Set(['learner', 'learners', 'young learners', 'senior learner', 'senior learners', 'team members']);
const PEOPLE_WORDS: RegExp[] = (() => {
  const dict = readFileSync(path.join(REPO, '.claude/skills/jkkn-terminologies/scripts/validate_terminology.py'), 'utf8');
  const block = dict.slice(dict.indexOf('CRITICAL_TERMS = {'), dict.indexOf('ENCOURAGED_TERMS = {'));
  return [...block.matchAll(/r'([^']+)':\s*'([^']+)'/g)]
    .filter((m) => PEOPLE_REPLACEMENTS.has(m[2].toLowerCase()))
    .map((m) => new RegExp(m[1], 'i'));
})();

const PGHOST = process.env.AIACT_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.AIACT_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.AIACT_TEST_PGUSER ?? (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.AIACT_TEST_PGPASSWORD;
const DBNAME = `ai_action_proposals_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const INST_A = '00000000-0000-4000-8000-0000000000a1';
const INST_B = '00000000-0000-4000-8000-0000000000a2';
const OWNER = '00000000-0000-4000-8000-000000000101';
const OTHER = '00000000-0000-4000-8000-000000000102';
const STAFF_P = '00000000-0000-4000-8000-000000000201'; // team member, inst A, has email
const LEARNER_P = '00000000-0000-4000-8000-000000000202'; // learner login, inst A
const LEARNER_ID = '00000000-0000-4000-8000-000000000302'; // learners_profiles id
const NOEMAIL_P = '00000000-0000-4000-8000-000000000203'; // inst A, no email
const FAR_P = '00000000-0000-4000-8000-000000000204'; // inst B — not reachable
const INACTIVE_P = '00000000-0000-4000-8000-000000000205'; // inst A, deactivated
const NONAME_P = '00000000-0000-4000-8000-000000000206'; // inst A, blank name, team member
const STAFF_ROW = '00000000-0000-4000-8000-000000000401';
const OWNER_STAFF_ROW = '00000000-0000-4000-8000-000000000402';
const NONAME_STAFF_ROW = '00000000-0000-4000-8000-000000000403';
const NOEMAIL_STAFF_ROW = '00000000-0000-4000-8000-000000000404'; // team member, on NO project
const PROJECT = '00000000-0000-4000-8000-000000000501';
const OTHER_PROJECT = '00000000-0000-4000-8000-000000000502';
const JOB = '00000000-0000-4000-8000-000000000601';
const CONV = '00000000-0000-4000-8000-000000000701';

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Supabase's default grants, reproduced so the migration's REVOKEs are real.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, full_name text, email text, institution_id uuid,
  learner_id uuid, role text, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text, display_name text);
CREATE TABLE public.custom_roles (role_key text PRIMARY KEY, role_name text);
CREATE TABLE public.learners_profiles (id uuid PRIMARY KEY, roll_number text, register_number text);
CREATE TABLE public.staff (id uuid PRIMARY KEY, profile_id uuid, staff_id text);
CREATE TABLE public.projects (id uuid PRIMARY KEY, title text NOT NULL, owner_staff_id uuid);
CREATE TABLE public.project_members (project_id uuid, staff_id uuid, role text NOT NULL DEFAULT 'member');
CREATE TABLE public.ai_jobs (
  id uuid PRIMARY KEY, job_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
  requested_by uuid NOT NULL, status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, started_at timestamptz);
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text);
CREATE TABLE public.user_notifications (notification_id uuid, user_id uuid);

-- Test-controlled answers for the three production permission helpers.
CREATE TABLE public.t_grants (user_id uuid, perm text);
CREATE TABLE public.t_inst_access (user_id uuid, institution_id uuid);
CREATE TABLE public.t_super (user_id uuid);
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM t_super WHERE user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM t_grants WHERE user_id = auth.uid() AND perm = permission_name) $$;
CREATE FUNCTION public.role_has_institution_access(uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM t_inst_access WHERE user_id = auth.uid() AND institution_id = $1) $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM t_super WHERE user_id = auth.uid()) $$;
`;

const FIXTURE = `
TRUNCATE public.profiles, public.staff, public.projects, public.project_members, public.ai_jobs,
         public.notifications, public.user_notifications, public.t_grants, public.t_inst_access,
         public.t_super, public.ai_action_proposals, public.institutions, public.custom_roles,
         public.learners_profiles;
INSERT INTO public.institutions (id, name, display_name) VALUES
  ('${INST_A}', 'JKKN College A', 'JKKN College A'), ('${INST_B}', 'JKKN College B', NULL);
-- Production role names really do read 'Student' and 'Staff' (custom_roles, 2026-09-23).
INSERT INTO public.custom_roles (role_key, role_name) VALUES
  ('student', 'Student'), ('staff', 'Staff'), ('faculty', 'Facilitator'), ('principal', 'Principal');
INSERT INTO public.learners_profiles (id, roll_number, register_number) VALUES ('${LEARNER_ID}', 'R-17', '611223104017');
INSERT INTO public.profiles (id, full_name, email, institution_id, learner_id, role, is_active) VALUES
  ('${OWNER}',      'Owner Person',   'owner@jkkn.ac.in',   '${INST_A}', NULL, 'principal', true),
  ('${OTHER}',      'Other Person',   'other@jkkn.ac.in',   '${INST_A}', NULL, 'principal', true),
  ('${STAFF_P}',    'Asha Kumar',     'asha@jkkn.ac.in',    '${INST_A}', NULL, 'faculty', true),
  ('${LEARNER_P}',  'Bala Learner',   'bala@jkkn.ac.in',    '${INST_A}', '${LEARNER_ID}', 'student', true),
  ('${NOEMAIL_P}',  'Chitra NoEmail', NULL,                 '${INST_A}', NULL, 'staff', true),
  ('${FAR_P}',      'Far Away',       'far@jkkn.ac.in',     '${INST_B}', NULL, 'faculty', true),
  ('${INACTIVE_P}', 'Gone Person',    'gone@jkkn.ac.in',    '${INST_A}', NULL, 'faculty', false),
  ('${NONAME_P}',   '   ',            'noname@jkkn.ac.in',  '${INST_A}', NULL, 'staff', true);
INSERT INTO public.staff (id, profile_id, staff_id) VALUES
  ('${STAFF_ROW}', '${STAFF_P}', 'AATS001'), ('${OWNER_STAFF_ROW}', '${OWNER}', 'AATS900'),
  ('${NONAME_STAFF_ROW}', '${NONAME_P}', NULL), ('${NOEMAIL_STAFF_ROW}', '${NOEMAIL_P}', NULL);
-- OWNER owns PROJECT; Asha is a member of it; nobody is on OTHER_PROJECT.
INSERT INTO public.projects (id, title, owner_staff_id) VALUES
  ('${PROJECT}', 'Library Revamp', '${OWNER_STAFF_ROW}'), ('${OTHER_PROJECT}', 'Canteen', NULL);
INSERT INTO public.project_members (project_id, staff_id, role) VALUES ('${PROJECT}', '${STAFF_ROW}', 'member');
INSERT INTO public.ai_jobs (id, job_type, payload, requested_by, status, claimed_at)
  VALUES ('${JOB}', 'ai_query.chat', '{"conversation_id":"${CONV}"}', '${OWNER}', 'running', now());
INSERT INTO public.t_grants VALUES
  ('${OWNER}', 'notifications.send'), ('${OWNER}', 'projects.view'),
  ('${OTHER}', 'notifications.send');
INSERT INTO public.t_inst_access VALUES ('${OWNER}', '${INST_A}'), ('${OTHER}', '${INST_A}');
`;

let admin: Client;
let db: Client;
let adminConnected = false;
let dbConnected = false;

function client(database: string) {
  return new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database });
}

/** Run one statement as `authenticated` with the given user, like PostgREST does. */
async function asUser<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query('BEGIN');
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await db.query(`SET LOCAL ROLE ${uid ? 'authenticated' : 'anon'}`);
    const r = await db.query(sql, params);
    await db.query('COMMIT');
    return r.rows as T[];
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}

async function propose(uid: string, args: Record<string, unknown>) {
  const keys = Object.keys(args);
  const named = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const rows = await asUser(uid, `SELECT public.ai_rpc_propose_action(${named}) AS r`, keys.map((k) => args[k]));
  return rows[0].r;
}

async function claim(uid: string, id: string) {
  return (await asUser(uid, `SELECT public.fn_ai_claim_action_proposal($1) AS r`, [id]))[0].r;
}
async function cancel(uid: string, id: string) {
  return (await asUser(uid, `SELECT public.fn_ai_cancel_action_proposal($1) AS r`, [id]))[0].r;
}
async function row(id: string) {
  return (await db.query('SELECT * FROM public.ai_action_proposals WHERE id = $1', [id])).rows[0];
}

const MESSAGE = {
  p_kind: 'in_app_message',
  p_title: 'Library closed tomorrow',
  p_body: 'The library is closed tomorrow.',
};

beforeAll(async () => {
  admin = client('postgres');
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  db = client(DBNAME);
  await db.connect();
  dbConnected = true;
  await db.query(SCHEMA);
  await applyMigrations(db);
});

afterAll(async () => {
  if (dbConnected) await db.end();
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
    await admin.end();
  }
});

beforeEach(async () => {
  await db.query(FIXTURE);
});

describe('ai_rpc_propose_action', () => {
  it('stores a pending proposal and sends NOTHING', async () => {
    const r = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P], p_learner_ids: [LEARNER_ID] });
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/^NOTHING HAS BEEN SENT/);
    const p = await row(r.proposal_id);
    expect(p.status).toBe('pending');
    expect(p.confirmed_at).toBeNull();
    expect(p.recipient_count).toBe(2);
    const n = await db.query('SELECT (SELECT count(*) FROM notifications) + (SELECT count(*) FROM user_notifications) AS c');
    expect(Number(n.rows[0].c)).toBe(0);
  });

  it('resolves a learner through profiles.learner_id and never stores an email address', async () => {
    const r = await propose(OWNER, { ...MESSAGE, p_learner_ids: [LEARNER_ID] });
    const p = await row(r.proposal_id);
    expect(p.recipients).toEqual([{
      profile_id: LEARNER_P, display_name: 'Bala Learner', has_email: true,
      college: 'JKKN College A', role: 'Learner', id_label: 'Register no.', id_number: '611223104017',
    }]);
    expect(JSON.stringify(p.recipients)).not.toContain('@');
  });

  it('shows who is who: college, role, identifier, and never hides a blank name', async () => {
    const r = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P, NOEMAIL_P, NONAME_P] });
    const byId = Object.fromEntries((await row(r.proposal_id)).recipients.map((x: any) => [x.profile_id, x]));
    // Production's faculty role is named after a banned teaching word; the card says Senior Learner.
    expect(byId[STAFF_P]).toMatchObject({ role: 'Senior Learner', college: 'JKKN College A', id_label: 'Employee no.', id_number: 'AATS001' });
    // Production's role_name 'Staff' is shown as Team member, never the banned word.
    expect(byId[NOEMAIL_P]).toMatchObject({ role: 'Team member', id_label: null, id_number: null });
    expect(byId[NONAME_P]).toMatchObject({ display_name: 'No name on file', role: 'Team member' });
    // The summary the assistant repeats names each person with the same details.
    expect(r.summary).toContain('Asha Kumar (Senior Learner, JKKN College A, Employee no. AATS001)');
    expect(r.summary).toContain('No name on file (Team member, JKKN College A)');
    expect(PEOPLE_WORDS.some((re) => re.test(r.summary))).toBe(false);
  });

  it('never reports the same person twice as "not reachable"', async () => {
    // The learner id AND that learner's own profile id, plus a repeated id and one far-away person.
    const r = await propose(OWNER, {
      ...MESSAGE,
      p_learner_ids: [LEARNER_ID],
      p_profile_ids: [LEARNER_P, STAFF_P, STAFF_P, FAR_P],
    });
    expect(r.success).toBe(true);
    expect(r.recipient_count).toBe(2);
    expect(r.skipped.not_reachable).toBe(1);
  });

  it('leaves out people the caller cannot reach (other college, deactivated) and counts them', async () => {
    const r = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P, FAR_P, INACTIVE_P] });
    expect(r.success).toBe(true);
    expect(r.recipient_count).toBe(1);
    expect(r.skipped.not_reachable).toBe(2);
    const p = await row(r.proposal_id);
    expect(p.recipients.map((x: any) => x.profile_id)).toEqual([STAFF_P]);
  });

  it('refuses when nobody is reachable', async () => {
    const r = await propose(OWNER, { ...MESSAGE, p_profile_ids: [FAR_P] });
    expect(r.success).toBe(false);
    expect(r.error.code).toBe('NO_VISIBLE_RECIPIENTS');
    expect(Number((await db.query('SELECT count(*) FROM ai_action_proposals')).rows[0].count)).toBe(0);
  });

  it('requires the same permission as the notification screen', async () => {
    await db.query(`DELETE FROM t_grants WHERE user_id = '${OWNER}' AND perm = 'notifications.send'`);
    const r = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    expect(r.success).toBe(false);
    expect(r.error.code).toBe('PERMISSION_DENIED');
    // notifications.create alone is enough for an in-app message, exactly like
    // app/api/notifications/send ...
    await db.query(`INSERT INTO t_grants VALUES ('${OWNER}', 'notifications.create')`);
    expect((await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] })).success).toBe(true);
    // ... but NOT for an email, which needs notifications.send (Director, 2026-09-23).
    const email = await propose(OWNER, { ...MESSAGE, p_kind: 'email', p_profile_ids: [STAFF_P] });
    expect(email.error.code).toBe('PERMISSION_DENIED');
  });

  it('refuses more than 200 people', async () => {
    const ids = Array.from({ length: 201 }, () => randomUUID());
    const r = await propose(OWNER, { ...MESSAGE, p_profile_ids: ids });
    expect(r.success).toBe(false);
    expect(r.error.code).toBe('TOO_MANY_RECIPIENTS');
  });

  it('email leaves out people with no address, and stores the exact footer the card shows', async () => {
    const r = await propose(OWNER, { ...MESSAGE, p_kind: 'email', p_profile_ids: [STAFF_P, NOEMAIL_P] });
    expect(r.success).toBe(true);
    expect(r.recipient_count).toBe(1);
    expect(r.skipped.no_email).toBe(1);
    const footer = 'Sent on behalf of Owner Person through MyJKKN. Reply to this email to reach Owner Person directly.';
    expect((await row(r.proposal_id)).email_footer).toBe(footer);
    const c = await claim(OWNER, r.proposal_id);
    expect(c.proposal.email_footer).toBe(footer);
    const card = await asUser(OWNER, 'SELECT email_footer FROM fn_ai_my_action_proposals(NULL, $1)', [JOB]);
    expect(card[0].email_footer).toBe(footer);
    // An in-app message carries no footer.
    const msg = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    expect((await row(msg.proposal_id)).email_footer).toBeNull();
  });

  it('a task goes to one team member, in a project BOTH people are on', async () => {
    const TASK = { ...MESSAGE, p_kind: 'create_task' };
    const noProject = await propose(OWNER, { ...TASK, p_profile_ids: [STAFF_P] });
    expect(noProject.error.code).toBe('PROJECT_REQUIRED');
    // A learner has no team-member record, so cannot be given a task.
    const notTeam = await propose(OWNER, { ...TASK, p_profile_ids: [LEARNER_P], p_project_id: PROJECT });
    expect(notTeam.error.code).toBe('NO_VISIBLE_RECIPIENTS');
    expect(PEOPLE_WORDS.some((re) => re.test(notTeam.error.message))).toBe(false);
    // The person asking is not on OTHER_PROJECT: refused before anyone is resolved.
    const notMine = await propose(OWNER, { ...TASK, p_profile_ids: [STAFF_P], p_project_id: OTHER_PROJECT });
    expect(notMine.error.code).toBe('NOT_ON_PROJECT');
    // A team member who is not on the project cannot be the assignee.
    const notTheirs = await propose(OWNER, { ...TASK, p_profile_ids: [NOEMAIL_P], p_project_id: PROJECT });
    expect(notTheirs.error.code).toBe('NO_VISIBLE_RECIPIENTS');
    expect(notTheirs.error.message).toContain('owner or a member of the project');
    // A viewer is not a member for this purpose.
    await db.query(`UPDATE project_members SET role = 'viewer' WHERE staff_id = '${STAFF_ROW}'`);
    expect((await propose(OWNER, { ...TASK, p_profile_ids: [STAFF_P], p_project_id: PROJECT })).error.code).toBe('NO_VISIBLE_RECIPIENTS');
    await db.query(`UPDATE project_members SET role = 'member' WHERE staff_id = '${STAFF_ROW}'`);
    const ok = await propose(OWNER, { ...TASK, p_profile_ids: [STAFF_P], p_project_id: PROJECT, p_due_date: '2026-10-01' });
    expect(ok.success).toBe(true);
    expect((await row(ok.proposal_id)).task).toEqual({ project_id: PROJECT, project_title: 'Library Revamp', due_date: '2026-10-01' });
    // The claim hands the route the assignee's team-member row ON THIS PROJECT.
    const c = await claim(OWNER, ok.proposal_id);
    expect(c.success).toBe(true);
    expect(c.proposal.assignee_staff_id).toBe(STAFF_ROW);
  });

  it('re-checks project membership at click time', async () => {
    const TASK = { ...MESSAGE, p_kind: 'create_task', p_project_id: PROJECT };
    const a = await propose(OWNER, { ...TASK, p_profile_ids: [STAFF_P] });
    await db.query(`DELETE FROM project_members WHERE staff_id = '${STAFF_ROW}'`);
    expect((await claim(OWNER, a.proposal_id)).code).toBe('RECIPIENTS_CHANGED');
    expect((await row(a.proposal_id)).confirmed_at).toBeNull();
    await db.query(`INSERT INTO project_members (project_id, staff_id) VALUES ('${PROJECT}', '${STAFF_ROW}')`);
    const b = await propose(OWNER, { ...TASK, p_profile_ids: [STAFF_P] });
    await db.query(`UPDATE projects SET owner_staff_id = NULL WHERE id = '${PROJECT}'`);
    expect((await claim(OWNER, b.proposal_id)).code).toBe('NOT_ON_PROJECT');
    expect((await row(b.proposal_id)).status).toBe('failed');
  });

  it('ties the proposal to the caller’s own running chat job, never someone else’s', async () => {
    const mine = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    const p = await row(mine.proposal_id);
    expect(p.job_id).toBe(JOB);
    expect(p.conversation_id).toBe(CONV);
    // OTHER passes OWNER's job id explicitly: it is ignored, and OTHER has no
    // question being answered, so NO card is stored (it could never be seen).
    const theirs = await propose(OTHER, { ...MESSAGE, p_profile_ids: [STAFF_P], p_job_id: JOB });
    expect(theirs.success).toBe(false);
    expect(theirs.error.code).toBe('NO_ANSWER_TO_ATTACH');
    expect(Number((await db.query(`SELECT count(*) FROM ai_action_proposals WHERE requested_by = '${OTHER}'`)).rows[0].count)).toBe(0);
  });

  it('refuses to store an orphan card when no question is being answered', async () => {
    await db.query(`UPDATE ai_jobs SET status = 'done' WHERE id = '${JOB}'`);
    const r = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    expect(r.error.code).toBe('NO_ANSWER_TO_ATTACH');
    expect(Number((await db.query('SELECT count(*) FROM ai_action_proposals')).rows[0].count)).toBe(0);
    // An explicit job id of the caller's own finished question still attaches it.
    const explicit = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P], p_job_id: JOB });
    expect(explicit.success).toBe(true);
    expect((await row(explicit.proposal_id)).job_id).toBe(JOB);
  });
});

describe('fn_ai_claim_action_proposal (the Confirm click)', () => {
  it('succeeds exactly once — a second click is refused', async () => {
    const { proposal_id } = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P, LEARNER_P] });
    const first = await claim(OWNER, proposal_id);
    expect(first.success).toBe(true);
    expect(first.proposal.recipient_ids.sort()).toEqual([STAFF_P, LEARNER_P].sort());
    const second = await claim(OWNER, proposal_id);
    expect(second.success).toBe(false);
    expect(second.code).toBe('ALREADY_CONFIRMED');
  });

  it('is owner-only: another person sees NOT_FOUND and cannot cancel or read it', async () => {
    const { proposal_id } = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    expect((await claim(OTHER, proposal_id)).code).toBe('NOT_FOUND');
    expect((await cancel(OTHER, proposal_id)).code).toBe('NOT_FOUND');
    expect(await asUser(OTHER, 'SELECT id FROM ai_action_proposals')).toEqual([]);
    expect(await asUser(OTHER, 'SELECT id FROM fn_ai_my_action_proposals($1, $2)', [CONV, JOB])).toEqual([]);
    expect((await asUser(OWNER, 'SELECT id FROM fn_ai_my_action_proposals(NULL, $1)', [JOB])).length).toBe(1);
    expect((await row(proposal_id)).confirmed_at).toBeNull();
  });

  it('re-checks permission at click time', async () => {
    const { proposal_id } = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    await db.query(`DELETE FROM t_grants WHERE user_id = '${OWNER}'`);
    const r = await claim(OWNER, proposal_id);
    expect(r.code).toBe('PERMISSION_DENIED');
    const p = await row(proposal_id);
    expect(p.status).toBe('failed');
    expect(p.confirmed_at).toBeNull();
  });

  it('re-checks recipients at click time (someone moved out of reach)', async () => {
    const { proposal_id } = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P, LEARNER_P] });
    await db.query(`UPDATE profiles SET institution_id = '${INST_B}' WHERE id = '${LEARNER_P}'`);
    const r = await claim(OWNER, proposal_id);
    expect(r.code).toBe('RECIPIENTS_CHANGED');
    expect((await row(proposal_id)).confirmed_at).toBeNull();
  });

  it('a cancelled proposal cannot be confirmed', async () => {
    const { proposal_id } = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    expect((await cancel(OWNER, proposal_id)).success).toBe(true);
    const r = await claim(OWNER, proposal_id);
    expect(r.code).toBe('NOT_PENDING');
    expect((await row(proposal_id)).status).toBe('cancelled');
  });

  it('an expired proposal cannot be confirmed, and is marked expired', async () => {
    const { proposal_id } = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    await db.query(`UPDATE ai_action_proposals SET expires_at = now() - interval '1 minute' WHERE id = $1`, [proposal_id]);
    expect((await asUser(OWNER, 'SELECT effective_status FROM fn_ai_my_action_proposals(NULL, $1)', [JOB]))[0].effective_status).toBe('expired');
    const r = await claim(OWNER, proposal_id);
    expect(r.code).toBe('EXPIRED');
    const p = await row(proposal_id);
    expect(p.status).toBe('expired');
    expect(p.confirmed_at).toBeNull();
  });

  it('a confirmed proposal can no longer be cancelled', async () => {
    const { proposal_id } = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    await claim(OWNER, proposal_id);
    expect((await cancel(OWNER, proposal_id)).code).toBe('NOT_PENDING');
  });

  it('a card stuck in "Sending…" is closed as failed after 10 minutes, and nothing else is touched', async () => {
    const stuck = (await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] })).proposal_id;
    const fresh = (await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] })).proposal_id;
    const waiting = (await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] })).proposal_id;
    await claim(OWNER, stuck);
    await claim(OWNER, fresh);
    await db.query(`UPDATE ai_action_proposals SET confirmed_at = now() - interval '11 minutes' WHERE id = $1`, [stuck]);
    expect((await asUser(OWNER, 'SELECT id, effective_status FROM fn_ai_my_action_proposals(NULL, $1)', [JOB]))
      .find((x: any) => x.id === stuck).effective_status).toBe('sending');
    // A signed-in person cannot run it at all ...
    await expect(asUser(OWNER, 'SELECT public.fn_ai_action_proposals_fail_stuck()')).rejects.toThrow(/permission denied/);
    // ... the scheduler (no signed-in person) can.
    const closed = await db.query('SELECT public.fn_ai_action_proposals_fail_stuck() AS n');
    expect(closed.rows[0].n).toBe(1);
    expect(await row(stuck)).toMatchObject({ status: 'failed', error: 'Delivery could not be confirmed — check before sending again.' });
    expect((await row(fresh)).status).toBe('pending');
    expect((await row(waiting)).status).toBe('pending');
    expect((await row(waiting)).confirmed_at).toBeNull();
  });

  it('stops at 20 confirmed actions a day', async () => {
    await db.query(`
      INSERT INTO ai_action_proposals (requested_by, kind, title, body, recipients, recipient_count, status, confirmed_at)
      SELECT '${OWNER}', 'in_app_message', 't', 'b', '[]', 1, 'sent', now() FROM generate_series(1, 20)`);
    const { proposal_id } = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    const r = await claim(OWNER, proposal_id);
    expect(r.code).toBe('DAILY_LIMIT');
    expect((await row(proposal_id)).status).toBe('pending');
  });
});

describe('access', () => {
  it('authenticated cannot write the table directly', async () => {
    await expect(
      asUser(OWNER, `INSERT INTO ai_action_proposals (requested_by, kind, title, body) VALUES ('${OWNER}', 'email', 't', 'b')`)
    ).rejects.toThrow(/permission denied/);
    const { proposal_id } = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    await expect(
      asUser(OWNER, `UPDATE ai_action_proposals SET status = 'sent' WHERE id = '${proposal_id}'`)
    ).rejects.toThrow(/permission denied/);
  });

  it('anon can execute none of the functions', async () => {
    for (const sql of [
      `SELECT public.ai_rpc_propose_action('email', 't', 'b')`,
      `SELECT public.fn_ai_claim_action_proposal('${JOB}')`,
      `SELECT public.fn_ai_cancel_action_proposal('${JOB}')`,
      `SELECT * FROM public.fn_ai_my_action_proposals('${CONV}')`,
    ]) {
      await expect(asUser(null, sql)).rejects.toThrow(/permission denied/);
    }
  });

  it('the internal helpers are not callable by signed-in people', async () => {
    await expect(asUser(OWNER, `SELECT public.fn_ai_action_can_perform('email')`)).rejects.toThrow(/permission denied/);
    await expect(
      asUser(OWNER, `SELECT * FROM public.fn_ai_action_visible_recipients(NULL, ARRAY['${FAR_P}']::uuid[])`)
    ).rejects.toThrow(/permission denied/);
  });

  it('registers propose_action for the assistant only, never the outside-AI door', async () => {
    const r = await db.query(`SELECT kind, target, audience, is_write, requires_permission, params FROM ai_tool_catalog WHERE name = 'propose_action'`);
    expect(r.rows[0]).toMatchObject({ kind: 'rpc', target: 'ai_rpc_propose_action', audience: ['assistant'], is_write: false, requires_permission: null });
    // Every parameter the schema advertises is a real argument of the function.
    const args = await db.query(`
      SELECT unnest(proargnames) AS a FROM pg_proc WHERE proname = 'ai_rpc_propose_action'`);
    expect(Object.keys(r.rows[0].params.properties).sort()).toEqual(args.rows.map((x) => x.a).sort());
  });

  it('every person-facing string in both migrations uses the JKKN words for people', async () => {
    // The terminology gate does not scan .sql, so this does, with the gate's own
    // dictionary. Regex patterns (the role-name rewrite) are code, not copy.
    expect(PEOPLE_WORDS.length).toBeGreaterThan(10);
    for (const file of [MIGRATION, MIGRATION_OWNER_ONLY]) {
      const sql = readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
      const literals: string[] = sql.match(/'(?:[^']|'')*'/g) ?? [];
      const bad = literals.filter((l) => !l.includes('\\m') && PEOPLE_WORDS.some((re) => re.test(l)));
      expect(bad).toEqual([]);
    }
  });

  it('re-applying the migration is safe (idempotent)', async () => {
    await applyMigrations(db);
    expect(Number((await db.query(`SELECT count(*) FROM ai_tool_catalog WHERE name = 'propose_action'`)).rows[0].count)).toBe(1);
  });
});
