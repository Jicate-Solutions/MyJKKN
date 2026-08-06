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
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
      'policy:ims_stock_movements.ims_stock_movements_insert',
      'function:ims_pick_fefo_batches',
    ],
  };

  it('FAILS the rename even though the ledger knows nothing about either version', () => {
    const r = run(incident);
    expect(r.code).toBe(1);
    expect(r.out).toContain('applied-by-object');
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
