/**
 * A learner who said yes gets told when the drive moves.
 *
 * Behavioural proof for
 * supabase/migrations/20260912200000_cdc_drive_details_change_notifications.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration is applied VERBATIM to a throwaway PostgreSQL. Nothing here
 * re-implements the rule in TypeScript — each test performs the UPDATE a
 * coordinator's Save button performs, then reads back the `notifications` rows
 * PostgreSQL actually wrote. A test that modelled the SQL would only prove the
 * model agrees with itself, and would pass just as happily over a trigger that
 * notifies nobody.
 *
 * NON-VACUITY IS PROVED, NOT ASSERTED
 * -----------------------------------
 * Two control triggers are built from the two tempting-but-wrong shapes:
 *   fn_ctl_anyfield   fires on ANY column change, not just when/where
 *   fn_ctl_alldeclared ignores `withdrawn` and notifies everyone with a row
 * Against the SAME fixture each control produces an outcome the shipped function
 * does not — the any-field control notifies on an end-time tweak, the
 * all-declared control notifies a learner who pulled out. Without them,
 * "the withdrawn learner was not notified" could be true simply because nothing
 * notifies at all.
 *
 * RUNNING IT
 * ----------
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/cdc/drive-details-change-notification.test.ts
 *
 * Override the server with CDCNOTIFY_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 * Deliberately loud rather than skipped when no server is reachable: a silent
 * skip reports green over a suite that never executed.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20260912200000_cdc_drive_details_change_notifications.sql'
);

const PGHOST = process.env.CDCNOTIFY_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.CDCNOTIFY_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.CDCNOTIFY_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const PGPASSWORD = process.env.CDCNOTIFY_TEST_PGPASSWORD;

const DBNAME = `cdc_drive_details_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

// Fixed ids so a failure names a row, not a random uuid.
const DRIVE = '00000000-0000-4000-8000-0000000000d1';
const COORDINATOR = '00000000-0000-4000-8000-0000000000c1';
const L = {
  willing: '00000000-0000-4000-8000-000000000001',
  confirmed: '00000000-0000-4000-8000-000000000002',
  withdrawn: '00000000-0000-4000-8000-000000000003',
} as const;
const P = {
  willing: '00000000-0000-4000-8000-0000000000f1',
  confirmed: '00000000-0000-4000-8000-0000000000f2',
  withdrawn: '00000000-0000-4000-8000-0000000000f3',
} as const;

/**
 * The slice of the estate this migration touches, rebuilt from the LIVE catalog
 * (read 2026-09-12). Only the columns the migration reads or writes — a fuller
 * copy would drift.
 */
const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supabase grants EXECUTE on new functions to anon by default. Reproduced so the
-- migration's REVOKE has something real to revoke.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

CREATE TYPE public.cdc_drive_status AS ENUM (
  'draft','announced','willingness_open','eligibility_locked',
  'attendance_day','results_announced','closed','cancelled');

CREATE TYPE public.cdc_willingness_status AS ENUM (
  'willing','confirmed','withdrawn','no_show');

CREATE TABLE public.cdc_drives (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  status           public.cdc_drive_status NOT NULL DEFAULT 'draft',
  drive_date       date,
  drive_start_time time,
  drive_end_time   time,
  venue_label      text,
  location_url     text,
  drive_mode       text NOT NULL DEFAULT 'on_campus',
  created_by       uuid NOT NULL,
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.cdc_drive_willingness (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id   uuid NOT NULL,
  learner_id uuid NOT NULL,
  status     public.cdc_willingness_status NOT NULL DEFAULT 'willing');

CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY,
  learner_id uuid);

CREATE TABLE public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  body            text NOT NULL,
  url             text,
  created_by      uuid NOT NULL,
  targeting       jsonb NOT NULL,
  priority        text DEFAULT 'normal',
  category        text DEFAULT 'general',
  kind            text NOT NULL DEFAULT 'announcement',
  metadata        jsonb DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at      timestamptz NOT NULL DEFAULT now());

CREATE UNIQUE INDEX notifications_idempotency_key_uq
  ON public.notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;
`;

/** A drive open for willingness, with three learners in three states. */
const FIXTURE = `
TRUNCATE public.notifications, public.cdc_drive_willingness,
         public.cdc_drives, public.profiles;

INSERT INTO public.profiles (id, learner_id) VALUES
  ('${P.willing}',   '${L.willing}'),
  ('${P.confirmed}', '${L.confirmed}'),
  ('${P.withdrawn}', '${L.withdrawn}');

INSERT INTO public.cdc_drives
  (id, title, status, drive_date, drive_start_time, drive_end_time,
   venue_label, location_url, drive_mode, created_by, updated_by, updated_at)
VALUES
  ('${DRIVE}', 'Foxconn India', 'willingness_open',
   '2026-10-01', '09:00', '17:00', 'Main Auditorium', NULL, 'on_campus',
   '${COORDINATOR}', '${COORDINATOR}', '2026-09-12T10:00:00Z');

