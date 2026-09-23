/**
 * AI Assistant actions — the database half, proved on a real PostgreSQL.
 *
 * supabase/migrations/20270302090000_ai_action_proposals.sql is applied
 * VERBATIM to a throwaway database over a minimal stand-in of the production
 * objects it touches (profiles, staff, projects, ai_jobs, notifications, and
 * the three permission helpers, whose answers each test sets explicitly).
 * Every assertion reads what PostgreSQL actually did.
 *
 * What must hold:
 *   - proposing never sends: no notifications / user_notifications row;
 *   - the caller needs the same permission the normal screen needs;
 *   - only people the caller can reach are resolved; learners through
 *     profiles.learner_id; more than 200 is refused;
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
const MIGRATION = path.join(REPO, 'supabase/migrations/20270302090000_ai_action_proposals.sql');

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
const STAFF_P = '00000000-0000-4000-8000-000000000201'; // staff, inst A, has email
const LEARNER_P = '00000000-0000-4000-8000-000000000202'; // learner login, inst A
const LEARNER_ID = '00000000-0000-4000-8000-000000000302'; // learners_profiles id
const NOEMAIL_P = '00000000-0000-4000-8000-000000000203'; // inst A, no email
const FAR_P = '00000000-0000-4000-8000-000000000204'; // inst B — not reachable
const INACTIVE_P = '00000000-0000-4000-8000-000000000205'; // inst A, deactivated
const STAFF_ROW = '00000000-0000-4000-8000-000000000401';
const PROJECT = '00000000-0000-4000-8000-000000000501';
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
  learner_id uuid, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.staff (id uuid PRIMARY KEY, profile_id uuid);
CREATE TABLE public.projects (id uuid PRIMARY KEY, title text NOT NULL);
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
TRUNCATE public.profiles, public.staff, public.projects, public.ai_jobs, public.notifications,
         public.user_notifications, public.t_grants, public.t_inst_access, public.t_super,
         public.ai_action_proposals;
INSERT INTO public.profiles (id, full_name, email, institution_id, learner_id, is_active) VALUES
  ('${OWNER}',      'Owner Person',   'owner@jkkn.ac.in',   '${INST_A}', NULL, true),
  ('${OTHER}',      'Other Person',   'other@jkkn.ac.in',   '${INST_A}', NULL, true),
  ('${STAFF_P}',    'Asha Staff',     'asha@jkkn.ac.in',    '${INST_A}', NULL, true),
  ('${LEARNER_P}',  'Bala Learner',   'bala@jkkn.ac.in',    '${INST_A}', '${LEARNER_ID}', true),
  ('${NOEMAIL_P}',  'Chitra NoEmail', NULL,                 '${INST_A}', NULL, true),
  ('${FAR_P}',      'Far Away',       'far@jkkn.ac.in',     '${INST_B}', NULL, true),
  ('${INACTIVE_P}', 'Gone Person',    'gone@jkkn.ac.in',    '${INST_A}', NULL, false);
INSERT INTO public.staff (id, profile_id) VALUES ('${STAFF_ROW}', '${STAFF_P}');
INSERT INTO public.projects (id, title) VALUES ('${PROJECT}', 'Library Revamp');
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
  p_title: 'Lab closed tomorrow',
  p_body: 'The chemistry lab is closed tomorrow.',
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
  await db.query(readFileSync(MIGRATION, 'utf8'));
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
    expect(p.recipients).toEqual([{ profile_id: LEARNER_P, display_name: 'Bala Learner', has_email: true }]);
    expect(JSON.stringify(p.recipients)).not.toContain('@');
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
    // notifications.create alone is enough, exactly like app/api/notifications/send.
    await db.query(`INSERT INTO t_grants VALUES ('${OWNER}', 'notifications.create')`);
    expect((await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] })).success).toBe(true);
  });

  it('refuses more than 200 people', async () => {
    const ids = Array.from({ length: 201 }, () => randomUUID());
    const r = await propose(OWNER, { ...MESSAGE, p_profile_ids: ids });
    expect(r.success).toBe(false);
    expect(r.error.code).toBe('TOO_MANY_RECIPIENTS');
  });

  it('email leaves out people with no address', async () => {
    const r = await propose(OWNER, { ...MESSAGE, p_kind: 'email', p_profile_ids: [STAFF_P, NOEMAIL_P] });
    expect(r.success).toBe(true);
    expect(r.recipient_count).toBe(1);
    expect(r.skipped.no_email).toBe(1);
  });

  it('a task goes to one staff member in an existing project', async () => {
    const noProject = await propose(OWNER, { ...MESSAGE, p_kind: 'create_task', p_profile_ids: [STAFF_P] });
    expect(noProject.error.code).toBe('PROJECT_REQUIRED');
    const notStaff = await propose(OWNER, { ...MESSAGE, p_kind: 'create_task', p_profile_ids: [LEARNER_P], p_project_id: PROJECT });
    expect(notStaff.error.code).toBe('NO_VISIBLE_RECIPIENTS');
    const ok = await propose(OWNER, { ...MESSAGE, p_kind: 'create_task', p_profile_ids: [STAFF_P], p_project_id: PROJECT, p_due_date: '2026-10-01' });
    expect(ok.success).toBe(true);
    expect((await row(ok.proposal_id)).task).toEqual({ project_id: PROJECT, project_title: 'Library Revamp', due_date: '2026-10-01' });
  });

  it('ties the proposal to the caller’s own running chat job, never someone else’s', async () => {
    const mine = await propose(OWNER, { ...MESSAGE, p_profile_ids: [STAFF_P] });
    const p = await row(mine.proposal_id);
    expect(p.job_id).toBe(JOB);
    expect(p.conversation_id).toBe(CONV);
    // OTHER passes OWNER's job id explicitly: it is ignored.
    const theirs = await propose(OTHER, { ...MESSAGE, p_profile_ids: [STAFF_P], p_job_id: JOB });
    expect((await row(theirs.proposal_id)).job_id).toBeNull();
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
    await expect(asUser(OWNER, `SELECT public.fn_ai_action_kind_allowed('email')`)).rejects.toThrow(/permission denied/);
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

  it('re-applying the migration is safe (idempotent)', async () => {
    await db.query(readFileSync(MIGRATION, 'utf8'));
    expect(Number((await db.query(`SELECT count(*) FROM ai_tool_catalog WHERE name = 'propose_action'`)).rows[0].count)).toBe(1);
  });
});
