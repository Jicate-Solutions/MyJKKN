/**
 * Every learner who declared hears their result - selected or not.
 *
 * Behavioural proof for
 * supabase/migrations/20270205090000_cdc_drive_results_reach_every_learner.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration is applied VERBATIM to a throwaway PostgreSQL 16 and the emitter
 * is called the way the drive status trigger calls it. Every assertion reads
 * back the `notifications` rows PostgreSQL actually wrote - who each row
 * targets, what it says, where it sends them, and under which idempotency key.
 *
 * TWO CONTROLS, AND WHY THERE ARE TWO
 * -----------------------------------
 * Neither control is a hand-built wrong shape; both are real bodies from this
 * repository's history, installed beside the fix under other names.
 *
 *   MAIN     _fixtures/...live-2026-09-22.sql - the body jicate/main carries
 *            today (20260919100000). It differs from the shipped function in
 *            exactly ONE branch: results_announced, where it still writes one
 *            generic row to everybody. Every other branch must behave
 *            identically, and the tests below assert that.
 *
 *   REGRESSED _fixtures/...regressed-2026-09-15.sql - the body 20260915100000
 *            left running: no attendance_day branch at all, learner links
 *            pointing at the coordinator page. This regression has now happened
 *            twice. The REGRESSION GUARD block asserts the shipped function has
 *            those behaviours AND that this control does not, so the guard
 *            cannot pass vacuously.
 *
 * RUNNING IT
 * ----------
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/cdc/drive-results-per-outcome.test.ts
 *
 * Override the server with CDCRES_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
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
  'supabase/migrations/20270205090000_cdc_drive_results_reach_every_learner.sql'
);
/** What jicate/main carries today - the body this migration is rebuilt on. */
const CONTROL_MAIN = path.join(
  __dirname,
  '_fixtures/fn_cdc_emit_drive_notification.live-2026-09-22.sql'
);
/** The body 20260915100000 left running - no attendance_day, coordinator URLs. */
const CONTROL_REGRESSED = path.join(
  __dirname,
  '_fixtures/fn_cdc_emit_drive_notification.regressed-2026-09-15.sql'
);

const PGHOST = process.env.CDCRES_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.CDCRES_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.CDCRES_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const PGPASSWORD = process.env.CDCRES_TEST_PGPASSWORD;

const DBNAME = `cdc_results_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const DRIVE = '00000000-0000-4000-8000-0000000000d1';
const OTHER_DRIVE = '00000000-0000-4000-8000-0000000000d2';
const PROGRAM = '00000000-0000-4000-8000-0000000000a1';
const ACTOR = '00000000-0000-4000-8000-0000000000c9';
const RECRUITER = '00000000-0000-4000-8000-0000000000c1';
const OFFER_TYPE = '00000000-0000-4000-8000-0000000000c2';

const ROLE = {
  coordinator: '00000000-0000-4000-8000-0000000000e1',
  head: '00000000-0000-4000-8000-0000000000e2',
};
const TEAM = {
  coordinator: '00000000-0000-4000-8000-0000000000b1',
  head: '00000000-0000-4000-8000-0000000000b2',
};

/** Learners: profile id (what notifications target) + learners_profiles id. */
const L = {
  /** Declared 'willing', has a placement row -> selected. */
  picked: {
    profile: '00000000-0000-4000-8000-0000000000f1',
    learner: '00000000-0000-4000-8000-000000000001',
  },
  /** Declared 'confirmed', has a placement row -> selected. */
  picked2: {
    profile: '00000000-0000-4000-8000-0000000000f2',
    learner: '00000000-0000-4000-8000-000000000002',
  },
  /** Declared 'willing', no placement row -> not selected. */
  passed: {
    profile: '00000000-0000-4000-8000-0000000000f3',
    learner: '00000000-0000-4000-8000-000000000003',
  },
  /** Declared 'confirmed', no placement row -> not selected. */
  passed2: {
    profile: '00000000-0000-4000-8000-0000000000f4',
    learner: '00000000-0000-4000-8000-000000000004',
  },
  /** Declared then withdrew -> hears nothing, either way. */
  withdrawn: {
    profile: '00000000-0000-4000-8000-0000000000f5',
    learner: '00000000-0000-4000-8000-000000000005',
  },
} as const;

const COORD_URL = `/cdc/drives/${DRIVE}`;
const LEARNER_URL = `/cdc/drives/${DRIVE}/willingness`;
const BASE_KEY = `cdc.drive.${DRIVE}.results_announced`;

/** The slice of the estate the emitter reads, from the live catalogue 2026-09-18. */
const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

CREATE TYPE public.cdc_willingness_status AS ENUM ('willing','confirmed','withdrawn','no_show');
CREATE TYPE public.cdc_placement_status  AS ENUM ('offered','accepted','declined','rescinded');

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
CREATE TABLE public.cdc_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL, drive_id uuid, recruiter_id uuid NOT NULL,
  offer_type_id uuid NOT NULL,
  status public.cdc_placement_status NOT NULL DEFAULT 'offered');
-- 20260919112000 / 20260919130100: the 19 Sep drive flow's decision per learner.
CREATE TABLE public.cdc_drive_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id uuid NOT NULL, learner_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('selected', 'waitlisted', 'rejected', 'hold')),
  CONSTRAINT cdc_drive_selections_one_per_learner UNIQUE (drive_id, learner_id));
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, body text NOT NULL, url text, created_by uuid NOT NULL,
  targeting jsonb NOT NULL, priority text, category text, kind text NOT NULL,
  metadata jsonb, idempotency_key text, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX notifications_idem ON public.notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
`;

