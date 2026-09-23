/**
 * A learner's drive notification opens a page the learner can see.
 *
 * Behavioural proof for
 * supabase/migrations/20260914210000_cdc_drive_notifications_point_learners_at_their_page.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration is applied VERBATIM to a throwaway PostgreSQL and the emitter is
 * called for every transition the way the status trigger calls it. Each test
 * reads back the `notifications` rows PostgreSQL actually wrote — recipients and
 * the URL each recipient will be sent to.
 *
 * NON-VACUITY IS PROVED, NOT ASSERTED
 * -----------------------------------
 * The control is not a hand-built wrong shape. It is production's own
 * definition, read from the live catalogue on 2026-09-14 and installed beside
 * the fix under another name (_fixtures/…live-2026-09-14.sql). Against the SAME
 * fixture it sends every learner to the coordinator page. If the shipped
 * function ever regressed to that shape, the control test would stop
 * distinguishing them and fail.
 *
 * RUNNING IT
 * ----------
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/cdc/drive-notification-learner-url.test.ts
 *
 * Override the server with CDCURL_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 * Loud rather than skipped when no server is reachable.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20260914210000_cdc_drive_notifications_point_learners_at_their_page.sql'
);
const CONTROL = path.join(
  __dirname,
  '_fixtures/fn_cdc_emit_drive_notification.live-2026-09-14.sql'
);

const PGHOST = process.env.CDCURL_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.CDCURL_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.CDCURL_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const PGPASSWORD = process.env.CDCURL_TEST_PGPASSWORD;

const DBNAME = `cdc_notif_url_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const DRIVE = '00000000-0000-4000-8000-0000000000d1';
const PROGRAM = '00000000-0000-4000-8000-0000000000a1';
const ACTOR = '00000000-0000-4000-8000-0000000000c9';

// Team member: one coordinator, one head, on the two custom roles the emitter names.
const ROLE = { coordinator: '00000000-0000-4000-8000-0000000000e1', head: '00000000-0000-4000-8000-0000000000e2' };
const TEAM = { coordinator: '00000000-0000-4000-8000-0000000000b1', head: '00000000-0000-4000-8000-0000000000b2' };

// Learners: profile id (what notifications target) + learners_profiles id.
const L = {
  willing:   { profile: '00000000-0000-4000-8000-0000000000f1', learner: '00000000-0000-4000-8000-000000000001' },
  confirmed: { profile: '00000000-0000-4000-8000-0000000000f2', learner: '00000000-0000-4000-8000-000000000002' },
  withdrawn: { profile: '00000000-0000-4000-8000-0000000000f3', learner: '00000000-0000-4000-8000-000000000003' },
  /** Eligible by programme but never declared — reached by willingness_open only. */
  silent:    { profile: '00000000-0000-4000-8000-0000000000f4', learner: '00000000-0000-4000-8000-000000000004' },
} as const;

const COORD_URL = `/cdc/drives/${DRIVE}`;
const LEARNER_URL = `/cdc/drives/${DRIVE}/willingness`;

/** The slice of the estate the emitter reads, from the live catalogue 2026-09-14. */
const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

CREATE TYPE public.cdc_willingness_status AS ENUM ('willing','confirmed','withdrawn','no_show');

CREATE TABLE public.cdc_drives (
  id uuid PRIMARY KEY, title text NOT NULL, created_by uuid NOT NULL);
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY, role_key text NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL, role_id uuid NOT NULL);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, learner_id uuid);
CREATE TABLE public.learners_profiles (
  id uuid PRIMARY KEY, program_id uuid, lifecycle_status text NOT NULL);
CREATE TABLE public.cdc_drive_eligibility (
  drive_id uuid NOT NULL, program_ids uuid[] NOT NULL);
CREATE TABLE public.cdc_drive_willingness (
  drive_id uuid NOT NULL, learner_id uuid NOT NULL,
  status public.cdc_willingness_status NOT NULL DEFAULT 'willing');
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, body text NOT NULL, url text, created_by uuid NOT NULL,
  targeting jsonb NOT NULL, priority text, category text, kind text NOT NULL,
  metadata jsonb, idempotency_key text, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX notifications_idem ON public.notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
