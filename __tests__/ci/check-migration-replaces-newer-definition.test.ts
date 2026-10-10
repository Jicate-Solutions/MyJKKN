/**
 * Regression tests for scripts/ci/check-migration-replaces-newer-definition.mjs.
 *
 * A guard that is not itself tested is a guard that quietly stops guarding.
 * These drive the REAL script as a subprocess against a fixture description of
 * the world (--fixture), so every verdict is exercised with no git history and
 * no network, and assert on the EXIT CODE — the only signal CI reads.
 *
 * The fixture stands in for the two things a unit test cannot reproduce: the
 * set of migrations this pull request ADDS, and the set the BASE BRANCH carries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(
  process.cwd(),
  'scripts/ci/check-migration-replaces-newer-definition.mjs'
);

let dir: string;

type File = { path: string; sql: string };
type Fixture = { added: File[]; base?: File[]; baseLabel?: string };

function run(fixture: Fixture): { code: number; out: string } {
  const file = path.join(dir, `fx-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(fixture), 'utf8');
  // spawnSync, not execFileSync: findings go to stderr, and execFileSync surfaces
  // stderr only on a non-zero exit — which would hide the detail on a passing
  // case and make a wrong-reason pass indistinguishable from a right one.
  const r = spawnSync('node', [SCRIPT, '--fixture', file, '--verbose'], { encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const mig = (v: string, name: string): string => `supabase/migrations/${v}_${name}.sql`;

const emitter = (extra = '') => `
CREATE OR REPLACE FUNCTION public.fn_cdc_emit_drive_notification(p_drive_id uuid, p_to_state text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN ${extra} RETURN; END; $function$;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_notification(uuid, text) FROM anon;
`;

beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), 'mig-replace-guard-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------
// The incident this guard exists for.
// ---------------------------------------------------------------------------
describe('the fn_cdc_emit_drive_notification incident (three times to one function)', () => {
  const incident: Fixture = {
    added: [{ path: mig('20260918173000', 'cdc_drive_results_reach_every_learner'), sql: emitter() }],
    base: [
      { path: mig('20260915100000', 'cdc_drives_semester_targeting'), sql: emitter() },
      { path: mig('20260919100000', 'cdc_drive_notification_emitter_restore'), sql: emitter('/* attendance_day */') },
    ],
    baseLabel: 'jicate/main',
  };

  it('FAILS a CREATE OR REPLACE that main redefines at a HIGHER version', () => {
    const r = run(incident);
    expect(r.code).toBe(1);
  });

  it('names the function, the PR migration and main newer migration', () => {
    const { out } = run(incident);
    expect(out).toContain('fn_cdc_emit_drive_notification');
    expect(out).toContain('20260918173000_cdc_drive_results_reach_every_learner.sql');
    expect(out).toContain('20260919100000_cdc_drive_notification_emitter_restore.sql');
  });

  it('tells the author what to do, in the words the fix actually needs', () => {
    const { out } = run(incident);
    expect(out).toContain("rebuild from main's current body, then renumber past it");
  });

  it('PASSES the same content once it is renumbered past main', () => {
    const r = run({
      ...incident,
      added: [{ path: mig('20270205090000', 'cdc_drive_results_reach_every_learner'), sql: emitter() }],
    });
    expect(r.code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scope: what the guard must NOT fail. False failures are how guards get deleted.
// ---------------------------------------------------------------------------
describe('scope', () => {
  it('passes, and reports nothing to check, when the PR adds no migration', () => {
    const r = run({ added: [] });
    expect(r.code).toBe(0);
    expect(r.out).toContain('0 migration file(s) added');
  });

  it('passes when the PR redefines a function main does not define at all', () => {
    const r = run({
      added: [{ path: mig('20260918173000', 'x'), sql: emitter() }],
      base: [{ path: mig('20260919100000', 'unrelated'), sql: 'CREATE TABLE public.t (id uuid);' }],
    });
    expect(r.code).toBe(0);
  });

  it('passes when main defines it at a LOWER version — that is an ordinary update', () => {
    const r = run({
      added: [{ path: mig('20260920000000', 'x'), sql: emitter() }],
      base: [{ path: mig('20260919100000', 'restore'), sql: emitter() }],
    });
    expect(r.code).toBe(0);
  });

  it('passes on an EQUAL version — that is a duplicate-version collision, a different guard', () => {
    const r = run({
      added: [{ path: mig('20260919100000', 'x'), sql: emitter() }],
      base: [{ path: mig('20260919100000', 'restore'), sql: emitter() }],
    });
    expect(r.code).toBe(0);
  });

  it('passes on a plain CREATE FUNCTION — only OR REPLACE overwrites silently', () => {
    const r = run({
      added: [{
        path: mig('20260918173000', 'x'),
        sql: 'CREATE FUNCTION public.fn_new_thing() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;',
      }],
      base: [{
        path: mig('20260919100000', 'later'),
        sql: 'CREATE OR REPLACE FUNCTION public.fn_new_thing() RETURNS void LANGUAGE sql AS $$ SELECT 2 $$;',
      }],
    });
    expect(r.code).toBe(0);
  });

  it('ignores nested directories — supabase db push never reads them', () => {
    const r = run({
      added: [{ path: 'supabase/migrations/admission/20260918173000_x.sql', sql: emitter() }],
      base: [{ path: mig('20260919100000', 'restore'), sql: emitter() }],
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('0 migration file(s) added');
  });
});

// ---------------------------------------------------------------------------
// Parsing. Each case is a way a character-window regex gets the answer wrong.
// ---------------------------------------------------------------------------
describe('parsing', () => {
  it('does not fail on a COMMENTED-OUT CREATE OR REPLACE in the PR file', () => {
    const r = run({
      added: [{
        path: mig('20260918173000', 'x'),
        sql: `-- CREATE OR REPLACE FUNCTION public.fn_cdc_emit_drive_notification(a uuid) ...
/* CREATE OR REPLACE FUNCTION public.fn_cdc_emit_drive_notification(a uuid) */
CREATE TABLE public.t (id uuid);`,
      }],
      base: [{ path: mig('20260919100000', 'restore'), sql: emitter() }],
    });
    expect(r.code).toBe(0);
  });

  it('does not count a COMMENTED-OUT definition on the base side as the newer one', () => {
    const r = run({
      added: [{ path: mig('20260918173000', 'x'), sql: emitter() }],
      base: [{
        path: mig('20260919100000', 'restore'),
        sql: '-- CREATE OR REPLACE FUNCTION public.fn_cdc_emit_drive_notification(a uuid, b text)\nCREATE TABLE public.t (id uuid);',
      }],
    });
    expect(r.code).toBe(0);
  });

  it('matches across the schema qualifier — public.f and f are one function', () => {
    const r = run({
      added: [{
        path: mig('20260918173000', 'x'),
        sql: 'CREATE OR REPLACE FUNCTION public.fn_same(a uuid) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;',
      }],
      base: [{
        path: mig('20260919100000', 'later'),
        sql: 'CREATE OR REPLACE FUNCTION fn_same(a uuid) RETURNS void LANGUAGE sql AS $$ SELECT 2 $$;',
      }],
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('fn_same');
  });

  it('catches CREATE OR REPLACE TRIGGER too', () => {
    const r = run({
      added: [{
        path: mig('20260918173000', 'x'),
        sql: 'CREATE OR REPLACE TRIGGER trg_drive_status AFTER UPDATE ON public.cdc_drives FOR EACH ROW EXECUTE FUNCTION public.f();',
      }],
      base: [{
        path: mig('20260919100000', 'later'),
        sql: 'CREATE OR REPLACE TRIGGER trg_drive_status AFTER UPDATE ON public.cdc_drives FOR EACH ROW EXECUTE FUNCTION public.g();',
      }],
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('trg_drive_status');
  });

  it('compares versions as STRINGS — the short 8-digit form sorts after a 14-digit one', () => {
    // A numeric comparison reads 20270101 (20 million) as smaller than
    // 20261231090000 (20 trillion) and would hand out a false pass. `supabase db
    // push` applies files in lexicographic order, so string comparison is the
    // one that matches reality.
    const r = run({
      added: [{ path: mig('20261231090000', 'x'), sql: emitter() }],
      base: [{ path: mig('20270101', 'later_short_form'), sql: emitter() }],
    });
    expect(r.code).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The escape hatch. A deliberate revert is a decision somebody writes down.
// ---------------------------------------------------------------------------
describe('ci:allow-replace-newer', () => {
  it('passes when the migration declares the revert with a reason', () => {
    const r = run({
      added: [{
        path: mig('20260918173000', 'x'),
        sql: `-- ci:allow-replace-newer fn_cdc_emit_drive_notification reverting 20260919100000, it broke the bell
${emitter()}`,
      }],
      base: [{ path: mig('20260919100000', 'restore'), sql: emitter() }],
    });
    expect(r.code).toBe(0);
  });

  it('still FAILS when the allowance names a DIFFERENT function', () => {
    const r = run({
      added: [{
        path: mig('20260918173000', 'x'),
        sql: `-- ci:allow-replace-newer fn_something_else because reasons
${emitter()}`,
      }],
      base: [{ path: mig('20260919100000', 'restore'), sql: emitter() }],
    });
    expect(r.code).toBe(1);
  });

  it('still FAILS when the allowance carries no reason', () => {
    const r = run({
      added: [{
        path: mig('20260918173000', 'x'),
        sql: `-- ci:allow-replace-newer fn_cdc_emit_drive_notification
${emitter()}`,
      }],
      base: [{ path: mig('20260919100000', 'restore'), sql: emitter() }],
    });
    expect(r.code).toBe(1);
  });
});
