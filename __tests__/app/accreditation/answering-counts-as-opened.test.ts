/**
 * Answering your own assignment counts as having opened it.
 * Behavioural proof for
 *   supabase/migrations/20261128100000_accreditation_answering_counts_as_opened.sql
 *
 * THE FIXTURE THIS EXISTS FOR
 * ---------------------------
 * A row the named owner ANSWERED — assignment_status = 'confirmed',
 * acknowledged_by = owner_user_id — whose first_seen_at is still NULL because
 * the page code that answered never called fn_accreditation_mark_owner_seen.
 * That is the shape of 58 production rows on 2026-09-10. Before this migration
 * the row reads "answered, not opened"; after it the sighting is stamped with
 * the real acknowledged_at.
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The upstream migrations and this PR's file are applied VERBATIM with psql,
 * in filename order, on a throwaway database:
 *   20260809100600_accreditation_acknowledge_own_ownership.sql   (the function)
 *   20261121113000_owner_first_seen_at.sql                       (the column + mark-seen + reset trigger)
 *   20261125153000_accreditation_ownership_trail_trigger.sql     (the trail — must stay silent)
 *   20261128100000_accreditation_answering_counts_as_opened.sql  (this PR)
 * The live calls run as the `authenticated` role with auth.uid() stubbed to the
 * acting user, so the SECURITY DEFINER guard is exercised for real.
 *
 * A NON-VACUITY CONTROL builds the same estate with the one functional line of
 * the function mutated into a no-op (COALESCE(o.first_seen_at, now()) →
 * o.first_seen_at) and its in-file self-check neutered. The suite must notice.
 *
 * REQUIRES a local PostgreSQL and refuses to skip silently without one
 * (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml):
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/app/accreditation/answering-counts-as-opened.test.ts
 *
 * Override the server with ACK_SEEN_TEST_PGHOST / _PGPORT / _PGUSER.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MIG = (f: string) => path.join(REPO, 'supabase/migrations', f);
const M_ACK = MIG('20260809100600_accreditation_acknowledge_own_ownership.sql');
const M_SEEN = MIG('20261121113000_owner_first_seen_at.sql');
const M_TRAIL = MIG('20261125153000_accreditation_ownership_trail_trigger.sql');
const M_THIS = MIG('20261128100000_accreditation_answering_counts_as_opened.sql');

const PGHOST = process.env.ACK_SEEN_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.ACK_SEEN_TEST_PGPORT ?? '5432';
const PGUSER = process.env.ACK_SEEN_TEST_PGUSER ?? process.env.USER ?? 'postgres';

const OWNER_A = '11111111-1111-1111-1111-111111111111';
const OWNER_B = '22222222-2222-2222-2222-222222222222';
const OTHER_C = '33333333-3333-3333-3333-333333333333';
const INST = '99999999-9999-9999-9999-999999999999';

/** When the owners answered, in the seed. A real timestamp, not now(). */
const ANSWERED_AT = '2026-09-01T10:00:00+05:30';
/** A sighting older than the answer, for the rows that were already stamped. */
const SEEN_EARLIER = '2026-01-01T05:30:00+05:30';

/**
 * Production table shapes reduced to the columns these migrations touch:
 * accreditation_metric_owners as left by 20260725071500 + 20260809100000
 * (assignment_status, the paired CHECK, the NULLS NOT DISTINCT key), and the
 * accreditation_ownership_events table from 20261122103000 verbatim, because
 * the trail trigger writes to it. auth.uid() answers from a GUC so a test can
 * act as any user; anon/authenticated exist so the grants are real.
 */
const FIXTURE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $roles$;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(current_setting('test.acting_uid', true), '')::uuid;
$fn$;

CREATE TABLE public.institutions (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE public.profiles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email     text,
  full_name text
);

CREATE TABLE public.accreditation_metric_owners (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id         uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  body_code              text NOT NULL,
  metric_code            text NULL,
  programme_id           uuid NULL,
  owner_user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  assignment_status      text NOT NULL DEFAULT 'pending',
  acknowledged_at        timestamptz NULL,
  acknowledged_by        uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_owner_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_changed_at       timestamptz NULL,
  CONSTRAINT accreditation_metric_owners_scope_key
    UNIQUE NULLS NOT DISTINCT (institution_id, body_code, metric_code, programme_id),
  CONSTRAINT accreditation_metric_owners_assignment_status_check
    CHECK (assignment_status IN ('pending', 'confirmed', 'declined')),
  CONSTRAINT accreditation_metric_owners_ack_pairing_check
    CHECK ((assignment_status = 'pending') = (acknowledged_at IS NULL))
);

