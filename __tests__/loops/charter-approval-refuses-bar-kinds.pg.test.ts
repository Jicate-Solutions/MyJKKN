/**
 * Charter approval refuses a bar proposal.
 *
 * Behavioural proof for
 *   supabase/migrations/20261226030000_charter_approval_refuses_bar_kinds.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * Every migration below is applied VERBATIM with psql to a throwaway database,
 * in filename order. Nothing here re-implements the guard in TypeScript. Each
 * test makes the exact RPC call a super admin's Approve button makes, then
 * reads back what PostgreSQL actually did to loop_registry. A test that modelled
 * the SQL would only prove the model agrees with itself.
 *
 * NON-VACUITY IS PROVED, NOT ASSERTED
 * -----------------------------------
 * The first block is a CONTROL that runs BEFORE this PR's file is applied, with
 * only the ORIGINAL 20260825030100 function loaded. It performs the identical
 * call, on the identical proposal row, and asserts the damage:
 *   the call returns true, all FIVE charter legs are NULLed, and the bar
 *   proposal is stamped 'approved' on the wrong path.
 * It runs inside a transaction that is rolled back, so the guard tests below
 * meet the same fixture, untouched. Without this block, "the legs survived"
 * could be true simply because nothing in the suite can reach them.
 *
 * That control is the live defect this PR closes: read on production
 * 2026-09-19, six kind='bar' status='proposed' rows sat against six loops whose
 * five legs were all SET — each one call away from a five-column data loss.
 *
 * WHY loop_registry IS BUILT FROM REAL MIGRATIONS AND NOT A HAND-WRITTEN TABLE
 * ---------------------------------------------------------------------------
 * The bug is a payload/column mismatch: a bar payload carries {bar, bar_kind}
 * and none of the five charter keys. A hand-written fixture table could quietly
 * disagree with production about which columns exist, and the mismatch — the
 * whole defect — would vanish. So the five charter legs arrive from
 * 20260726012000 and 20260719234500, and `kind` arrives from 20261225070000,
 * exactly as they do on main.
 *
 * REQUIRES a local PostgreSQL 16 and refuses to skip silently without one
 * (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml — a silent
 * skip reports green over a suite that never executed):
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/loops/charter-approval-refuses-bar-kinds.pg.test.ts
 *
 * Override the server with LOOPGUARD_TEST_PGHOST / _PGPORT / _PGUSER. On CI the
 * user defaults to `postgres` (the service container's trust-auth superuser)
 * rather than $USER, which is `runner` there and is not a role — the same
 * self-sufficient fallback __tests__/cdc/drive-details-change-notification.test.ts
 * uses, so this file needs no new entry in the workflow's env block.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIG = (f: string) => path.join(REPO, 'supabase/migrations', f);

/**
 * The estate this function stands on, in filename order — the order main
 * applied them in. loop_registry and its five charter legs, the proposals
 * table, the 'insufficient' status, and the `kind` column that created the
 * defect by putting three proposal shapes in one table.
 */
const UPSTREAM = [
  '20260710233000_loop_registry_edges_audits.sql',
  '20260719234500_loop_graph_visibility_and_edges_v1.sql',
  '20260726012000_loop_constitution_birth_gate_and_charter.sql',
  '20260825030000_loop_charter_proposals.sql',
  '20260927030000_loop_charter_insufficient_status.sql',
  '20261225070000_loop_bars_and_measurements.sql',
].map(MIG);

/** The function as it stands on main — the one the control proves is unsafe. */
const M_ORIGINAL = MIG('20260825030100_fn_loop_apply_charter_proposal.sql');
/** This PR. */
const M_THIS = MIG('20261226030000_charter_approval_refuses_bar_kinds.sql');

const PGHOST = process.env.LOOPGUARD_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.LOOPGUARD_TEST_PGPORT ?? '5432';
const PGUSER =
  process.env.LOOPGUARD_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');

const DBNAME = `loop_charter_guard_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

/**
 * The slice of Supabase these migrations assume: the three roles, the anon
 * default-EXECUTE grant their REVOKEs exist to undo, auth.uid() and the two
 * authority helpers the RLS policies call. is_super_admin() answers true — this
 * suite is about what a SUPER ADMIN can do through the RPC, which is precisely
 * the threat model in the migration header. The authorization check is not what
 * is under test; the kind check is.
 */
const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supabase grants EXECUTE on every new function to anon by default. Reproduced
-- so each migration's REVOKE has something real to revoke.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT '00000000-0000-4000-8000-00000000ad11'::uuid;
$$;

CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.is_admin()       RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY, email text);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
`;