`;

const FIXTURE = `
TRUNCATE public.notifications, public.cdc_drive_willingness, public.cdc_drive_eligibility,
         public.learners_profiles, public.profiles, public.user_roles, public.custom_roles,
         public.cdc_drives;

INSERT INTO public.cdc_drives (id, title, created_by) VALUES ('${DRIVE}', 'Foxconn India', '${ACTOR}');

INSERT INTO public.custom_roles (id, role_key) VALUES
  ('${ROLE.coordinator}', 'cdc_coordinator'), ('${ROLE.head}', 'cdc_head');
INSERT INTO public.user_roles (user_id, role_id) VALUES
  ('${TEAM.coordinator}', '${ROLE.coordinator}'), ('${TEAM.head}', '${ROLE.head}');

INSERT INTO public.learners_profiles (id, program_id, lifecycle_status) VALUES
  ('${L.willing.learner}',   '${PROGRAM}', 'active'),
  ('${L.confirmed.learner}', '${PROGRAM}', 'active'),
  ('${L.withdrawn.learner}', '${PROGRAM}', 'active'),
  ('${L.silent.learner}',    '${PROGRAM}', 'active');
INSERT INTO public.profiles (id, learner_id) VALUES
  ('${L.willing.profile}',   '${L.willing.learner}'),
  ('${L.confirmed.profile}', '${L.confirmed.learner}'),
  ('${L.withdrawn.profile}', '${L.withdrawn.learner}'),
  ('${L.silent.profile}',    '${L.silent.learner}');

INSERT INTO public.cdc_drive_eligibility (drive_id, program_ids) VALUES ('${DRIVE}', ARRAY['${PROGRAM}']::uuid[]);

INSERT INTO public.cdc_drive_willingness (drive_id, learner_id, status) VALUES
  ('${DRIVE}', '${L.willing.learner}',   'willing'),
  ('${DRIVE}', '${L.confirmed.learner}', 'confirmed'),
  ('${DRIVE}', '${L.withdrawn.learner}', 'withdrawn');
`;

let admin: Client;
let db: Client;
let adminConnected = false;
let dbConnected = false;

type Row = {
  url: string;
  category: string;
  idempotency_key: string;
  targeting: { user_ids: string[] };
  metadata: Record<string, unknown>;
};

async function emit(from: string, to: string, fn = 'fn_cdc_emit_drive_notification') {
  await db.query(`SELECT public.${fn}('${DRIVE}', '${from}', '${to}', '${ACTOR}')`);
  const { rows } = await db.query(
    `SELECT url, category, idempotency_key, targeting, metadata
     FROM public.notifications ORDER BY created_at, idempotency_key`
  );
  return rows as Row[];
}

const ids = (r: Row) => r.targeting.user_ids.slice().sort();
const allTeam = [TEAM.coordinator, TEAM.head].sort();
const declared = [L.willing.profile, L.confirmed.profile].sort();

beforeAll(async () => {
  admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: 'postgres' });
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${DBNAME}`);

  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  dbConnected = true;

  await db.query(SCHEMA);
  await db.query(readFileSync(MIGRATION, 'utf8')); // VERBATIM
  await db.query(readFileSync(CONTROL, 'utf8'));   // production's own body, renamed
}, 60_000);

afterAll(async () => {
  if (dbConnected) await db.end();
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
});

beforeEach(async () => {
  await db.query(FIXTURE);
});