CREATE TABLE public.accreditation_ownership_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_row_id        uuid NULL REFERENCES public.accreditation_metric_owners(id) ON DELETE SET NULL,
  institution_id      uuid NOT NULL,
  body_code           text NOT NULL,
  metric_code         text NULL,
  action              text NOT NULL,
  from_user_id        uuid NULL,
  to_user_id          uuid NULL,
  actor_user_id       uuid NOT NULL,
  actor_is_body_owner boolean NOT NULL DEFAULT false,
  note                text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accreditation_ownership_events_action_check
    CHECK (action IN ('assigned', 'reassigned', 'cleared', 'declined', 'seen'))
);

INSERT INTO public.institutions (id, name) VALUES ('${INST}', 'JKKN College of Arts and Science');
INSERT INTO public.profiles (id, email) VALUES
  ('${OWNER_A}', 'owner.a@jkkn.ac.in'),
  ('${OWNER_B}', 'owner.b@jkkn.ac.in'),
  ('${OTHER_C}', 'someone.else@jkkn.ac.in');
`;

/**
 * The estate the moment before this PR's file is applied. Every row is a
 * distinct metric so the scope key is satisfied; metric_code doubles as the
 * fixture name the assertions read back by.
 *
 * Backfill fixtures (owner A unless noted):
 *   f1  THE ONE THIS PR IS FOR — confirmed, answered by the owner, never opened
 *   f2  same, and owner_changed_at equals acknowledged_at exactly (<= counts)
 *   f3  confirmed but acknowledged_by is somebody else          → must stay NULL
 *   f4  pending, never answered                                  → must stay NULL
 *   f5  answered, then the row moved to A AFTER the answer        → must stay NULL
 *   f6  answered AND already stamped earlier                     → keeps the earlier stamp
 *   f7  (owner B) declined by the owner, never opened            → stamped: a refusal is a sighting
 * Live-call fixtures, all pending (owner A unless noted):
 *   p1  never opened   → confirm stamps now()
 *   p2  opened earlier → confirm keeps the earlier stamp
 *   p3  never opened   → decline stamps too, and writes its one 'declined' event
 *   o1  (owner B)      → A may not answer it
 */
const SEED = `
INSERT INTO public.accreditation_metric_owners
  (institution_id, body_code, metric_code, owner_user_id, assignment_status, acknowledged_at, acknowledged_by, owner_changed_at)
VALUES
  ('${INST}', 'NAAC', 'f1', '${OWNER_A}', 'confirmed', '${ANSWERED_AT}', '${OWNER_A}', NULL),
  ('${INST}', 'NAAC', 'f2', '${OWNER_A}', 'confirmed', '${ANSWERED_AT}', '${OWNER_A}', '${ANSWERED_AT}'),
  ('${INST}', 'NAAC', 'f3', '${OWNER_A}', 'confirmed', '${ANSWERED_AT}', '${OTHER_C}', NULL),
  ('${INST}', 'NAAC', 'f4', '${OWNER_A}', 'pending',   NULL,             NULL,         NULL),
  ('${INST}', 'NAAC', 'f5', '${OWNER_A}', 'confirmed', '${ANSWERED_AT}', '${OWNER_A}', '2026-09-02T10:00:00+05:30'),
  ('${INST}', 'NAAC', 'f6', '${OWNER_A}', 'confirmed', '${ANSWERED_AT}', '${OWNER_A}', NULL),
  ('${INST}', 'NAAC', 'f7', '${OWNER_B}', 'declined',  '${ANSWERED_AT}', '${OWNER_B}', NULL),
  ('${INST}', 'NAAC', 'p1', '${OWNER_A}', 'pending',   NULL,             NULL,         NULL),
  ('${INST}', 'NAAC', 'p2', '${OWNER_A}', 'pending',   NULL,             NULL,         NULL),
  ('${INST}', 'NAAC', 'p3', '${OWNER_A}', 'pending',   NULL,             NULL,         NULL),
  ('${INST}', 'NAAC', 'o1', '${OWNER_B}', 'pending',   NULL,             NULL,         NULL);