INSERT INTO public.cdc_drive_willingness (drive_id, learner_id, status) VALUES
  ('${DRIVE}', '${L.willing}',   'willing'),
  ('${DRIVE}', '${L.confirmed}', 'confirmed'),
  ('${DRIVE}', '${L.withdrawn}', 'withdrawn');
`;

let admin: Client;
let db: Client;
let adminConnected = false;
let dbConnected = false;

/** Recipients of every notification written so far, newest last. */
async function notifications() {
  const { rows } = await db.query(
    `SELECT title, body, url, category, kind, targeting, metadata, idempotency_key
     FROM public.notifications ORDER BY created_at, id`
  );
  return rows as Array<{
    title: string;
    body: string;
    url: string;
    category: string;
    kind: string;
    targeting: { user_ids: string[] };
    metadata: Record<string, unknown>;
    idempotency_key: string;
  }>;
}

/** A single UPDATE with an explicit `updated_at`, the way the touch trigger sets it. */
function bump(sets: string, at: string) {
  return `UPDATE public.cdc_drives
          SET ${sets}, updated_by = '${COORDINATOR}', updated_at = '${at}'
          WHERE id = '${DRIVE}'`;
}

beforeAll(async () => {
  admin = new Client({
    host: PGHOST,
    port: PGPORT,
    user: PGUSER,
    password: PGPASSWORD,
    database: 'postgres',
  });
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${DBNAME}`);

  db = new Client({
    host: PGHOST,
    port: PGPORT,
    user: PGUSER,
    password: PGPASSWORD,
    database: DBNAME,
  });
  await db.connect();
  dbConnected = true;

  await db.query(SCHEMA);
  // VERBATIM. If this throws, the migration does not apply and the suite is red
  // for the right reason.
  await db.query(readFileSync(MIGRATION, 'utf8'));
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

describe('a drive that moves reaches the learners waiting on it', () => {
  it('notifies those who declared, and not the one who withdrew', async () => {
    // Transition AND non-transition together. Either alone is satisfiable by a
    // broken trigger: one that notifies everybody passes the first, one that
    // notifies nobody passes the second.
    await db.query(bump(`drive_date = '2026-10-08'`, '2026-09-12T11:00:00Z'));

    const rows = await notifications();
    expect(rows).toHaveLength(1);

    const ids = rows[0].targeting.user_ids.slice().sort();
    expect(ids).toEqual([P.willing, P.confirmed].sort());
    expect(ids).not.toContain(P.withdrawn);
  });

  it('sends the learner to their own page, not the coordinator surface', async () => {
    // /cdc/drives/<id> is gated on cdc.drives.view, which learners do not hold.
    await db.query(bump(`venue_label = 'Block C Seminar Hall'`, '2026-09-12T11:00:00Z'));

    const [row] = await notifications();
    expect(row.url).toBe(`/cdc/drives/${DRIVE}/willingness`);
    expect(row.category).toBe('cdc.drive.details_changed');
  });
});

describe('the message names what actually moved', () => {
  it('says date when only the date moved', async () => {
    await db.query(bump(`drive_date = '2026-10-08'`, '2026-09-12T11:00:00Z'));
    const [row] = await notifications();
    expect(row.body).toContain('The date for');
    expect(row.metadata.when_changed).toBe(true);
    expect(row.metadata.where_changed).toBe(false);
  });

  it('says venue when only the venue moved', async () => {
    await db.query(bump(`venue_label = 'Block C'`, '2026-09-12T11:00:00Z'));
    const [row] = await notifications();
    expect(row.body).toContain('The venue for');
    expect(row.metadata.when_changed).toBe(false);
    expect(row.metadata.where_changed).toBe(true);
  });

  it('says date and venue when both moved', async () => {
    await db.query(
      bump(`drive_date = '2026-10-08', venue_label = 'Block C'`, '2026-09-12T11:00:00Z')
    );
    const [row] = await notifications();
    expect(row.body).toContain('The date and venue for');
  });

  it('counts a start-time change as the date moving', async () => {
    await db.query(bump(`drive_start_time = '14:00'`, '2026-09-12T11:00:00Z'));
    const [row] = await notifications();
    expect(row.metadata.when_changed).toBe(true);
  });

  it('counts a mode or map-link change as the venue moving', async () => {
    await db.query(bump(`drive_mode = 'off_campus'`, '2026-09-12T11:00:00Z'));
    await db.query(
      bump(`location_url = 'https://maps.example/x'`, '2026-09-12T12:00:00Z')
    );
    const rows = await notifications();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.metadata.where_changed === true)).toBe(true);
  });
});

