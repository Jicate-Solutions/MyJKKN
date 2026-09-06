/**
 * Regression tests for scripts/ci/check-migration-rename-applied.mjs.
 *
 * A guard that is not itself tested is a guard that quietly stops guarding.
 * These drive the real script as a subprocess against a fixture description of
 * the world (--fixture), so every verdict is exercised without production
 * credentials, and assert on the EXIT CODE — the only signal CI reads.
 *
 * The fixture stands in for two things at once: the git rename list, and what
 * production already carries. Both are the parts that cannot be reproduced in a
 * unit test, and both are the parts a mistake would hide in.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-migration-rename-applied.mjs');

let dir: string;

type Rename = { from: string; to: string; sql?: string };
type Fixture = {
  renames: Rename[];
  ledger?: string[];
  existing?: string[];
  credentials?: boolean;
};

function run(fixture: Fixture, extra: string[] = []): { code: number; out: string } {
  const file = path.join(dir, `fx-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(fixture), 'utf8');
  // spawnSync, not execFileSync: findings go to stderr, and execFileSync surfaces
  // stderr only on a non-zero exit — which would hide the detail on every passing
  // case and make a wrong-reason pass indistinguishable from a right one.
  const r = spawnSync('node', [SCRIPT, '--fixture', file, '--verbose', ...extra], { encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const mig = (v: string, name: string) => `supabase/migrations/${v}_${name}.sql`;

beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), 'mig-rename-guard-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('rename detection scope', () => {
  it('passes, and never touches the database, when the PR renames no migration', () => {
    const r = run({ renames: [] });
    expect(r.code).toBe(0);
    expect(r.out).toContain('database not contacted');
  });

  it('ignores a rename that KEEPS its version — no ledger key changes, nothing is re-armed', () => {
    const r = run({
      renames: [{
        from: mig('20260801002300', 'old_name'),
        to: mig('20260801002300', 'better_name'),
        sql: 'CREATE TABLE public.ims_stock_movements (id uuid);',
      }],
      existing: ['table:ims_stock_movements'],
    });
    expect(r.code).toBe(0);
  });
});

describe('the 2026-08-04 incident: applied under a different version, ledger silent', () => {
  const incident: Fixture = {
    renames: [{
      from: mig('20260801002300', 'ims_transfer_stock_engine'),
      to: mig('20260801002301', 'ims_transfer_stock_engine'),
      sql: `
        CREATE TABLE IF NOT EXISTS public.ims_stock_movements (id UUID PRIMARY KEY);
        CREATE INDEX IF NOT EXISTS idx_ims_stock_movements_item ON public.ims_stock_movements (id);
        DROP POLICY IF EXISTS ims_stock_movements_insert ON public.ims_stock_movements;
        CREATE POLICY ims_stock_movements_insert ON public.ims_stock_movements
          FOR INSERT TO authenticated WITH CHECK (true);
        CREATE OR REPLACE FUNCTION public.ims_pick_fefo_batches(p_item_id UUID) RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;
      `,
    }],
    // Neither version is in the ledger — exactly what production looked like.
    ledger: [],
    existing: [
      'table:ims_stock_movements',
      'index:idx_ims_stock_movements_item',
      'policy:ims_stock_movements.ims_stock_movements_insert',
      'function:ims_pick_fefo_batches',
    ],
  };

  it('FAILS the rename even though the ledger knows nothing about either version', () => {
    const r = run(incident);
    expect(r.code).toBe(1);
    expect(r.out).toContain('applied-by-object');
  });

  it('still bites after replaced objects are subtracted — the table and index it CREATES decide it', () => {
    // The policy is DROPped and the function CREATE-OR-REPLACEd, so both are
    // excluded from the evidence (see extractReplacedObjects). The guard must
    // still fail on what is left, or the 2026-08-04 fix has been undone.
    const r = run(incident);
    expect(r.code).toBe(1);
    expect(r.out).toContain('counted as evidence AND already in production');
    expect(r.out).toContain('table:ims_stock_movements');
  });

  it('names the objects production already carries, so the reviewer can check them', () => {
    const r = run(incident);
    expect(r.out).toContain('policy:ims_stock_movements.ims_stock_movements_insert');
  });

  it('passes the same rename when production carries none of the objects', () => {
    const r = run({ ...incident, existing: [] });
    expect(r.code).toBe(0);
    expect(r.out).toContain('not-applied');
  });

  it('fails a PARTIALLY applied source — the worst state to re-arm', () => {
    // Partiality is now measured over the EVIDENCE set (what the file creates
    // outright), not over every declared object: the table exists, the index it
    // also creates does not. Before the 2026-09-04 change this fixture read
    // `existing: ['table:…']` alone, which is no longer partial — the policy and
    // function are excluded, leaving the table as the only evidence object and
    // therefore a clean applied-by-object.
    const r = run({ ...incident, existing: ['table:ims_stock_movements'] });
    expect(r.code).toBe(1);
    expect(r.out).toContain('partially-applied');
  });
});

describe('ledger hits are definitive in the positive direction', () => {
  const base: Fixture = {
    renames: [{
      from: mig('20260801002300', 'engine'),
      to: mig('20260801002301', 'engine'),
      sql: 'CREATE TABLE public.brand_new_table (id uuid);',
    }],
    existing: [],
  };

  it('fails when the SOURCE version is recorded as applied', () => {
    const r = run({ ...base, ledger: ['20260801002300'] });
    expect(r.code).toBe(1);
    expect(r.out).toContain('ledger-source');
  });

  it('fails when the TARGET version is already recorded — the collision, facing the other way', () => {
    const r = run({ ...base, ledger: ['20260801002301'] });
    expect(r.code).toBe(1);
    expect(r.out).toContain('ledger-target');
  });
});

describe('fail-closed when production cannot be reached', () => {
  const unreachable: Fixture = {
    renames: [{
      from: mig('20260801002300', 'engine'),
      to: mig('20260801002301', 'engine'),
      sql: 'CREATE TABLE public.t (id uuid);',
    }],
    credentials: false,
  };

  it('refuses to pass an unchecked rename', () => {
    const r = run(unreachable);
    expect(r.code).toBe(1);
    expect(r.out).toContain('no-credentials');
  });

  it('accepts a RENAME-SAFE attestation naming both versions', () => {
    const r = run({
      ...unreachable,
      renames: [{
        ...unreachable.renames[0],
        sql: '-- RENAME-SAFE: 20260801002300 -> 20260801002301 — objects absent, checked by hand\nCREATE TABLE public.t (id uuid);',
      }],
    });
    expect(r.code).toBe(0);
  });

  it('ignores an attestation that names a different pair of versions', () => {
    const r = run({
      ...unreachable,
      renames: [{
        ...unreachable.renames[0],
        sql: '-- RENAME-SAFE: 20260101000000 -> 20260101000001 — unrelated\nCREATE TABLE public.t (id uuid);',
      }],
    });
    expect(r.code).toBe(1);
  });

  it('does NOT let an attestation override a positive finding — the property that makes the escape safe', () => {
    const r = run({
      renames: [{
        from: mig('20260801002300', 'engine'),
        to: mig('20260801002301', 'engine'),
        sql: '-- RENAME-SAFE: 20260801002300 -> 20260801002301 — I promise\nCREATE TABLE public.t (id uuid);',
      }],
      existing: ['table:t'],
      credentials: true,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('applied-by-object');
  });
});

describe('object extraction', () => {
  it('fails a rename whose file declares nothing readable, rather than guessing', () => {
    const r = run({
      renames: [{
        from: mig('20260801002300', 'seed'),
        to: mig('20260801002301', 'seed'),
        sql: "INSERT INTO public.platform_policies (policy_key) VALUES ('x');",
      }],
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('nothing-parsed');
  });

  it('does not count a CREATE that is commented out', () => {
    const r = run({
      renames: [{
        from: mig('20260801002300', 'x'),
        to: mig('20260801002301', 'x'),
        sql: '-- CREATE TABLE public.ghost (id uuid);\nCREATE TABLE public.real_one (id uuid);',
      }],
      existing: ['table:ghost'],
    });
    // `ghost` exists in production but is only mentioned in a comment, so the
    // only declared object is `real_one`, which does not — the rename is safe.
    expect(r.code).toBe(0);
    expect(r.out).toContain('not-applied');
  });

  it('reads ADD COLUMN, including several in one ALTER TABLE', () => {
    const r = run({
      renames: [{
        from: mig('20260801002300', 'cols'),
        to: mig('20260801002301', 'cols'),
        sql: `ALTER TABLE public.ims_supply_shipments
                ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS stock_applied_at  TIMESTAMPTZ;`,
      }],
      existing: ['column:ims_supply_shipments.stock_released_at', 'column:ims_supply_shipments.stock_applied_at'],
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('applied-by-object');
  });

  it('reads ADD CONSTRAINT — a CHECK swap is a real DDL fingerprint, not "nothing"', () => {
    // The file DROPs this constraint and re-ADDs it, so its presence cannot tell
    // "this migration ran" from "the earlier migration's constraint is still
    // there". The guard still refuses the rename — the reason is now
    // `evidence-all-replaced` rather than `applied-by-object`, which is the
    // honest one: it is not evidence, and there is nothing else to go on.
    const r = run({
      renames: [{
        from: mig('20260801140000', 'event_registration_uploads'),
        to: mig('20260801140002', 'event_registration_uploads'),
        sql: `ALTER TABLE public.event_registration_form_fields
                DROP CONSTRAINT IF EXISTS event_registration_form_fields_field_type_check;
              ALTER TABLE public.event_registration_form_fields
                ADD CONSTRAINT event_registration_form_fields_field_type_check
                CHECK (field_type = ANY (ARRAY['text', 'file']));`,
      }],
      existing: ['constraint:event_registration_form_fields.event_registration_form_fields_field_type_check'],
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('evidence-all-replaced');
    expect(r.out).toContain('event_registration_form_fields_field_type_check');
  });

  it('an ADD CONSTRAINT with no matching DROP stays evidence, and still fails when present', () => {
    const r = run({
      renames: [{
        from: mig('20260801140000', 'event_registration_uploads'),
        to: mig('20260801140002', 'event_registration_uploads'),
        sql: `ALTER TABLE public.event_registration_form_fields
                ADD CONSTRAINT event_registration_form_fields_field_type_check
                CHECK (field_type = ANY (ARRAY['text', 'file']));`,
      }],
      existing: ['constraint:event_registration_form_fields.event_registration_form_fields_field_type_check'],
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('applied-by-object');
  });

  it('treats a policy as belonging to its table, so two tables may share a policy name', () => {
    const r = run({
      renames: [{
        from: mig('20260801002300', 'p'),
        to: mig('20260801002301', 'p'),
        sql: 'CREATE POLICY scoped ON public.table_b FOR SELECT TO authenticated USING (true);',
      }],
      // Same policy name, different table — must NOT count as present.
      existing: ['policy:table_a.scoped'],
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('not-applied');
  });
});

/**
 * The 2026-09-04 false positive, and the property added to stop it repeating.
 *
 * An object counts as evidence that THIS migration ran only if this migration is
 * the only thing that could have put it there. A file that DROPs an object and
 * re-CREATEs it (or CREATE-OR-REPLACEs it) is saying the opposite out loud, so
 * its presence is equally explained by the earlier migration that created it and
 * must be subtracted before the verdict is taken.
 *
 * Both directions matter and both are asserted here: the #3263 shape must PASS,
 * and a migration whose CREATED objects are present must still FAIL.
 */