-- The reset trigger forces first_seen_at to NULL on INSERT, so the rows that
-- were "opened earlier" are stamped afterwards, the way mark-seen would have.
UPDATE public.accreditation_metric_owners
   SET first_seen_at = '${SEEN_EARLIER}'
 WHERE metric_code IN ('f6', 'p2');
`;

function psql(db: string, args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

interface OwnerRow {
  id: string;
  metric_code: string;
  owner_user_id: string;
  assignment_status: string;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  first_seen_at: Date | null;
}

async function readRows(client: Client): Promise<Map<string, OwnerRow>> {
  const { rows } = await client.query<OwnerRow>(
    `SELECT id, metric_code, owner_user_id, assignment_status,
            acknowledged_at, acknowledged_by, first_seen_at
       FROM public.accreditation_metric_owners`,
  );
  return new Map(rows.map((r) => [r.metric_code, r]));
}

async function countEvents(client: Client): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM public.accreditation_ownership_events`,
  );
  return Number(rows[0].n);
}

/** Runs `fn` as the `authenticated` role with auth.uid() = `uid` (or as anon). */
async function actingAs<T>(
  client: Client,
  who: { role: 'authenticated' | 'anon'; uid: string | null },
  fn: () => Promise<T>,
): Promise<T> {
  await client.query(`SELECT set_config('test.acting_uid', $1, false)`, [who.uid ?? '']);
  await client.query(`SET ROLE ${who.role}`);
  try {
    return await fn();
  } finally {
    await client.query('RESET ROLE');
    await client.query(`SELECT set_config('test.acting_uid', '', false)`);
  }
}

async function answer(client: Client, rowId: string, decision: 'confirmed' | 'declined') {
  const { rows } = await client.query(
    `SELECT * FROM public.fn_accreditation_acknowledge_ownership($1, $2)`,
    [rowId, decision],
  );
  return rows[0];
}

/** Builds the estate up to (not including) this PR's file, seeded. */
async function buildEstate(dbName: string, tmpDir: string) {
  psql('postgres', ['-c', `CREATE DATABASE ${dbName}`]);
  const fixturePath = path.join(tmpDir, `${dbName}-fixture.sql`);
  writeFileSync(fixturePath, FIXTURE);
  psql(dbName, ['-f', fixturePath]);
  psql(dbName, ['-f', M_ACK]);
  psql(dbName, ['-f', M_SEEN]);
  psql(dbName, ['-f', M_TRAIL]);
  const seedPath = path.join(tmpDir, `${dbName}-seed.sql`);
  writeFileSync(seedPath, SEED);
  psql(dbName, ['-f', seedPath]);

  const client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: dbName });
  await client.connect();
  return client;
}

