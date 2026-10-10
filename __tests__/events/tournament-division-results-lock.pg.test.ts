/**
 * Behavioural proof for
 * supabase/migrations/20271009163000_tournament_division_results_lock.sql
 *
 * BALAM-2K26 (8 Oct 2026): a women's Chess knockout division with 7 recorded
 * results had its sport changed to "Athletics - 400 m". The migration is
 * applied VERBATIM to a throwaway PostgreSQL, onto the minimal slice of the
 * tournament tables it reads, and each test performs the UPDATE the Edit
 * dialog performs and reads back what PostgreSQL actually allowed.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in
 * .github/workflows/test-suite.yml, which sets DIVLOCK_TEST_PGUSER). Override
 * with DIVLOCK_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD. Loud rather than
 * skipped when no server is reachable, like every other *.pg.test.ts here
 * (e.g. event-waitlist-seat-holding.pg.test.ts): a silent skip reports green
 * over a suite that never ran.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
// DIVLOCK_TEST_MIGRATION points the suite at another copy of the SQL (used to
// show the round-4 tests fail on the previous version of this migration).
const MIGRATION =
  process.env.DIVLOCK_TEST_MIGRATION ??
  path.join(REPO, 'supabase/migrations/20271009163000_tournament_division_results_lock.sql');

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
DO $$ BEGIN
  IF to_regclass('public.tournament_division_result_marks') IS NOT NULL THEN
    TRUNCATE public.tournament_division_result_marks;
  END IF;
END $$;
TRUNCATE public.tournament_division_lock_overrides, public.tournament_heat_entries,
         public.tournament_matches, public.tournament_divisions CASCADE;
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

const marks = async () =>
  (
    await db.query(
      `SELECT division_id FROM public.tournament_division_result_marks ORDER BY division_id`
    )
  ).rows.map((r) => r.division_id);

describe('results that once existed keep the lock (deep review round 4, #1)', () => {
  const changeSport = (id: string) =>
    attempt(db, `UPDATE public.tournament_divisions SET sport = 'Carrom' WHERE id = '${id}'`);

  it('refuses an organiser after the result is rolled back to pending', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'completed')`
    );
    // Correcting a result stays allowed.
    expect(
      await attempt(
        db,
        `UPDATE public.tournament_matches SET status = 'pending' WHERE division_id = '${CHESS}'`
      )
    ).toBeNull();
    expect(await changeSport(CHESS)).toMatch(LOCKED);
    expect(await overrides()).toEqual([]);
  });

  it('refuses an organiser after the recorded matches are deleted (the BALAM pattern)', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'pending')`
    );
    // The match becomes recorded through an UPDATE, as fn_record_result does.
    await db.query(
      `UPDATE public.tournament_matches SET status = 'walkover' WHERE division_id = '${CHESS}'`
    );
    expect(
      await attempt(db, `DELETE FROM public.tournament_matches WHERE division_id = '${CHESS}'`)
    ).toBeNull();
    expect(await changeSport(CHESS)).toMatch(LOCKED);
  });

  it('refuses a format change after a heat result is cleared', async () => {
    await db.query(
      `INSERT INTO public.tournament_heat_entries (division_id) VALUES ('${RUN400}')`
    );
    await db.query(
      `UPDATE public.tournament_heat_entries SET position = 1 WHERE division_id = '${RUN400}'`
    );
    await db.query(
      `UPDATE public.tournament_heat_entries SET position = NULL WHERE division_id = '${RUN400}'`
    );
    expect(
      await attempt(
        db,
        `UPDATE public.tournament_divisions SET format = 'knockout' WHERE id = '${RUN400}'`
      )
    ).toMatch(LOCKED);
  });

  it('still lets a super admin override after the results are deleted, and logs it', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'completed')`
    );
    await db.query(`DELETE FROM public.tournament_matches WHERE division_id = '${CHESS}'`);
    await actAs(ADMIN_UID, true);
    expect(await changeSport(CHESS)).toBeNull();
    const rows = await overrides();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      division_id: CHESS,
      changed_by: ADMIN_UID,
      old_sport: 'Chess',
      new_sport: 'Carrom',
    });
  });

  it('marks a division once, on the first recorded result only', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES
         ('${CHESS}', 'scheduled'), ('${CHESS}', 'completed'), ('${CHESS}', 'disqualified')`
    );
    expect(await marks()).toEqual([CHESS]);
  });

  it('a write that does not ENTER a recorded state takes no division lock', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'completed')`
    );
    const editor = connect(DBNAME);
    const recorder = connect(DBNAME);
    await editor.connect();
    await recorder.connect();
    try {
      // An open division edit holds the row lock that FOR SHARE would wait on.
      await editor.query('BEGIN');
      await editor.query(
        `UPDATE public.tournament_divisions SET level = 'district' WHERE id = '${CHESS}'`
      );
      await recorder.query(`SET lock_timeout = '1s'`);
      // Score correction on an already-completed match: must not wait.
      expect(
        await attempt(
          recorder,
          `UPDATE public.tournament_matches SET status = 'completed' WHERE division_id = '${CHESS}'`
        )
      ).toBeNull();
      // Rollback to pending: must not wait either.
      expect(
        await attempt(
          recorder,
          `UPDATE public.tournament_matches SET status = 'pending' WHERE division_id = '${CHESS}'`
        )
      ).toBeNull();
      await editor.query('ROLLBACK');
    } finally {
      await editor.end();
      await recorder.end();
    }
  });
});

describe('override records outlive the division (deep review round 4, #3)', () => {
  it('keeps the override row, with event and old/new values, after the division is deleted', async () => {
    await db.query(
      `INSERT INTO public.tournament_matches (division_id, status) VALUES ('${CHESS}', 'completed')`
    );
    await actAs(ADMIN_UID, true);
    expect(
      await attempt(
        db,
        `UPDATE public.tournament_divisions SET sport = 'Athletics - 400 m' WHERE id = '${CHESS}'`
      )
    ).toBeNull();
    expect(
      await attempt(db, `DELETE FROM public.tournament_divisions WHERE id = '${CHESS}'`)
    ).toBeNull();
    expect(await overrides()).toEqual([
      {
        division_id: null,
        event_id: EVENT,
        changed_by: ADMIN_UID,
        old_sport: 'Chess',
        new_sport: 'Athletics - 400 m',
        old_gender: 'female',
        new_gender: 'female',
        old_format: 'knockout',
        new_format: 'knockout',
        stamped: true,
      },
    ]);
  });
});

describe('backfill of marks for divisions that already have results', () => {
  it('marks exactly the divisions with a recorded match or heat result when the migration runs', async () => {
    const name = `${DBNAME}_bf`;
    await admin.query(`CREATE DATABASE ${name}`);
    const bf = connect(name);
    await bf.connect();
    const QUIET = '00000000-0000-4000-8000-0000000000a3';
    const CLEAN = '00000000-0000-4000-8000-0000000000a4';
    try {
      await bf.query(SCHEMA);
      await bf.query(`
        INSERT INTO public.tournament_divisions (id, event_id, sport, format) VALUES
          ('${CHESS}',  '${EVENT}', 'Chess',             'knockout'),
          ('${RUN400}', '${EVENT}', 'Athletics - 400 m', 'heats'),
          ('${QUIET}',  '${EVENT}', 'Carrom',            'knockout'),
          ('${CLEAN}',  '${EVENT}', 'Kabaddi',           'knockout');
        INSERT INTO public.tournament_matches (division_id, status) VALUES
          ('${CHESS}', 'completed'), ('${CHESS}', 'pending'),
          ('${QUIET}', 'scheduled'), ('${QUIET}', 'bye');
        INSERT INTO public.tournament_heat_entries (division_id, result_status) VALUES
          ('${RUN400}', 'dnf'), ('${CLEAN}', 'ok');`);
      await bf.query(readFileSync(MIGRATION, 'utf8'));
      const { rows } = await bf.query(
        `SELECT division_id FROM public.tournament_division_result_marks ORDER BY division_id`
      );
      expect(rows.map((r) => r.division_id)).toEqual([CHESS, RUN400]);
    } finally {
      await bf.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    }
  });
});