/** auth.uid() above — what decided_by must carry after a real approval. */
const ACTING_UID = '00000000-0000-4000-8000-00000000ad11';

/** One loop per proposal kind, so no test depends on another's ordering. */
const LOOP_BAR = 'guard-bar';
const LOOP_REVIEW = 'guard-bar-review';
const LOOP_CHARTER = 'guard-charter';

const PROP_BAR = '00000000-0000-4000-8000-0000000000b1';
const PROP_REVIEW = '00000000-0000-4000-8000-0000000000b2';
const PROP_CHARTER = '00000000-0000-4000-8000-0000000000c1';

/**
 * The five legs as seeded. Distinctive strings so a failure names the leg that
 * moved rather than printing five nulls.
 */
const LEGS = {
  outcome_metric: 'leg1 outcome_metric — named-lead forward-move rate',
  counter_metric: 'leg2 counter_metric — reporter thumbs on resolution mail',
  intervention: 'leg3 intervention — the action the loop takes',
  baseline_window: 'leg4 baseline_window — own trailing 8 weeks',
  remeasure_window: 'leg5 remeasure_window — next engagement cycle',
} as const;

/** A bar payload: {bar, bar_kind} and not one of the five charter keys. */
const BAR_PAYLOAD = {
  bar: 'named-lead forward-move rate vs own trailing 8 weeks',
  bar_kind: 'comparison',
};

/** A real charter payload — the shape this function was written for. */
const CHARTER_PAYLOAD = {
  outcome_metric: 'new outcome_metric from the approved charter',
  counter_metric: 'new counter_metric from the approved charter',
  intervention: 'new intervention from the approved charter',
  baseline_window: 'new baseline_window from the approved charter',
  remeasure_window: 'new remeasure_window from the approved charter',
  kill_rule: 'stays on the proposal row — loop_registry has no such column',
  suggested_verdict_owner: 'also stays put — owners are fn_loop_set_owner’s job',
};

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

let client: Client;
let tmp: string;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await client.query(sql, params);
  return r.rows as T[];
}

/** The five charter legs as loop_registry currently holds them. */
async function legs(loopKey: string) {
  const rows = await q<Record<string, string | null>>(
    `SELECT outcome_metric, counter_metric, intervention, baseline_window, remeasure_window
       FROM public.loop_registry WHERE loop_key = $1`,
    [loopKey]
  );
  return rows[0];
}

async function proposal(id: string) {
  const rows = await q<{ status: string; kind: string; decided_by: string | null; decided_at: Date | null }>(
    `SELECT status, kind, decided_by, decided_at FROM public.loop_charter_proposals WHERE id = $1`,
    [id]
  );
  return rows[0];
}