const DB = `ack_seen_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const DB_MUT = `${DB}_mut`;

let tmp: string;
let client: Client;
let mutClient: Client | null = null;

/** Every row as read BEFORE this PR's file was applied. */
let before: Map<string, OwnerRow>;
/** …and immediately after, before any live call. */
let after: Map<string, OwnerRow>;
let eventsBeforeApply = -1;
let eventsAfterApply = -1;

/** Outcomes of the live calls, in the order they were made. */
let confirmP1: OwnerRow;
let confirmP2: OwnerRow;
let declineP3: OwnerRow;
let confirmP1Returned: { id: string; assignment_status: string; acknowledged_at: Date };
let eventsAfterConfirms = -1;
let eventsAfterDecline = -1;
let declinedEvents = -1;
let foreignRowError: { code?: string; message?: string } | null = null;
let foreignRowAfter: OwnerRow;
let anonError: { message?: string } | null = null;
/** Set by the non-vacuity control: did the mutant leave p1 unstamped? */
let mutantLeftP1Unseen: boolean | null = null;

beforeAll(async () => {
  try {
    psql('postgres', ['-c', 'SELECT 1']);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration files and proves behaviour against a\n` +
        `throwaway database; it will not pretend to pass without one.\n` +
        `  brew services start postgresql@16\n\n` +
        String(e?.stderr || e?.message || e),
    );
  }

  tmp = mkdtempSync(path.join(tmpdir(), 'ack-seen-'));
  client = await buildEstate(DB, tmp);

  before = await readRows(client);
  eventsBeforeApply = await countEvents(client);

  // THE CHANGE, applied verbatim as one transaction, the way the apply job does.
  psql(DB, ['--single-transaction', '-f', M_THIS]);

  after = await readRows(client);
  eventsAfterApply = await countEvents(client);

  // --- LIVE CALLS as the named owner, through the replaced function ---------
  await actingAs(client, { role: 'authenticated', uid: OWNER_A }, async () => {
    confirmP1Returned = await answer(client, after.get('p1')!.id, 'confirmed');
    await answer(client, after.get('p2')!.id, 'confirmed');
  });
  eventsAfterConfirms = await countEvents(client);
  let rows = await readRows(client);
  confirmP1 = rows.get('p1')!;
  confirmP2 = rows.get('p2')!;

  await actingAs(client, { role: 'authenticated', uid: OWNER_A }, async () => {
    await answer(client, after.get('p3')!.id, 'declined');
  });
  eventsAfterDecline = await countEvents(client);
  declinedEvents = Number(
    (
      await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.accreditation_ownership_events
          WHERE action = 'declined' AND owner_row_id = $1`,
        [after.get('p3')!.id],
      )
    ).rows[0].n,
  );
  rows = await readRows(client);
  declineP3 = rows.get('p3')!;

  // A answering B's row.
  await actingAs(client, { role: 'authenticated', uid: OWNER_A }, async () => {
    try {
      await answer(client, after.get('o1')!.id, 'confirmed');
    } catch (e: any) {
      foreignRowError = { code: e?.code, message: e?.message };
    }
  });
  foreignRowAfter = (await readRows(client)).get('o1')!;

  // anon.
  await actingAs(client, { role: 'anon', uid: null }, async () => {
    try {
      await answer(client, after.get('o1')!.id, 'confirmed');
    } catch (e: any) {
      anonError = { message: e?.message };
    }
  });

  // --- NON-VACUITY CONTROL --------------------------------------------------
  // The single most plausible way to write this change wrong: a write-once
  // column that never gets its first write. If the suite passes against this
  // mutant too, it is not testing the stamp.
  const src = readFileSync(M_THIS, 'utf8');
  // replaceAll, not replace: the header comment quotes the same expression
  // before the function body does, and a first-match replace would only edit
  // the comment — leaving the real SET intact and the "mutant" fully working.
  const mutated = src
    .replaceAll('COALESCE(o.first_seen_at, now())', 'o.first_seen_at')
    .replace(/AND p\.prosrc ~ '[^']*'/, 'AND TRUE');
  if (mutated === src) throw new Error('mutation did not apply — the migration text moved');
  const mutPath = path.join(tmp, 'mutated.sql');
  writeFileSync(mutPath, mutated);

  mutClient = await buildEstate(DB_MUT, tmp);
  psql(DB_MUT, ['--single-transaction', '-f', mutPath]);
  const mutRows = await readRows(mutClient);
  await actingAs(mutClient, { role: 'authenticated', uid: OWNER_A }, async () => {
    await answer(mutClient!, mutRows.get('p1')!.id, 'confirmed');
  });
  const mutP1 = (await readRows(mutClient)).get('p1')!;
  mutantLeftP1Unseen = mutP1.assignment_status === 'confirmed' && mutP1.first_seen_at === null;
}, 240_000);

afterAll(async () => {
  if (client) await client.end();
  if (mutClient) await mutClient.end();
  for (const db of [DB, DB_MUT]) {
    try {
      psql('postgres', ['-c', `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`]);
    } catch {
      /* throwaway databases; a failed drop must not fail the run */
    }
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

// ===========================================================================
describe('🛑 the fixture: answered by the owner, never clicked open', () => {
  it('was "answered but not opened" BEFORE the migration (the control that makes the next assertion mean something)', () => {
    const f1 = before.get('f1')!;
    expect(f1.assignment_status).toBe('confirmed');
    expect(f1.acknowledged_by).toBe(OWNER_A);
    expect(f1.first_seen_at).toBeNull();
  });

  it('is stamped AFTER, with the real acknowledged_at rather than now()', () => {
    const f1 = after.get('f1')!;
    expect(iso(f1.first_seen_at)).toBe(iso(f1.acknowledged_at));
    expect(iso(f1.first_seen_at)).toBe(new Date(ANSWERED_AT).toISOString());
  });

  it('a row whose owner_changed_at equals acknowledged_at exactly counts as the current owner\'s answer', () => {
    const f2 = after.get('f2')!;
    expect(iso(f2.first_seen_at)).toBe(new Date(ANSWERED_AT).toISOString());
  });

  it('a refusal by the owner is a sighting too', () => {
    const f7 = after.get('f7')!;
    expect(f7.assignment_status).toBe('declined');
    expect(iso(f7.first_seen_at)).toBe(new Date(ANSWERED_AT).toISOString());
  });
});

describe('the backfill asserts only what was observed', () => {
  it('leaves a row answered by somebody OTHER than the owner alone', () => {
    expect(before.get('f3')!.first_seen_at).toBeNull();
    expect(after.get('f3')!.first_seen_at).toBeNull();
  });

  it('leaves a pending row alone', () => {
    expect(after.get('f4')!.first_seen_at).toBeNull();
  });

  it('leaves a row whose owner changed AFTER the answer alone (that answer was a previous tenure)', () => {
    expect(after.get('f5')!.first_seen_at).toBeNull();
  });

  it('keeps an earlier stamp rather than moving it to the answer', () => {
    expect(iso(before.get('f6')!.first_seen_at)).toBe(new Date(SEEN_EARLIER).toISOString());
    expect(iso(after.get('f6')!.first_seen_at)).toBe(new Date(SEEN_EARLIER).toISOString());
  });

  it('changes nothing else on any row', () => {
    for (const [code, b] of before) {
      const a = after.get(code)!;
      expect(a.owner_user_id).toBe(b.owner_user_id);
      expect(a.assignment_status).toBe(b.assignment_status);
      expect(iso(a.acknowledged_at)).toBe(iso(b.acknowledged_at));
      expect(a.acknowledged_by).toBe(b.acknowledged_by);
    }
  });

  it('writes no ownership event, so nothing is announced', () => {
    expect(eventsBeforeApply).toBe(0);
    expect(eventsAfterApply).toBe(0);
  });
});

describe('from now on the answer itself stamps the sighting — whichever page code sent it', () => {
  it('confirming a never-opened row stamps first_seen_at in the same write', () => {
    expect(before.get('p1')!.first_seen_at).toBeNull();
    expect(confirmP1.assignment_status).toBe('confirmed');
    expect(confirmP1.acknowledged_by).toBe(OWNER_A);
    expect(confirmP1.first_seen_at).not.toBeNull();
    expect(iso(confirmP1.first_seen_at)).toBe(iso(confirmP1.acknowledged_at));
  });

  it('returns the same three columns it always did', () => {
    expect(Object.keys(confirmP1Returned).sort()).toEqual(['acknowledged_at', 'assignment_status', 'id']);
    expect(confirmP1Returned.assignment_status).toBe('confirmed');
  });

  it('confirming an already-opened row keeps the earlier sighting (write-once)', () => {
    expect(confirmP2.assignment_status).toBe('confirmed');
    expect(iso(confirmP2.first_seen_at)).toBe(new Date(SEEN_EARLIER).toISOString());
  });

  it('declining stamps it too', () => {
    expect(declineP3.assignment_status).toBe('declined');
    expect(iso(declineP3.first_seen_at)).toBe(iso(declineP3.acknowledged_at));
  });

  it('a confirm still writes no event; a decline still writes exactly its one declined event', () => {
    expect(eventsAfterConfirms).toBe(0);
    expect(eventsAfterDecline).toBe(1);
    expect(declinedEvents).toBe(1);
  });
});

describe('the guards are unchanged', () => {
  it('refuses to let one owner answer another owner\'s row (42501) and leaves it untouched', () => {
    expect(foreignRowError?.code).toBe('42501');
    expect(foreignRowError?.message).toMatch(/only the named owner/);
    expect(foreignRowAfter.assignment_status).toBe('pending');
    expect(foreignRowAfter.acknowledged_at).toBeNull();
    expect(foreignRowAfter.first_seen_at).toBeNull();
  });

  it('anon cannot execute the function at all', () => {
    expect(anonError?.message).toMatch(/permission denied for function fn_accreditation_acknowledge_ownership/);
  });
});

describe('non-vacuity control', () => {
  it('a version of the migration that never writes the stamp is caught by this suite', () => {
    expect(mutantLeftP1Unseen).toBe(true);
  });
});