describe('replaced objects are not evidence (PR #3263, 2026-09-04)', () => {
  // The real shape, reduced: eight tables the file creates and production does
  // not have (verified live — each returns HTTP 404 from PostgREST against
  // controls that return 401), plus the four grievance_tickets policies it DROPs
  // and re-CREATEs, which belong to 20260423_unification_crud_retrofit.sql, plus
  // the compatibility wrapper it CREATE OR REPLACEs over a live function.
  const instasolver = (existing: string[]): Fixture => ({
    renames: [{
      from: mig('20260504', 'instasolver_substrate'),
      to: mig('20261103000000', 'instasolver_substrate'),
      sql: `
        CREATE TABLE IF NOT EXISTS public.requirement_requests (id UUID PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS public.requirement_votes (id UUID PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS public.issue_escalation_rules (id UUID PRIMARY KEY);
        CREATE INDEX IF NOT EXISTS idx_req_req_raised_by ON public.requirement_requests (id);

        DROP POLICY IF EXISTS "grievance_tickets_select" ON public.grievance_tickets;
        CREATE POLICY "grievance_tickets_select" ON public.grievance_tickets FOR SELECT USING (true);
        DROP POLICY IF EXISTS "grievance_tickets_insert" ON public.grievance_tickets;
        CREATE POLICY "grievance_tickets_insert" ON public.grievance_tickets FOR INSERT WITH CHECK (true);

        CREATE OR REPLACE FUNCTION public.fn_generate_unresolved_grievance_items()
        RETURNS INT LANGUAGE plpgsql AS $wrap$ BEGIN RETURN 0; END; $wrap$;
      `,
    }],
    ledger: [],
    existing,
  });

  // What production actually carries today: the four replaced objects, none of
  // the created ones.
  const onlyReplacedPresent = [
    'policy:grievance_tickets.grievance_tickets_select',
    'policy:grievance_tickets.grievance_tickets_insert',
    'function:fn_generate_unresolved_grievance_items',
  ];

  it('PASSES the #3263 rename — every object it creates is absent; only replacements are present', () => {
    const r = run(instasolver(onlyReplacedPresent));
    expect(r.code).toBe(0);
    expect(r.out).toContain('not-applied');
  });

  it('reports which objects counted as evidence and which were excluded as replaced', () => {
    // The old message said "5 of 59 objects present" and stopped there, which
    // cannot be argued with from a CI log. Both sides must be named.
    const r = run(instasolver(onlyReplacedPresent));
    expect(r.out).toContain('counted as evidence');
    expect(r.out).toContain('excluded as replaced');
    expect(r.out).toContain('table:requirement_requests');
    expect(r.out).toContain('policy:grievance_tickets.grievance_tickets_select');
  });

  it('STILL FAILS when the objects it actually creates are present — the guard keeps its teeth', () => {
    const r = run(instasolver([...onlyReplacedPresent,
      'table:requirement_requests', 'table:requirement_votes',
      'table:issue_escalation_rules', 'index:idx_req_req_raised_by']));
    expect(r.code).toBe(1);
    expect(r.out).toContain('applied-by-object');
  });

  it('still fails when only SOME created objects are present', () => {
    const r = run(instasolver([...onlyReplacedPresent, 'table:requirement_requests']));
    expect(r.code).toBe(1);
    expect(r.out).toContain('partially-applied');
  });

  it('refuses, rather than passing, when every declared object is one it replaces', () => {
    // A pure policy-replacement migration leaves nothing that can decide the
    // question. Object existence is silent, so the guard is too — and a silent
    // guard must fail, not wave it through.
    const r = run({
      renames: [{
        from: mig('20260801002300', 'rls_only'),
        to: mig('20260801002301', 'rls_only'),
        sql: `DROP POLICY IF EXISTS p ON public.t;
              CREATE POLICY p ON public.t FOR SELECT TO authenticated USING (true);`,
      }],
      existing: [],
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('evidence-all-replaced');
  });

  it('excludes a CREATE OR REPLACE FUNCTION even with no DROP in front of it', () => {
    const r = run({
      renames: [{
        from: mig('20260801002300', 'fn'),
        to: mig('20260801002301', 'fn'),
        sql: `CREATE TABLE public.brand_new (id uuid);
              CREATE OR REPLACE FUNCTION public.fn_existing() RETURNS void LANGUAGE sql AS $q$ SELECT 1 $q$;`,
      }],
      existing: ['function:fn_existing'],
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('not-applied');
  });

  it('a DROP inside a function body is NOT a replacement — it never runs at migration time', () => {
    // Over-excluding is the dangerous direction: it hands out a false pass. A
    // DROP POLICY that only appears inside a dollar-quoted body runs whenever
    // somebody calls the function, so the policy stays evidence and the rename
    // is still blocked.
    const r = run({
      renames: [{
        from: mig('20260801002300', 'body'),
        to: mig('20260801002301', 'body'),
        sql: `CREATE POLICY p ON public.t FOR SELECT TO authenticated USING (true);
              CREATE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $body$
              BEGIN
                DROP POLICY IF EXISTS p ON public.t;
              END;
              $body$;`,
      }],
      existing: ['policy:t.p'],
    });
    // Had the body's DROP been read as a replacement, `p` would have left the
    // evidence set, nothing present would remain, and this would have PASSED.
    expect(r.code).toBe(1);
    expect(r.out).toContain('0 excluded as replaced');
    expect(r.out).toContain('counted as evidence AND already in production: policy:t.p');
  });

  it('a DROP with no matching CREATE changes nothing — it is not a declared object', () => {
    const r = run({
      renames: [{
        from: mig('20260801002300', 'cleanup'),
        to: mig('20260801002301', 'cleanup'),
        sql: `DROP POLICY IF EXISTS legacy_p ON public.t;
              CREATE TABLE public.brand_new (id uuid);`,
      }],
      existing: ['policy:t.legacy_p'],
    });
    // legacy_p is dropped and never recreated, so it is not declared at all and
    // cannot be counted either way. brand_new is absent → safe.
    expect(r.code).toBe(0);
    expect(r.out).toContain('not-applied');
  });

  it('subtracts DROP COLUMN / DROP CONSTRAINT targets that the same file re-adds', () => {
    const r = run({
      renames: [{
        from: mig('20260801002300', 'cols'),
        to: mig('20260801002301', 'cols'),
        sql: `ALTER TABLE public.t DROP COLUMN IF EXISTS c;
              ALTER TABLE public.t ADD COLUMN IF NOT EXISTS c TEXT;
              CREATE TABLE public.brand_new (id uuid);`,
      }],
      existing: ['column:t.c'],
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('not-applied');
  });
});

/**
 * The same two verdicts, driven by the REAL migration bodies on main rather than
 * by hand-written SQL. Hand-written fixtures prove the logic; these prove the
 * logic still lands on the two files the logic was written for, whose SQL is
 * 45KB and 30KB of the kind of thing a reduced fixture quietly smooths over.
 *
 * If either file is deleted or renamed, these fail loudly. That is intended —
 * silently skipping is how a guard's tests stop guarding.
 */
describe('the real files on main, not reductions of them', () => {
  const read = (rel: string) => {
    const p = path.resolve(process.cwd(), rel);
    expect(existsSync(p), `${rel} is missing — update or remove this test deliberately`).toBe(true);
    return readFileSync(p, 'utf8');
  };

  it('PASSES the real 20260504_instasolver_substrate.sql rename that PR #3263 makes', () => {
    // Production carries the objects this file REPLACES and none that it
    // creates. Stricter than reality: on 2026-09-04 only 5 of its 26 replaced
    // objects were actually present, the rest sitting on tables that do not
    // exist. If it passes with all 26 present it passes with 5.
    // PR #3263 performs this rename, so from that merge onward the body lives at
    // the NEW path. The simulated rename below still runs from -> to, which is the
    // historical fact the guard is being tested against.
    const sql = read('supabase/migrations/20261103000000_instasolver_substrate.sql');
    const r = run({
      renames: [{
        from: 'supabase/migrations/20260504_instasolver_substrate.sql',
        to: 'supabase/migrations/20261103000000_instasolver_substrate.sql',
        sql,
      }],
      existing: [
        'policy:grievance_tickets.grievance_tickets_select',
        'policy:grievance_tickets.grievance_tickets_insert',
        'policy:grievance_tickets.grievance_tickets_update',
        'policy:grievance_tickets.grievance_tickets_delete',
        'function:fn_generate_unresolved_grievance_items',
      ],
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('not-applied');
  });

  it('STILL FAILS the real 20260801002300_ims_transfer_stock_engine.sql rename of 2026-08-04', async () => {
    // Production carries everything the file declares — what was found live on
    // 2026-08-04. The dropped policies and replaced functions drop out of the
    // evidence; the columns, indexes and un-dropped policies do not, and they
    // are enough.
    const rel = 'supabase/migrations/20260801002300_ims_transfer_stock_engine.sql';
    const sql = read(rel);
    const { extractObjects } = await import(SCRIPT);
    const objects: string[] = extractObjects(sql);
    expect(objects.length).toBeGreaterThan(0);

    const r = run({
      renames: [{ from: rel, to: 'supabase/migrations/20260801002301_ims_transfer_stock_engine.sql', sql }],
      existing: objects,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('applied-by-object');
    // The point of the change: the reason must be carried by objects the file
    // CREATES, not by the policies it merely re-writes.
    expect(r.out).toContain('counted as evidence AND already in production');
    expect(r.out).toContain('excluded as replaced');
  });
});

describe('the probe SQL', () => {
  it('emits catalog SELECTs only — the gate must never write', () => {
    const r = spawnSync('node', [SCRIPT, '--print-sql'], { encoding: 'utf8' });
    const sql = `${r.stdout}`;
    expect(r.status).toBe(0);
    expect(sql).toContain('pg_policies');
    expect(sql).toContain('schema_migrations');
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\s/i);
  });
});
