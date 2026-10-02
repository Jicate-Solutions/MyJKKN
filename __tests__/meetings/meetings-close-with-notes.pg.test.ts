/**
 * The daily meetings sweep closes a past meeting ONLY when its notes are linked
 * — behavioural proof for
 * supabase/migrations/20271003091700_meetings_close_with_notes.sql
 * (requested by the Front desk, confirmed by the Director 2 Oct 2026:
 * "Close those with notes" over "Keep the 21 Aug rule").
 *
 * The three migrations that shape meeting_bookings.outcome_* are applied
 * VERBATIM with psql, in order, onto a throwaway database:
 *   20260831010000  adds outcome_marked_at/_by, the two-value CHECK, the old sweep
 *   20260926010000  adds outcome_marked_by_profile_id, widens the CHECK to
 *                   host|admin|system, adds the person CHECK
 *   20271003091700  this PR — adds 'notes' and fn_meetings_close_with_notes
 * so the DROP/ADD of the CHECK is proven against the real constraint it
 * replaces, not a hand-written stand-in. The sweep is then called the way the
 * cron calls it: as the service role.
 *
 * NON-VACUITY: with this PR's migration file emptied, every test fails (the
 * function does not exist / 'notes' is rejected). Each predicate of the UPDATE
 * has a fixture row that only that predicate keeps out.
 *
 * REQUIRES a local PostgreSQL 16 and refuses to skip silently without one
 * (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml):
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/meetings/meetings-close-with-notes.pg.test.ts
 * Override the server with CWN_TEST_PGHOST / _PGPORT / _PGUSER.
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATIONS = [
  'supabase/migrations/20260831010000_meetings_did_this_happen.sql',
  'supabase/migrations/20260926010000_meetings_record_real_closer.sql',
  'supabase/migrations/20271003091700_meetings_close_with_notes.sql',
].map((m) => path.join(REPO, m));

const PGHOST = process.env.CWN_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.CWN_TEST_PGPORT ?? '5432';
const PGUSER =
  process.env.CWN_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `close_with_notes_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const HOST = '00000000-0000-4000-8000-0000000000a1';

// Roles are cluster-wide, so every CREATE ROLE is guarded.
const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Supabase's default: anon gets EXECUTE on every new function in public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY);
INSERT INTO public.profiles VALUES ('${HOST}');

-- The columns the three migrations and the sweep touch, with production's
-- status CHECK and range CHECK.
CREATE TABLE public.meeting_bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid             text UNIQUE NOT NULL,
  host_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  status          text NOT NULL DEFAULT 'confirmed'
                  CONSTRAINT meeting_bookings_status_check
                  CHECK (status = ANY (ARRAY['confirmed','cancelled','completed','no_show'])),
  start_time      timestamptz NOT NULL,
  end_time        timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mb_range_valid CHECK (end_time > start_time)
);

CREATE TABLE public.meeting_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.meeting_bookings(id)
);

-- 20260831010000 seeds its schedule row here.
CREATE TABLE public.ai_routine_schedules (
  routine_id    text PRIMARY KEY,
  enabled       boolean NOT NULL DEFAULT true,
  days_of_week  smallint[] NOT NULL,
  minute_of_day smallint NOT NULL,
  managed       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

/** A booking whose meeting ended `endedDaysAgo` days ago (negative = in the future). */
async function booking(
  uid: string,
  o: {
    endedDaysAgo: number;
    status?: string;
    markedBy?: string | null;
    markedByProfile?: string | null;
    notes?: number;
  },
) {
  const r = await client.query(
    `INSERT INTO public.meeting_bookings
       (uid, host_profile_id, status, start_time, end_time, outcome_marked_by, outcome_marked_by_profile_id,
        outcome_marked_at)
     VALUES ($1, $2, $3,
             now() - make_interval(days => $4) - interval '30 minutes',
             now() - make_interval(days => $4),
             $5, $6, CASE WHEN $5::text IS NULL THEN NULL ELSE now() - interval '1 day' END)
     RETURNING id`,
    [uid, HOST, o.status ?? 'confirmed', o.endedDaysAgo, o.markedBy ?? null, o.markedByProfile ?? null],
  );
  const id = r.rows[0].id as string;
  for (let i = 0; i < (o.notes ?? 0); i++) {
    await client.query(`INSERT INTO public.meeting_notes (booking_id) VALUES ($1)`, [id]);
  }
  return id;
}