const FIXTURE = `
TRUNCATE public.notifications, public.cdc_placements, public.cdc_drive_selections,
         public.cdc_drive_willingness,
         public.cdc_drive_eligibility, public.learners_profiles, public.profiles,
         public.user_roles, public.custom_roles, public.cdc_drives;

INSERT INTO public.cdc_drives (id, title, created_by) VALUES
  ('${DRIVE}', 'Foxconn India', '${ACTOR}'),
  ('${OTHER_DRIVE}', 'Another Company', '${ACTOR}');

INSERT INTO public.custom_roles (id, role_key) VALUES
  ('${ROLE.coordinator}', 'cdc_coordinator'), ('${ROLE.head}', 'cdc_head');
INSERT INTO public.user_roles (user_id, role_id) VALUES
  ('${TEAM.coordinator}', '${ROLE.coordinator}'), ('${TEAM.head}', '${ROLE.head}');

INSERT INTO public.learners_profiles (id, program_id, lifecycle_status) VALUES
  ('${L.picked.learner}',    '${PROGRAM}', 'active'),
  ('${L.picked2.learner}',   '${PROGRAM}', 'active'),
  ('${L.passed.learner}',    '${PROGRAM}', 'active'),
  ('${L.passed2.learner}',   '${PROGRAM}', 'active'),
  ('${L.withdrawn.learner}', '${PROGRAM}', 'active');
INSERT INTO public.profiles (id, learner_id) VALUES
  ('${L.picked.profile}',    '${L.picked.learner}'),
  ('${L.picked2.profile}',   '${L.picked2.learner}'),
  ('${L.passed.profile}',    '${L.passed.learner}'),
  ('${L.passed2.profile}',   '${L.passed2.learner}'),
  ('${L.withdrawn.profile}', '${L.withdrawn.learner}');

INSERT INTO public.cdc_drive_eligibility (drive_id, program_ids)
  VALUES ('${DRIVE}', ARRAY['${PROGRAM}']::uuid[]);

INSERT INTO public.cdc_drive_willingness (drive_id, learner_id, status) VALUES
  ('${DRIVE}', '${L.picked.learner}',    'willing'),
  ('${DRIVE}', '${L.picked2.learner}',   'confirmed'),
  ('${DRIVE}', '${L.passed.learner}',    'willing'),
  ('${DRIVE}', '${L.passed2.learner}',   'confirmed'),
  ('${DRIVE}', '${L.withdrawn.learner}', 'withdrawn');

-- Two of the five were placed. The withdrawn learner is deliberately NOT placed.
INSERT INTO public.cdc_placements (learner_id, drive_id, recruiter_id, offer_type_id) VALUES
  ('${L.picked.learner}',  '${DRIVE}', '${RECRUITER}', '${OFFER_TYPE}'),
  ('${L.picked2.learner}', '${DRIVE}', '${RECRUITER}', '${OFFER_TYPE}');
`;

let admin: Client;
let db: Client;
let adminConnected = false;
let dbConnected = false;

type Row = {
  title: string;
  body: string;
  url: string;
  category: string;
  idempotency_key: string;
  targeting: { user_ids: string[] };
  metadata: Record<string, unknown>;
};