/** Call the RPC. Returns the error message, or null when it succeeded. */
async function refusal(proposalId: string): Promise<string | null> {
  try {
    await client.query(`SELECT public.fn_loop_apply_charter_proposal($1)`, [proposalId]);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Call the RPC and return its boolean. Throws if the call was refused. */
async function apply(proposalId: string): Promise<boolean> {
  const rows = await q<{ ok: boolean }>(
    `SELECT public.fn_loop_apply_charter_proposal($1) AS ok`,
    [proposalId]
  );
  return rows[0].ok;
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration files and proves behaviour against a\n` +
        `throwaway database; it will not pretend to pass without one.\n` +
        `  brew services start postgresql@16\n\n` +
        String(err?.stderr || err?.message || e)
    );
  }

  tmp = mkdtempSync(path.join(tmpdir(), 'loopguard-'));
  const preludePath = path.join(tmp, 'prelude.sql');
  writeFileSync(preludePath, PRELUDE);

  psql(['-d', DBNAME, '-f', preludePath]);
  // Verbatim, in filename order. Each file's own DO $guard$ block runs here too:
  // 20261225070000 asserts its bar columns and per-kind index really landed, so
  // a broken upstream fails this line before any test runs.
  for (const m of UPSTREAM) psql(['-d', DBNAME, '-f', m]);
  // The function as main has it — NOT this PR's version. The control below
  // needs the unguarded body to have something to prove.
  psql(['-d', DBNAME, '-f', M_ORIGINAL]);

  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();

  // Three loops, each with all five charter legs filled — the shape of the six
  // live loops the six pending bar proposals point at.
  for (const key of [LOOP_BAR, LOOP_REVIEW, LOOP_CHARTER]) {
    await q(
      `INSERT INTO public.loop_registry
         (loop_key, name, owner_email, outcome_metric, counter_metric, intervention,
          baseline_window, remeasure_window)
       VALUES ($1, $2, 'aieee@jkkn.ac.in', $3, $4, $5, $6, $7)`,
      [
        key,
        `Guard fixture ${key}`,
        LEGS.outcome_metric,
        LEGS.counter_metric,
        LEGS.intervention,
        LEGS.baseline_window,
        LEGS.remeasure_window,
      ]
    );
  }

  await q(
    `INSERT INTO public.loop_charter_proposals (id, loop_key, kind, proposed, status)
     VALUES ($1, $2, 'bar', $3::jsonb, 'proposed'),
            ($4, $5, 'bar-review', $6::jsonb, 'proposed'),
            ($7, $8, 'charter', $9::jsonb, 'proposed')`,
    [
      PROP_BAR,
      LOOP_BAR,
      JSON.stringify(BAR_PAYLOAD),
      PROP_REVIEW,
      LOOP_REVIEW,
      JSON.stringify({ ...BAR_PAYLOAD, why: 'missed its bar 4 runs running' }),
      PROP_CHARTER,
      LOOP_CHARTER,
      JSON.stringify(CHARTER_PAYLOAD),
    ]
  );
}, 180_000);

afterAll(async () => {
  if (client) await client.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`]);
  } catch {
    /* disposable */
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('CONTROL: before this PR, approving a bar proposal erases the loop', () => {
  it('returns true, NULLs all five charter legs, and stamps the bar row approved', async () => {
    // Rolled back, so the guard tests below meet the untouched fixture and can
    // reuse this very proposal row. The control and the guard therefore make
    // the SAME call against the SAME row — only the function body differs.
    await client.query('BEGIN');
    try {
      expect(await apply(PROP_BAR)).toBe(true);

      const after = await legs(LOOP_BAR);
      expect(after).toEqual({
        outcome_metric: null,
        counter_metric: null,
        intervention: null,
        baseline_window: null,
        remeasure_window: null,
      });

      // Consumed on the wrong path: fn_loop_bar_decide can never see it again.
      expect((await proposal(PROP_BAR)).status).toBe('approved');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('the fixture is intact again after the rollback', async () => {
    expect(await legs(LOOP_BAR)).toEqual({ ...LEGS });
    expect((await proposal(PROP_BAR)).status).toBe('proposed');
  });
});

describe('with this PR applied, a non-charter proposal is refused', () => {
  beforeAll(() => {
    // Verbatim, including its own post-apply DO $guard$, which reads the body
    // back from the catalog and raises if the kind check is missing or sits
    // after the loop_registry UPDATE. A CREATE OR REPLACE that silently lost
    // the guard fails here, not in an assertion.
    psql(['-d', DBNAME, '-f', M_THIS]);
  });

  it('a kind=bar proposal raises, names fn_loop_bar_decide, and leaves all five legs alone', async () => {
    const message = await refusal(PROP_BAR);
    expect(
      message,
      'the call was NOT refused — a bar proposal went through the charter door, exactly as the CONTROL above shows it does without the guard'
    ).not.toBeNull();
    expect(message).toContain('decide it through fn_loop_bar_decide');

    expect(await legs(LOOP_BAR)).toEqual({ ...LEGS });

    const row = await proposal(PROP_BAR);
    expect(row.status).toBe('proposed');
    expect(row.decided_by).toBeNull();
    expect(row.decided_at).toBeNull();
  });

  it('a kind=bar-review proposal is refused the same way', async () => {
    const message = await refusal(PROP_REVIEW);
    expect(
      message,
      'the call was NOT refused — a bar-review proposal went through the charter door'
    ).not.toBeNull();
    expect(message).toContain('decide it through fn_loop_bar_decide');

    expect(await legs(LOOP_REVIEW)).toEqual({ ...LEGS });
    expect((await proposal(PROP_REVIEW)).status).toBe('proposed');
  });

  it('a kind=charter proposal still applies — the guard refuses bars, not charters', async () => {
    expect(await apply(PROP_CHARTER)).toBe(true);

    expect(await legs(LOOP_CHARTER)).toEqual({
      outcome_metric: CHARTER_PAYLOAD.outcome_metric,
      counter_metric: CHARTER_PAYLOAD.counter_metric,
      intervention: CHARTER_PAYLOAD.intervention,
      baseline_window: CHARTER_PAYLOAD.baseline_window,
      remeasure_window: CHARTER_PAYLOAD.remeasure_window,
    });

    const row = await proposal(PROP_CHARTER);
    expect(row.status).toBe('approved');
    expect(row.decided_by).toBe(ACTING_UID);
    expect(row.decided_at).not.toBeNull();
  });
});