async function row(uid: string) {
  const r = await client.query(
    `SELECT status, outcome_marked_by, outcome_marked_by_profile_id, outcome_marked_at
       FROM public.meeting_bookings WHERE uid = $1`,
    [uid],
  );
  return r.rows[0] as {
    status: string;
    outcome_marked_by: string | null;
    outcome_marked_by_profile_id: string | null;
    outcome_marked_at: Date | null;
  };
}

/** Call the sweep as a given role; returns rows closed or the error message. */
async function sweepAs(role: string, days: number | null = 7) {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    const r = await client.query(`SELECT public.fn_meetings_close_with_notes($1::integer) AS n`, [days]);
    await client.query('COMMIT');
    return { n: r.rows[0].n as number, error: null as string | null };
  } catch (e) {
    await client.query('ROLLBACK');
    return { n: null as number | null, error: (e as Error).message };
  }
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e) {
    throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`);
  }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  for (const m of MIGRATIONS) psql(['-d', DBNAME, '-f', m]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();

  // One row per predicate. Only 'due' may close.
  await booking('due', { endedDaysAgo: 8, notes: 1 });
  await booking('due-two-notes', { endedDaysAgo: 30, notes: 2 });
  await booking('no-notes', { endedDaysAgo: 8 });
  await booking('cancelled', { endedDaysAgo: 8, status: 'cancelled', notes: 1 });
  await booking('no-show', {
    endedDaysAgo: 8, status: 'no_show', markedBy: 'host', markedByProfile: HOST, notes: 1,
  });
  // Closed before outcome markers existed (production's 2026-08-18 backfill
  // left 'completed' rows with outcome_marked_by NULL). Only the
  // status = 'confirmed' predicate keeps this one out.
  await booking('legacy-completed', { endedDaysAgo: 40, status: 'completed', notes: 1 });
  await booking('host-marked', {
    endedDaysAgo: 8, status: 'completed', markedBy: 'host', markedByProfile: HOST, notes: 1,
  });
  // Still 'confirmed' but already carrying a host stamp — only the
  // outcome_marked_by IS NULL predicate keeps this one out.
  await booking('confirmed-but-stamped', {
    endedDaysAgo: 8, markedBy: 'host', markedByProfile: HOST, notes: 1,
  });
  await booking('recent', { endedDaysAgo: 3, notes: 1 });
  await booking('upcoming', { endedDaysAgo: -2, notes: 1 });
});

afterAll(async () => {
  await client?.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]);
  } catch {
    /* best effort */
  }
});

describe('fn_meetings_close_with_notes — who may run it', () => {
  it('anon cannot execute it', async () => {
    const r = await sweepAs('anon');
    expect(r.error).toMatch(/permission denied/i);
  });

  it('a signed-in person (authenticated) cannot execute it', async () => {
    const r = await sweepAs('authenticated');
    expect(r.error).toMatch(/permission denied/i);
  });

  it('refuses a window below one day rather than reaching meetings that have not ended', async () => {
    expect((await sweepAs('service_role', 0)).error).toMatch(/1 or more/);
    expect((await sweepAs('service_role', null)).error).toMatch(/1 or more/);
    expect((await row('recent')).status).toBe('confirmed');
    expect((await row('upcoming')).status).toBe('confirmed');
  });
});

describe('fn_meetings_close_with_notes — what it closes', () => {
  // Order matters: these run as one story against the same fixture.
  it('the first run closes exactly the confirmed, unmarked, ended-over-7-days, notes-linked meetings', async () => {
    const r = await sweepAs('service_role');
    expect(r.error).toBeNull();
    expect(r.n).toBe(2);
  });

  it("stamps a closed meeting 'completed' by 'notes', with no person and a time", async () => {
    for (const uid of ['due', 'due-two-notes']) {
      const b = await row(uid);
      expect(b.status).toBe('completed');
      expect(b.outcome_marked_by).toBe('notes');
      expect(b.outcome_marked_by_profile_id).toBeNull();
      expect(b.outcome_marked_at).not.toBeNull();
    }
  });

  it('leaves a past meeting with NO notes waiting for a person (the 21 Aug rule stands)', async () => {
    const b = await row('no-notes');
    expect(b.status).toBe('confirmed');
    expect(b.outcome_marked_by).toBeNull();
  });

  it('leaves cancelled and no-show meetings alone, even with notes', async () => {
    expect((await row('cancelled')).status).toBe('cancelled');
    expect((await row('cancelled')).outcome_marked_by).toBeNull();
    expect((await row('no-show')).status).toBe('no_show');
    expect((await row('no-show')).outcome_marked_by).toBe('host');
  });

  it('does not re-stamp a meeting that was already completed before markers existed', async () => {
    const b = await row('legacy-completed');
    expect(b.status).toBe('completed');
    expect(b.outcome_marked_by).toBeNull();
    expect(b.outcome_marked_at).toBeNull();
  });

  it("never overwrites a person's stamp", async () => {
    const h = await row('host-marked');
    expect(h.status).toBe('completed');
    expect(h.outcome_marked_by).toBe('host');
    expect(h.outcome_marked_by_profile_id).toBe(HOST);

    const s = await row('confirmed-but-stamped');
    expect(s.status).toBe('confirmed');
    expect(s.outcome_marked_by).toBe('host');
  });

  it('leaves a meeting that ended only 3 days ago, and one that has not happened yet', async () => {
    expect((await row('recent')).status).toBe('confirmed');
    expect((await row('upcoming')).status).toBe('confirmed');
  });

  it('a second run closes nothing and changes nothing', async () => {
    const before = await client.query(
      `SELECT uid, status, outcome_marked_by, outcome_marked_at FROM public.meeting_bookings ORDER BY uid`,
    );
    const r = await sweepAs('service_role');
    expect(r.error).toBeNull();
    expect(r.n).toBe(0);
    const after = await client.query(
      `SELECT uid, status, outcome_marked_by, outcome_marked_at FROM public.meeting_bookings ORDER BY uid`,
    );
    expect(after.rows).toEqual(before.rows);
  });
});

describe('mb_outcome_marked_by_chk after this migration', () => {
  async function tryStamp(uid: string, by: string | null, profile: string | null) {
    try {
      await client.query(
        `UPDATE public.meeting_bookings SET outcome_marked_by = $2, outcome_marked_by_profile_id = $3 WHERE uid = $1`,
        [uid, by, profile],
      );
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  it("accepts 'notes' with no person", async () => {
    await booking('check-notes', { endedDaysAgo: 1 });
    expect(await tryStamp('check-notes', 'notes', null)).toBeNull();
  });

  it('still rejects an unknown kind', async () => {
    await booking('check-unknown', { endedDaysAgo: 1 });
    expect(await tryStamp('check-unknown', 'robot', null)).toMatch(/mb_outcome_marked_by_chk/);
  });

  it('keeps every earlier kind, and still makes host/admin name the person', async () => {
    await booking('check-kinds', { endedDaysAgo: 1 });
    expect(await tryStamp('check-kinds', 'system', null)).toBeNull();
    expect(await tryStamp('check-kinds', 'host', HOST)).toBeNull();
    expect(await tryStamp('check-kinds', 'admin', HOST)).toBeNull();
    expect(await tryStamp('check-kinds', 'host', null)).toMatch(/mb_outcome_marked_by_person_chk/);
  });
});
