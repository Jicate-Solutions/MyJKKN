/**
 * Behavioural proof for
 * supabase/migrations/20271009120000_tournament_division_results_lock.sql
 *
 * BALAM-2K26 (8 Oct 2026): a women's Chess knockout division with 7 recorded
 * results had its sport changed to "Athletics - 400 m". The migration is
 * applied VERBATIM to a throwaway PostgreSQL, onto the minimal slice of the
 * tournament tables it reads, and each test performs the UPDATE the Edit
 * dialog performs and reads back what PostgreSQL actually allowed.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in
 * .github/workflows/test-suite.yml). Override with DIVLOCK_TEST_PGHOST /
 * _PGPORT / _PGUSER / _PGPASSWORD. Loud rather than skipped when no server is
 * reachable: a silent skip reports green over a suite that never ran.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20271009120000_tournament_division_results_lock.sql'
);

const PGHOST = process.env.DIVLOCK_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.DIVLOCK_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.DIVLOCK_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const PGPASSWORD = process.env.DIVLOCK_TEST_PGPASSWORD;
const DBNAME = `div_results_lock_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const CHESS = '00000000-0000-4000-8000-0000000000a1';
const RUN400 = '00000000-0000-4000-8000-0000000000a2';
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const ADMIN_UID = '00000000-0000-4000-8000-0000000000f1';
const ORGANISER_UID = '00000000-0000-4000-8000-0000000000f2';

/** Only the columns the migration reads or the tests write. */
const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;

-- The production helpers, driven by per-session settings (who is calling).
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.super', true), '')::boolean, false) $$;

CREATE TABLE public.tournament_divisions (
  id        uuid PRIMARY KEY,
  event_id  uuid NOT NULL,
  sport     text NOT NULL,
  gender    text,
  format    text NOT NULL DEFAULT 'knockout',
  level     text,
  max_teams integer);

CREATE TABLE public.tournament_matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id uuid NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending');

CREATE TABLE public.tournament_heat_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id   uuid NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  position      integer,
  mark_value    numeric,
  result_status text NOT NULL DEFAULT 'ok');
`;

const FIXTURE = `
TRUNCATE public.tournament_division_lock_overrides, public.tournament_heat_entries,
         public.tournament_matches, public.tournament_divisions;
INSERT INTO public.tournament_divisions (id, event_id, sport, gender, format, level) VALUES
  ('${CHESS}',  '${EVENT}', 'Chess',             'female', 'knockout', 'intra_college'),
  ('${RUN400}', '${EVENT}', 'Athletics - 400 m', 'female', 'heats',    'intra_college');
`;

const LOCKED = /already has recorded results/;

let admin: Client;
let db: Client;

const connect = (database: string) =>
  new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database });

/** Run one statement; returns the error message, or null when it succeeded. */
async function attempt(client: Client, sql: string): Promise<string | null> {
  try {
    await client.query(sql);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

beforeAll(async () => {
  admin = connect('postgres');
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(
      `Local PostgreSQL 16 is required at ${PGHOST}:${PGPORT} (${String(e).slice(0, 200)})`
    );
  }
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  db = connect(DBNAME);
  await db.connect();
  await db.query(SCHEMA);
  await db.query(readFileSync(MIGRATION, 'utf8'));
});

afterAll(async () => {
  await db?.end();
  if (admin) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${DBNAME}`);
    } catch {
      /* best effort */
    }
    await admin.end();
  }
});

/** Act as this caller for the rest of the session on `db`. */
const actAs = (uid: string, superAdmin: boolean) =>
  db.query(`SELECT set_config('test.uid', $1, false), set_config('test.super', $2, false)`, [
    uid,
    String(superAdmin),
  ]);

const overrides = async () =>
  (
    await db.query(
      `SELECT division_id, event_id, changed_by, old_sport, new_sport, old_gender, new_gender,
              old_format, new_format, changed_at IS NOT NULL AS stamped
         FROM public.tournament_division_lock_overrides`
    )
  ).rows;

beforeEach(async () => {
  await db.query(FIXTURE);
  // Default caller: an organiser who is not a super admin.
  await actAs(ORGANISER_UID, false);
});