describe('learner-only transitions send learners to their own page', () => {
  it('willingness_open — every eligible active learner, at /willingness', async () => {
    const [row] = await emit('announced', 'willingness_open');
    expect(row.url).toBe(LEARNER_URL);
    // Eligibility, not declaration, is the audience here: the silent learner is in.
    expect(ids(row)).toEqual(
      [L.willing.profile, L.confirmed.profile, L.withdrawn.profile, L.silent.profile].sort()
    );
  });

  it('attendance_day — the declared learners, at /willingness', async () => {
    const [row] = await emit('eligibility_locked', 'attendance_day');
    expect(row.url).toBe(LEARNER_URL);
    expect(ids(row)).toEqual(declared);
  });

  it('results_announced — the declared learners, at /willingness', async () => {
    const [row] = await emit('attendance_day', 'results_announced');
    expect(row.url).toBe(LEARNER_URL);
    expect(ids(row)).toEqual(declared);
  });
});

describe('team-only transitions are untouched', () => {
  it.each([
    ['draft', 'announced'],
    ['willingness_open', 'eligibility_locked'],
  ])('%s → %s still points team members at the coordinator page', async (from, to) => {
    const [row] = await emit(from, to);
    expect(row.url).toBe(COORD_URL);
    expect(ids(row)).toEqual(allTeam);
  });

  it('closed still reaches the head only, at the coordinator page', async () => {
    const [row] = await emit('results_announced', 'closed');
    expect(row.url).toBe(COORD_URL);
    expect(ids(row)).toEqual([TEAM.head]);
  });
});

describe('cancelled — one row per audience', () => {
  it('writes a team row and a learner row, each with a page it can open', async () => {
    const rows = await emit('willingness_open', 'cancelled');
    expect(rows).toHaveLength(2);

    const team = rows.find((r) => r.metadata.audience === 'team')!;
    const learners = rows.find((r) => r.metadata.audience === 'learners')!;

    expect(team.url).toBe(COORD_URL);
    expect(ids(team)).toEqual(allTeam);

    expect(learners.url).toBe(LEARNER_URL);
    expect(ids(learners)).toEqual(declared);
    expect(ids(learners)).not.toContain(L.withdrawn.profile);
  });

  it('keeps the original key on the team row so an old cancellation is never re-sent', async () => {
    const rows = await emit('willingness_open', 'cancelled');
    const keys = rows.map((r) => r.idempotency_key).sort();
    expect(keys).toEqual([`cdc.drive.${DRIVE}.cancelled`, `cdc.drive.${DRIVE}.cancelled.learners`]);
  });

  it('writes only the team row when nobody had declared', async () => {
    await db.query(`DELETE FROM public.cdc_drive_willingness`);
    const rows = await emit('willingness_open', 'cancelled');
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.audience).toBe('team');
  });

  it('is idempotent — emitting twice still leaves two rows', async () => {
    await emit('willingness_open', 'cancelled');
    const rows = await emit('willingness_open', 'cancelled');
    expect(rows).toHaveLength(2);
  });
});

describe('the emitter is not reachable by a signed-in user', () => {
  it('grants EXECUTE to neither anon nor authenticated', async () => {
    const sig = 'public.fn_cdc_emit_drive_notification(uuid,text,text,uuid)';
    const { rows } = await db.query(`
      SELECT has_function_privilege('anon', '${sig}', 'EXECUTE')          AS anon_can,
             has_function_privilege('authenticated', '${sig}', 'EXECUTE') AS auth_can,
             has_function_privilege('service_role', '${sig}', 'EXECUTE')  AS svc_can`);
    expect(rows[0]).toEqual({ anon_can: false, auth_can: false, svc_can: true });
  });
});

// ---------------------------------------------------------------------------
// CONTROL — production's own definition, installed beside the fix.
// ---------------------------------------------------------------------------
describe('control — what production does today', () => {
  it('sends every learner to the coordinator page they cannot open', async () => {
    const [row] = await emit('announced', 'willingness_open', 'fn_ctl_live_emit');
    expect(row.url).toBe(COORD_URL);
    expect(row.url).not.toBe(LEARNER_URL);
  });

  it('crams both cancellation audiences into one row with one URL', async () => {
    const rows = await emit('willingness_open', 'cancelled', 'fn_ctl_live_emit');
    expect(rows).toHaveLength(1);
    expect(ids(rows[0])).toEqual([...allTeam, ...declared].sort());
    expect(rows[0].url).toBe(COORD_URL);
  });
});