async function emit(
  from: string,
  to: string,
  fn = 'fn_cdc_emit_drive_notification'
): Promise<Row[]> {
  await db.query(`SELECT public.${fn}('${DRIVE}', '${from}', '${to}', '${ACTOR}')`);
  const { rows } = await db.query(
    `SELECT title, body, url, category, idempotency_key, targeting, metadata
     FROM public.notifications ORDER BY created_at, idempotency_key`
  );
  return rows as Row[];
}

const ids = (r: Row) => r.targeting.user_ids.slice().sort();
const byAudience = (rows: Row[], audience: string) =>
  rows.find((r) => r.metadata.audience === audience);

const allDeclared = [
  L.picked.profile,
  L.picked2.profile,
  L.passed.profile,
  L.passed2.profile,
].sort();

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
  await db.query(readFileSync(MIGRATION, 'utf8')); // VERBATIM
  await db.query(readFileSync(CONTROL_MAIN, 'utf8')); // main's body, renamed
  await db.query(readFileSync(CONTROL_REGRESSED, 'utf8')); // the regressed body
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

describe('results_announced - some selected, some not', () => {
  it('writes one row per outcome, and nobody is left without a message', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(2);

    const selected = byAudience(rows, 'selected')!;
    const notSelected = byAudience(rows, 'not_selected')!;
    expect(selected).toBeDefined();
    expect(notSelected).toBeDefined();

    expect(ids(selected)).toEqual([L.picked.profile, L.picked2.profile].sort());
    expect(ids(notSelected)).toEqual([L.passed.profile, L.passed2.profile].sort());

    // Every learner who declared and did not withdraw hears exactly one thing.
    const reached = [...ids(selected), ...ids(notSelected)].sort();
    expect(reached).toEqual(allDeclared);
  });

  it('tells the unselected learners they were not selected, in so many words', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    const notSelected = byAudience(rows, 'not_selected')!;
    expect(notSelected.body).toContain('not been selected');
    // The old generic sentence sent them to look at a page that never changed.
    expect(notSelected.body).not.toContain('see your selection status');
  });

  it('tells the selected learners they were selected', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    const selected = byAudience(rows, 'selected')!;
    expect(selected.body).toContain('have been selected');
    expect(selected.body).not.toContain('not been selected');
  });

  it('sends both audiences to the learner page, never the coordinator page', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    for (const row of rows) {
      expect(row.url).toBe(LEARNER_URL);
      expect(row.url).not.toBe(COORD_URL);
    }
  });

  it('never reaches a learner who withdrew', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    for (const row of rows) {
      expect(ids(row)).not.toContain(L.withdrawn.profile);
    }
  });

  it('keeps the two rows on distinct idempotency keys', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    const keys = rows.map((r) => r.idempotency_key).sort();
    expect(keys).toEqual([BASE_KEY, `${BASE_KEY}.not_selected`].sort());
    // The selected row keeps the original key, so a results notification already
    // sent under the old single-row shape is never re-sent.
    expect(byAudience(rows, 'selected')!.idempotency_key).toBe(BASE_KEY);
  });

  it('keeps the category every consumer already filters on', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    for (const row of rows) {
      expect(row.category).toBe('cdc.drive.results_announced');
    }
  });

  it('counts recipients per row, not across both', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    expect(byAudience(rows, 'selected')!.metadata.recipient_count).toBe(2);
    expect(byAudience(rows, 'not_selected')!.metadata.recipient_count).toBe(2);
  });
});