describe('it stays quiet when it should', () => {
  it('says nothing when a field outside when/where changes', async () => {
    // drive_end_time is deliberately out of scope: it changes how long the day
    // runs, not where the learner has to be or when.
    await db.query(bump(`drive_end_time = '18:00'`, '2026-09-12T11:00:00Z'));
    expect(await notifications()).toHaveLength(0);
  });

  it('says nothing when the coordinator re-saves without changing anything', async () => {
    await db.query(bump(`venue_label = 'Main Auditorium'`, '2026-09-12T11:00:00Z'));
    expect(await notifications()).toHaveLength(0);
  });

  it('says nothing once the drive is past the point of turning up', async () => {
    for (const status of ['results_announced', 'closed', 'cancelled'] as const) {
      await db.query(FIXTURE);
      await db.query(
        `UPDATE public.cdc_drives SET status = '${status}' WHERE id = '${DRIVE}'`
      );
      await db.query(bump(`venue_label = 'Somewhere else'`, '2026-09-12T11:00:00Z'));
      expect(await notifications(), `status ${status}`).toHaveLength(0);
    }
  });

  it('says nothing when nobody has declared', async () => {
    await db.query(`DELETE FROM public.cdc_drive_willingness WHERE drive_id = '${DRIVE}'`);
    await db.query(bump(`drive_date = '2026-10-08'`, '2026-09-12T11:00:00Z'));
    expect(await notifications()).toHaveLength(0);
  });
});

describe('a drive that moves twice is announced twice', () => {
  it('does not swallow a change back to a previous value', async () => {
    // Thursday → Friday → Thursday. A key built from the new VALUES would treat
    // the third as a duplicate of the first and tell nobody.
    await db.query(bump(`drive_date = '2026-10-02'`, '2026-09-12T11:00:00Z'));
    await db.query(bump(`drive_date = '2026-10-01'`, '2026-09-12T12:00:00Z'));
    await db.query(bump(`drive_date = '2026-10-02'`, '2026-09-12T13:00:00Z'));

    const rows = await notifications();
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.idempotency_key)).size).toBe(3);
  });
});

describe('the emitter is not reachable by a signed-in user', () => {
  it('grants EXECUTE to neither anon nor authenticated', async () => {
    const { rows } = await db.query(`
      SELECT
        has_function_privilege('anon',
          'public.fn_cdc_emit_drive_details_notification(uuid,uuid,boolean,boolean)',
          'EXECUTE') AS anon_can,
        has_function_privilege('authenticated',
          'public.fn_cdc_emit_drive_details_notification(uuid,uuid,boolean,boolean)',
          'EXECUTE') AS auth_can,
        has_function_privilege('service_role',
          'public.fn_cdc_emit_drive_details_notification(uuid,uuid,boolean,boolean)',
          'EXECUTE') AS svc_can`);
    expect(rows[0].anon_can).toBe(false);
    expect(rows[0].auth_can).toBe(false);
    expect(rows[0].svc_can).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NON-VACUITY. Each control is a shape the real trigger could plausibly have
// had; each must produce an outcome the real one does not.
// ---------------------------------------------------------------------------
describe('controls — the quiet cases are quiet for a reason', () => {
  beforeEach(async () => {
    await db.query(`DROP TRIGGER IF EXISTS ctl ON public.cdc_drives`);
  });

  it('a trigger fired by ANY column change WOULD notify on an end-time tweak', async () => {
    await db.query(`
      CREATE OR REPLACE FUNCTION public.fn_ctl_anyfield() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM public.fn_cdc_emit_drive_details_notification(
          NEW.id, NEW.updated_by, true, false);
        RETURN NEW;
      END $$;
      CREATE TRIGGER ctl AFTER UPDATE ON public.cdc_drives
      FOR EACH ROW EXECUTE FUNCTION public.fn_ctl_anyfield();`);

    await db.query(bump(`drive_end_time = '18:00'`, '2026-09-12T11:00:00Z'));

    // The control speaks where the shipped trigger stayed silent above.
    expect(await notifications()).toHaveLength(1);
  });

  it('an emitter that ignored withdrawal WOULD notify the learner who pulled out', async () => {
    await db.query(`
      CREATE OR REPLACE FUNCTION public.fn_ctl_alldeclared() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE v_ids uuid[];
      BEGIN
        SELECT array_agg(DISTINCT p.id) INTO v_ids
        FROM public.cdc_drive_willingness w
        JOIN public.profiles p ON p.learner_id = w.learner_id
        WHERE w.drive_id = NEW.id;            -- the missing withdrawn filter
        INSERT INTO public.notifications
          (title, body, created_by, targeting, kind)
        VALUES ('ctl', 'ctl', NEW.created_by,
                jsonb_build_object('user_ids', to_jsonb(v_ids)), 'work_item');
        RETURN NEW;
      END $$;
      CREATE TRIGGER ctl AFTER UPDATE ON public.cdc_drives
      FOR EACH ROW EXECUTE FUNCTION public.fn_ctl_alldeclared();`);

    await db.query(bump(`drive_date = '2026-10-08'`, '2026-09-12T11:00:00Z'));

    const rows = await notifications();
    const ctl = rows.find((r) => r.title === 'ctl')!;
    const real = rows.find((r) => r.title !== 'ctl')!;
    expect(ctl.targeting.user_ids).toContain(P.withdrawn);
    expect(real.targeting.user_ids).not.toContain(P.withdrawn);
  });
});