describe('trg_tournament_division_results_lock', () => {
  it('refuses a sport change on a division with a completed match', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'completed')`
    );
    const err = await attempt(
      db,
      `UPDATE public.tournament_divisions SET sport = 'Athletics - 400 m' WHERE id = '${CHESS}'`
    );
    expect(err).toMatch(LOCKED);
    const { rows } = await db.query(
      `SELECT sport FROM public.tournament_divisions WHERE id = '${CHESS}'`
    );
    expect(rows[0].sport).toBe('Chess');
  });

  it('allows the same sport change while no result is recorded (control)', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'scheduled')`
    );
    expect(
      await attempt(
        db,
        `UPDATE public.tournament_divisions SET sport = 'Carrom' WHERE id = '${CHESS}'`
      )
    ).toBeNull();
  });

  it('allows a level or max_teams edit on a division with results', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'walkover')`
    );
    expect(
      await attempt(
        db,
        `UPDATE public.tournament_divisions SET level = 'inter_college', max_teams = 16,
                sport = sport WHERE id = '${CHESS}'`
      )
    ).toBeNull();
    const { rows } = await db.query(
      `SELECT level, max_teams FROM public.tournament_divisions WHERE id = '${CHESS}'`
    );
    expect(rows[0]).toEqual({ level: 'inter_college', max_teams: 16 });
  });

  it('refuses a format change on a heats division with a recorded heat entry', async () => {
    await db.query(
      `INSERT INTO public.tournament_heat_entries (division_id, mark_value) VALUES ('${RUN400}', 58.2)`
    );
    expect(
      await attempt(
        db,
        `UPDATE public.tournament_divisions SET format = 'knockout' WHERE id = '${RUN400}'`
      )
    ).toMatch(LOCKED);
  });

  it('serialises a sport change behind a result that is still being recorded', async () => {
    const recorder = connect(DBNAME);
    const editor = connect(DBNAME);
    await recorder.connect();
    await editor.connect();
    try {
      await recorder.query('BEGIN');
      await recorder.query(
        `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'completed')`
      );
      // The editor's UPDATE must wait for the recorder's share lock. Without it
      // the edit succeeds at once, because the uncommitted result is invisible.
      let settled = false;
      const edit = attempt(
        editor,
        `UPDATE public.tournament_divisions SET sport = 'Athletics - 400 m' WHERE id = '${CHESS}'`
      ).then((r) => {
        settled = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 300));
      expect(settled).toBe(false);
      await recorder.query('COMMIT');
      expect(await edit).toMatch(LOCKED);
    } finally {
      await recorder.end();
      await editor.end();
    }
  });

});

describe('super admin override (Director ruling, 9 Oct 2026)', () => {
  it('lets a super admin change the sport and records exactly one override row', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'completed')`
    );
    await actAs(ADMIN_UID, true);
    expect(
      await attempt(
        db,
        `UPDATE public.tournament_divisions SET sport = 'Carrom' WHERE id = '${CHESS}'`
      )
    ).toBeNull();
    expect(await overrides()).toEqual([
      {
        division_id: CHESS,
        event_id: EVENT,
        changed_by: ADMIN_UID,
        old_sport: 'Chess',
        new_sport: 'Carrom',
        old_gender: 'female',
        new_gender: 'female',
        old_format: 'knockout',
        new_format: 'knockout',
        stamped: true,
      },
    ]);
  });

  it('refuses an organiser and writes no override row', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'completed')`
    );
    await actAs(ORGANISER_UID, false);
    expect(
      await attempt(
        db,
        `UPDATE public.tournament_divisions SET sport = 'Carrom' WHERE id = '${CHESS}'`
      )
    ).toMatch(LOCKED);
    expect(await overrides()).toEqual([]);
  });

  it('writes no override row for a super admin edit on a division without results', async () => {
    await actAs(ADMIN_UID, true);
    expect(
      await attempt(
        db,
        `UPDATE public.tournament_divisions SET sport = 'Carrom' WHERE id = '${CHESS}'`
      )
    ).toBeNull();
    expect(await overrides()).toEqual([]);
  });
});