describe('results_announced - the lopsided cases', () => {
  it('everyone selected: one row, and no empty "not selected" row', async () => {
    await db.query(`
      INSERT INTO public.cdc_placements (learner_id, drive_id, recruiter_id, offer_type_id) VALUES
        ('${L.passed.learner}',  '${DRIVE}', '${RECRUITER}', '${OFFER_TYPE}'),
        ('${L.passed2.learner}', '${DRIVE}', '${RECRUITER}', '${OFFER_TYPE}')`);
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.audience).toBe('selected');
    expect(ids(rows[0])).toEqual(allDeclared);
  });

  it('nobody selected: one row, and it says so - the case that used to go silent', async () => {
    await db.query(`DELETE FROM public.cdc_placements`);
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.audience).toBe('not_selected');
    expect(rows[0].body).toContain('not been selected');
    expect(ids(rows[0])).toEqual(allDeclared);
    expect(rows[0].idempotency_key).toBe(`${BASE_KEY}.not_selected`);
  });

  it('nobody declared: no rows at all', async () => {
    await db.query(`DELETE FROM public.cdc_drive_willingness`);
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(0);
  });

  it('only withdrawn learners declared: no rows at all', async () => {
    await db.query(
      `UPDATE public.cdc_drive_willingness SET status = 'withdrawn' WHERE drive_id = '${DRIVE}'`
    );
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(0);
  });

  it('a placement on ANOTHER drive does not make a learner selected here', async () => {
    await db.query(`DELETE FROM public.cdc_placements`);
    await db.query(`
      INSERT INTO public.cdc_placements (learner_id, drive_id, recruiter_id, offer_type_id)
      VALUES ('${L.picked.learner}', '${OTHER_DRIVE}', '${RECRUITER}', '${OFFER_TYPE}')`);
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.audience).toBe('not_selected');
    expect(ids(rows[0])).toEqual(allDeclared);
  });

  it('a placement with a NULL drive_id belongs to no drive', async () => {
    await db.query(`DELETE FROM public.cdc_placements`);
    await db.query(`
      INSERT INTO public.cdc_placements (learner_id, drive_id, recruiter_id, offer_type_id)
      VALUES ('${L.picked.learner}', NULL, '${RECRUITER}', '${OFFER_TYPE}')`);
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.audience).toBe('not_selected');
  });

  it('two placement rows for one learner still send one message', async () => {
    await db.query(`
      INSERT INTO public.cdc_placements (learner_id, drive_id, recruiter_id, offer_type_id)
      VALUES ('${L.picked.learner}', '${DRIVE}', '${RECRUITER}', '${OFFER_TYPE}')`);
    const rows = await emit('attendance_day', 'results_announced');
    const selected = byAudience(rows, 'selected')!;
    expect(ids(selected)).toEqual([L.picked.profile, L.picked2.profile].sort());
    expect(selected.metadata.recipient_count).toBe(2);
  });
});

/**
 * Main's 19 Sep drive flow records the CDC's decision in cdc_drive_selections
 * (lib/services/cdc/drive-selection.ts) and never writes cdc_placements. The
 * learner page shows that decision. The bell must say the same thing the page
 * does - the first cut of this migration read cdc_placements alone and would
 * have told a learner marked 'selected' on that screen that they were not.
 */
describe('results_announced - the decision main records in cdc_drive_selections', () => {
  const decide = (learner: string, decision: string) =>
    db.query(
      `INSERT INTO public.cdc_drive_selections (drive_id, learner_id, decision)
       VALUES ('${DRIVE}', '${learner}', '${decision}')`
    );

  it('a learner marked selected on the new screen, with no placement row, is told they were selected', async () => {
    await db.query(`DELETE FROM public.cdc_placements`);
    await decide(L.passed.learner, 'selected');
    const rows = await emit('attendance_day', 'results_announced');
    const selected = byAudience(rows, 'selected')!;
    expect(selected).toBeDefined();
    expect(ids(selected)).toEqual([L.passed.profile]);
    expect(ids(byAudience(rows, 'not_selected')!)).not.toContain(L.passed.profile);
  });

  it('waitlisted and on-hold learners are not told "not selected" - their result is not final', async () => {
    await decide(L.passed.learner, 'waitlisted');
    await decide(L.passed2.learner, 'hold');
    const rows = await emit('attendance_day', 'results_announced');
    const pending = byAudience(rows, 'pending')!;
    expect(pending).toBeDefined();
    expect(ids(pending)).toEqual([L.passed.profile, L.passed2.profile].sort());
    expect(pending.body).toContain('not final');
    expect(pending.body).not.toContain('not been selected');
    expect(pending.url).toBe(LEARNER_URL);
    expect(pending.idempotency_key).toBe(`${BASE_KEY}.pending`);
    // Nobody left over for a "not selected" row.
    expect(byAudience(rows, 'not_selected')).toBeUndefined();
  });

  it('a rejected decision is a "not selected" message', async () => {
    await decide(L.passed.learner, 'rejected');
    const rows = await emit('attendance_day', 'results_announced');
    expect(ids(byAudience(rows, 'not_selected')!)).toContain(L.passed.profile);
  });

  it('a placement row wins over a waitlisted decision - one message, and it is "selected"', async () => {
    await decide(L.picked.learner, 'waitlisted');
    const rows = await emit('attendance_day', 'results_announced');
    expect(ids(byAudience(rows, 'selected')!)).toContain(L.picked.profile);
    expect(byAudience(rows, 'pending')).toBeUndefined();
  });

  it('every declared learner hears exactly one outcome across all three rows', async () => {
    await decide(L.passed.learner, 'hold');
    await decide(L.passed2.learner, 'rejected');
    const rows = await emit('attendance_day', 'results_announced');
    const reached = rows.flatMap((r) => ids(r)).sort();
    expect(reached).toEqual(allDeclared);
    expect(new Set(rows.map((r) => r.idempotency_key)).size).toBe(rows.length);
  });

  it('a decision on ANOTHER drive does not count here', async () => {
    await db.query(`DELETE FROM public.cdc_placements`);
    await db.query(
      `INSERT INTO public.cdc_drive_selections (drive_id, learner_id, decision)
       VALUES ('${OTHER_DRIVE}', '${L.passed.learner}', 'selected')`
    );
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.audience).toBe('not_selected');
  });

  it('without the selections table (not yet applied) it falls back to placements, and does not fail', async () => {
    await db.query(`ALTER TABLE public.cdc_drive_selections RENAME TO cdc_drive_selections_parked`);
    try {
      const rows = await emit('attendance_day', 'results_announced');
      expect(ids(byAudience(rows, 'selected')!)).toEqual(
        [L.picked.profile, L.picked2.profile].sort()
      );
      expect(ids(byAudience(rows, 'not_selected')!)).toEqual(
        [L.passed.profile, L.passed2.profile].sort()
      );
    } finally {
      await db.query(`ALTER TABLE public.cdc_drive_selections_parked RENAME TO cdc_drive_selections`);
    }
  });
});

describe('results_announced - idempotency', () => {
  it('emitting twice still leaves exactly two rows', async () => {
    await emit('attendance_day', 'results_announced');
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(2);
  });

  it('emitting twice from a different prior state still leaves two rows', async () => {
    await emit('attendance_day', 'results_announced');
    const rows = await emit('eligibility_locked', 'results_announced');
    expect(rows).toHaveLength(2);
  });

  it('the not-selected row is not swallowed by the selected row key', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    const keys = rows.map((r) => r.idempotency_key);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('every other transition is untouched', () => {
  it.each([
    ['draft', 'announced'],
    ['willingness_open', 'eligibility_locked'],
  ])('%s -> %s still writes one team row at the coordinator page', async (from, to) => {
    const rows = await emit(from, to);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(COORD_URL);
    expect(ids(rows[0])).toEqual([TEAM.coordinator, TEAM.head].sort());
  });

  it('closed still reaches the head only', async () => {
    const rows = await emit('results_announced', 'closed');
    expect(rows).toHaveLength(1);
    expect(ids(rows[0])).toEqual([TEAM.head]);
  });

  it('willingness_open is still the application-owned no-op', async () => {
    const rows = await emit('announced', 'willingness_open');
    expect(rows).toHaveLength(0);
  });

  it('an unhandled transition writes nothing', async () => {
    const rows = await emit('draft', 'some_state_that_does_not_exist');
    expect(rows).toHaveLength(0);
  });

  it('a drive that does not exist writes nothing', async () => {
    await db.query(`SELECT public.fn_cdc_emit_drive_notification(
      '00000000-0000-4000-8000-00000000dead', 'attendance_day', 'results_announced', '${ACTOR}')`);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.notifications`);
    expect(rows[0].n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// REGRESSION GUARD - the behaviours that keep getting dropped.
//
// Twice now a PR has rebuilt this function from an OLDER copy of its body and
// silently deleted work that was already live:
//   20260915100000 dropped what 20260914210000 added, and
//   PR #3892's first cut would have dropped what 20260919100000 restored.
// Neither showed up as a failing test, because no test asserted the behaviours
// existed. These do. If a future rebuild of this function loses the
// attendance_day branch, or sends a learner to the coordinator page, or
// re-merges the cancelled split, the suite goes red here.
//
// Every case is paired with the same assertion against CONTROL_REGRESSED - the
// body that actually lost these behaviours - so the guard cannot pass because
// it asks nothing.
// ---------------------------------------------------------------------------
describe('regression guard - behaviours 20260919100000 restored and this file carries over', () => {
  const REGRESSED = 'fn_ctl_regressed_emit_2026_09_15';

  it('attendance_day notifies the willing learners - the branch that went missing', async () => {
    const rows = await emit('eligibility_locked', 'attendance_day');
    expect(rows).toHaveLength(1);
    expect(ids(rows[0])).toEqual(allDeclared);
    expect(rows[0].category).toBe('cdc.drive.attendance_day');
  });

  it('...and the regressed body writes NOTHING on that transition', async () => {
    const rows = await emit('eligibility_locked', 'attendance_day', REGRESSED);
    expect(rows).toHaveLength(0);
  });

  it('attendance_day sends the learners to their own page', async () => {
    const rows = await emit('eligibility_locked', 'attendance_day');
    expect(rows[0].url).toBe(LEARNER_URL);
    expect(rows[0].url).not.toBe(COORD_URL);
  });

  it('results_announced sends both audiences to the learner page', async () => {
    const rows = await emit('attendance_day', 'results_announced');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.url).toBe(LEARNER_URL);
  });

  it('...and the regressed body sends them to the coordinator page they cannot open', async () => {
    const rows = await emit('attendance_day', 'results_announced', REGRESSED);
    expect(rows[0].url).toBe(COORD_URL);
  });

  it('cancelled writes a SEPARATE learner row at the learner page', async () => {
    const rows = await emit('willingness_open', 'cancelled');
    expect(rows).toHaveLength(2);

    const team = byAudience(rows, 'team')!;
    const learners = byAudience(rows, 'learners')!;
    expect(team.url).toBe(COORD_URL);
    expect(team.idempotency_key).toBe(`cdc.drive.${DRIVE}.cancelled`);
    expect(ids(team)).toEqual([TEAM.coordinator, TEAM.head].sort());

    expect(learners.url).toBe(LEARNER_URL);
    expect(learners.idempotency_key).toBe(`cdc.drive.${DRIVE}.cancelled.learners`);
    expect(ids(learners)).toEqual(allDeclared);
  });

  it('...and the regressed body writes ONE combined row at the coordinator page', async () => {
    const rows = await emit('willingness_open', 'cancelled', REGRESSED);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(COORD_URL);
  });

  it('willingness_open stays the application-owned no-op', async () => {
    const rows = await emit('announced', 'willingness_open');
    expect(rows).toHaveLength(0);
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
// CONTROL - main's own definition (20260919100000), installed beside the fix.
// These are the tests that prove the suite can tell main from this PR. The only
// branch that may differ is results_announced; if a future edit to this file
// changed anything else, the "identical to main" cases below would go red.
// ---------------------------------------------------------------------------
describe('control - what main does today', () => {
  const CTL = 'fn_ctl_main_emit_2026_09_22';

  it('writes ONE generic row to everyone who declared, selected or not', async () => {
    const rows = await emit('attendance_day', 'results_announced', CTL);
    expect(rows).toHaveLength(1);
    expect(ids(rows[0])).toEqual(allDeclared);
    expect(rows[0].metadata.audience).toBeUndefined();
  });

  it('tells a learner who was not selected nothing about being not selected', async () => {
    const rows = await emit('attendance_day', 'results_announced', CTL);
    expect(rows[0].body).toContain('see your selection status');
    expect(rows[0].body).not.toContain('not been selected');
  });

  it('says nothing different when nobody was selected - the reported gap', async () => {
    await db.query(`DELETE FROM public.cdc_placements`);
    const rows = await emit('attendance_day', 'results_announced', CTL);
    // One row still goes out, but it says only "results are out, go and look" -
    // and the page it points at shows an unselected learner nothing.
    expect(rows).toHaveLength(1);
    expect(rows[0].body).not.toContain('not been selected');
  });

  it('already sends learners to their own page - this PR must not undo that', async () => {
    const rows = await emit('attendance_day', 'results_announced', CTL);
    expect(rows[0].url).toBe(LEARNER_URL);
  });

  it('already has the attendance_day branch - this PR must not undo that', async () => {
    const rows = await emit('eligibility_locked', 'attendance_day', CTL);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(LEARNER_URL);
  });

  it('already splits cancelled in two - this PR must not undo that', async () => {
    const rows = await emit('willingness_open', 'cancelled', CTL);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.metadata.audience).sort()).toEqual(['learners', 'team']);
  });
});
