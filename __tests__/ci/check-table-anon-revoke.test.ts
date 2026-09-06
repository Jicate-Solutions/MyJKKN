/**
 * Regression tests for scripts/ci/check-table-anon-revoke.mjs.
 *
 * A security gate that is not itself tested is a gate that quietly stops gating.
 * These drive the real script as a subprocess (exactly how CI invokes it) against
 * fixtures written to a temp dir, and assert on the process exit code — the only
 * signal CI actually reads.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-table-anon-revoke.mjs');

let dir: string;

/** Run the gate over one fixture. Returns { code, out }. */
function runGate(sql: string, name = 'fixture.sql'): { code: number; out: string } {
  const file = path.join(dir, name);
  writeFileSync(file, sql, 'utf8');
  try {
    const out = execFileSync('node', [SCRIPT, '--verbose', '--files', file], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'table-anon-revoke-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('check-table-anon-revoke gate', () => {
  it('FAILS a new table with no anon revoke (the shape of every leaking migration)', () => {
    const { code, out } = runGate(`
      CREATE TABLE IF NOT EXISTS public.probe_leaky_table (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        institution_id uuid NOT NULL
      );
      ALTER TABLE public.probe_leaky_table ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON public.probe_leaky_table FOR SELECT USING (is_super_admin());
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_leaky_table');
  });

  it('FAILS when the only revoke is commented out (a dead comment must not satisfy a security gate)', () => {
    const { code, out } = runGate(`
      -- REVOKE ALL ON TABLE public.probe_commented FROM anon, PUBLIC;
      /* REVOKE ALL ON TABLE public.probe_commented FROM anon; */
      CREATE TABLE public.probe_commented (id uuid PRIMARY KEY);
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_commented');
  });

  it('FAILS when the file revokes anon on a FUNCTION but not on the table', () => {
    // The exact live shape of 20260726181500 / 20260803060000: function revokes
    // present, table revokes absent. A character-window regex scores this as
    // covered; per-statement matching does not.
    const { code, out } = runGate(`
      CREATE TABLE public.probe_fn_only (id uuid PRIMARY KEY);
      CREATE OR REPLACE FUNCTION public.fn_probe_fn_only() RETURNS int
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_fn_only() FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_fn_only() TO service_role;
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_fn_only');
  });

  it('PASSES a correctly locked table', () => {
    const { code } = runGate(`
      CREATE TABLE public.probe_ok (id uuid PRIMARY KEY);
      REVOKE ALL ON TABLE public.probe_ok FROM anon, PUBLIC;
      GRANT SELECT ON TABLE public.probe_ok TO authenticated;
      ALTER TABLE public.probe_ok ENABLE ROW LEVEL SECURITY;
    `);
    expect(code).toBe(0);
  });

  it('PASSES a CREATE TABLE AS (CTAS) that carries a revoke, and CATCHES one that does not', () => {
    expect(runGate(`
      CREATE TABLE public._bak_probe_20260726 AS SELECT 1 AS id;
      REVOKE ALL ON TABLE public._bak_probe_20260726 FROM anon, PUBLIC;
      ALTER TABLE public._bak_probe_20260726 ENABLE ROW LEVEL SECURITY;
    `, 'ctas-ok.sql').code).toBe(0);

    const bad = runGate(`
      CREATE TABLE public._bak_probe_bare_20260726 AS SELECT 1 AS id;
    `, 'ctas-bad.sql');
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('_bak_probe_bare_20260726');
  });

  it('PASSES an intentionally-public table locked by an explicit GRANT TO anon (newline before TO)', () => {
    const { code } = runGate(`
      -- unauthenticated admission landing page reads this
      CREATE TABLE public.probe_public_lookup (code text PRIMARY KEY);
      GRANT SELECT ON TABLE public.probe_public_lookup
         TO anon, authenticated;
    `);
    expect(code).toBe(0);
  });

  it('IGNORES temp tables and non-public schemas', () => {
    const { code, out } = runGate(`
      CREATE TEMP TABLE scratch_rows (id uuid);
      CREATE TEMPORARY TABLE scratch_rows_2 (id uuid);
      CREATE TABLE storage.probe_other_schema (id uuid);
    `);
    expect(code).toBe(0);
    expect(out).toContain('0 new table(s) checked');
  });

  it('does NOT invent a table from prose in a header comment', () => {
    // The real 20260726180000 header contains "created with plain CREATE TABLE AS";
    // a comment-blind scanner extracts a table literally named "AS" from it.
    const { code, out } = runGate(`
      -- Cause: leftovers created with plain CREATE TABLE AS. That inherits the
      -- Supabase default grant to anon and does NOT enable RLS.
      REVOKE ALL ON TABLE public.some_existing_table FROM anon, PUBLIC;
    `);
    expect(code).toBe(0);
    expect(out).toContain('0 new table(s) checked');
  });

  // --- phantom relations: text that creates nothing ---------------------------
  // Each of these EXITED 1 before the parser fix, demanding an anon REVOKE for a
  // relation the migration never creates. An unsatisfiable failure is worse than a
  // missing check, because the only way past it is the escape hatch — and a hatch
  // reached for by habit is a gate that has stopped gating. Measured receipt:
  // 20260808220000_autolock_new_public_relations.sql, the migration installing the
  // ddl_command_end event trigger that is the DATABASE half of this defence, had
  // to burn BOTH hatches on itself over a phantom table named `AS`.

  it('does NOT invent a table from a CREATE TABLE inside a string literal', () => {
    const { code, out } = runGate(`
      INSERT INTO public.doc_snippets (body)
      VALUES ('CREATE TABLE public.phantom_from_string (id uuid);');
    `, 'phantom-string.sql');
    expect(code).toBe(0);
    expect(out).toContain('0 new table(s)/view(s) checked');
  });

  it('does NOT invent a relation from a DDL command tag (`CREATE TABLE AS` -> table `AS`)', () => {
    // CREATE EVENT TRIGGER syntax forces these tags to be written as literals;
    // there is no other spelling. `AS` is a fully reserved word and can never be an
    // unquoted relation name, so a match landing there is not a relation at all.
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_autolock() RETURNS event_trigger
      LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN
        FOR r IN SELECT objid FROM pg_event_trigger_ddl_commands()
          WHERE schema_name = 'public'
            AND command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO',
                                'CREATE VIEW', 'CREATE MATERIALIZED VIEW')
        LOOP
          EXECUTE format('REVOKE ALL ON %s FROM anon, PUBLIC', r.object_identity);
        END LOOP;
      END $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_autolock() FROM anon, PUBLIC;
    `, 'phantom-command-tag.sql');
    expect(code).toBe(0);
    expect(out).toContain('0 new table(s)/view(s) checked');
  });

  it('reports a CREATE TABLE in a FUNCTION body as advisory, and does NOT fail the build', () => {
    // The migration defines a function; it creates nothing. A same-migration REVOKE
    // would name a relation that does not exist yet. Reported, because the relation
    // is real once the function runs — but not blocking, because the evidence does
    // not support blocking.
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_scratch() RETURNS void
      LANGUAGE plpgsql AS $fn$
      BEGIN
        CREATE TABLE public.probe_made_by_function (id uuid PRIMARY KEY);
      END;
      $fn$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_scratch() FROM anon, PUBLIC;
    `, 'deferred-advisory.sql');
    expect(code).toBe(0);
    expect(out).toContain('probe_made_by_function');
    expect(out).toContain('advisory, not blocking');
    // It must NOT be counted as created by this migration.
    expect(out).toContain('0 new table(s)/view(s) checked');
  });

  it('STILL FAILS a _bak_ relation created in a function body (no advisory downgrade)', () => {
    // Deferred is advisory for ordinary relations only. A function that copies
    // learner rows into a `_bak_` is the 2026-07-31 shape with one call in front of
    // it, and backup relations have no hatch anywhere in this guard.
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_backup() RETURNS void
      LANGUAGE plpgsql AS $fn$
      BEGIN
        CREATE TABLE public._bak_probe_deferred_20260802 AS
          SELECT id, full_name FROM public.learners_profiles;
      END;
      $fn$;
    `, 'deferred-backup.sql');
    expect(code).toBe(1);
    expect(out).toContain('_bak_probe_deferred_20260802');
    expect(out).toContain('BACKUP RELATION NOT LOCKED');
    expect(out).toContain('created inside a function body');
  });

  it('reads a quoted identifier as ONE whole name, not truncated at the first space', () => {
    // Old behaviour reported this as a relation called `Bak`, so a REVOKE naming a
    // DIFFERENT "Bak ..." relation satisfied it. The name in the failure message is
    // the thing a human acts on; a wrong name is worse than a missing check.
    const { code, out } = runGate(`
      CREATE TABLE public."Probe Quoted 20260802" (id uuid PRIMARY KEY);
    `, 'quoted-ident.sql');
    expect(code).toBe(1);
    expect(out).toContain('Probe Quoted 20260802');
  });

  it('honours the -- ci:allow-anon-table escape hatch', () => {
    // Both hatches, because they exempt different properties. A scratch table
    // dropped at the end of the migration wants neither an anon revoke nor a
    // policy; each exemption still has to be stated, and each carries its reason.
    const { code, out } = runGate(`
      -- ci:allow-anon-table scratch table dropped at the end of this migration
      -- ci:allow-no-rls scratch table dropped at the end of this migration
      CREATE TABLE public.probe_escape_hatch (id uuid PRIMARY KEY);
    `);
    expect(code).toBe(0);
    expect(out).toContain('ci:allow-anon-table');
  });

  it('accepts a blanket REVOKE ... ON ALL TABLES IN SCHEMA public FROM anon', () => {
    const { code } = runGate(`
      CREATE TABLE public.probe_blanket_a (id uuid PRIMARY KEY);
      CREATE TABLE public.probe_blanket_b (id uuid PRIMARY KEY);
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
      ALTER TABLE public.probe_blanket_a ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.probe_blanket_b ENABLE ROW LEVEL SECURITY;
    `);
    expect(code).toBe(0);
  });

  // --- views / materialised views -------------------------------------------
  // Supabase's default privileges reach a view exactly as they reach a table, and
  // a view is the sharper hazard: unless it is declared security_invoker, it runs
  // as its OWNER, so it can republish a correctly locked table to anon.

  it('CATCHES a new VIEW with no anon revoke', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE VIEW public.probe_leaky_view AS
        SELECT id, full_name FROM public.learners_profiles;
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_leaky_view');
    expect(out).toContain('view');
  });

  it('CATCHES a new MATERIALIZED VIEW with no anon revoke', () => {
    const { code, out } = runGate(`
      CREATE MATERIALIZED VIEW public.probe_leaky_matview AS
        SELECT institution_id, count(*) AS n FROM public.learners_profiles GROUP BY 1;
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_leaky_matview');
    expect(out).toContain('materialized view');
  });

  it('PASSES a view that carries the revoke', () => {
    const { code } = runGate(`
      CREATE VIEW public.probe_ok_view AS SELECT 1 AS id;
      REVOKE ALL ON TABLE public.probe_ok_view FROM anon, PUBLIC;
      GRANT SELECT ON TABLE public.probe_ok_view TO authenticated;
    `);
    expect(code).toBe(0);
  });

  it('does NOT demand RLS of a view (a view cannot carry a policy at all)', () => {
    // Guarding against the unsatisfiable-gate failure mode: if views were fed to
    // the RLS check they could never pass, and every view PR would be blocked.
    const { code, out } = runGate(`
      CREATE VIEW public.probe_view_no_rls AS SELECT 1 AS id;
      REVOKE ALL ON TABLE public.probe_view_no_rls FROM anon, PUBLIC;
    `);
    expect(code).toBe(0);
    expect(out).toContain('0 new table(s) checked');
  });

  it('IGNORES temp views and non-public schemas', () => {
    const { code } = runGate(`
      CREATE TEMP VIEW scratch_view AS SELECT 1 AS id;
      CREATE VIEW storage.probe_other_schema_view AS SELECT 1 AS id;
    `);
    expect(code).toBe(0);
  });

  // --- RLS enabled -----------------------------------------------------------

  it('CATCHES a table that revokes anon but never enables RLS', () => {
    // The exact fixture the brief names: anon is locked out, but every signed-in
    // role still reads every institution's rows because no policy boundary exists.
    const { code, out } = runGate(`
      CREATE TABLE public.probe_no_rls (id uuid PRIMARY KEY, institution_id uuid);
      REVOKE ALL ON TABLE public.probe_no_rls FROM anon, PUBLIC;
      GRANT SELECT ON TABLE public.probe_no_rls TO authenticated;
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_no_rls');
    expect(out).toContain('row level security');
  });

  it('does NOT accept FORCE ROW LEVEL SECURITY as a substitute for ENABLE', () => {
    // FORCE without ENABLE switches nothing on; accepting it would be accepting
    // a no-op as a defence.
    const { code, out } = runGate(`
      CREATE TABLE public.probe_force_only (id uuid PRIMARY KEY);
      REVOKE ALL ON TABLE public.probe_force_only FROM anon, PUBLIC;
      ALTER TABLE public.probe_force_only FORCE ROW LEVEL SECURITY;
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_force_only');
  });

  it('honours the -- ci:allow-no-rls escape hatch independently of the anon hatch', () => {
    const { code } = runGate(`
      -- ci:allow-no-rls reference lookup, no tenant column to scope by
      CREATE TABLE public.probe_rls_hatch (id uuid PRIMARY KEY);
      REVOKE ALL ON TABLE public.probe_rls_hatch FROM anon, PUBLIC;
    `);
    expect(code).toBe(0);
  });

  it('exempts a documented-public table from the RLS requirement', () => {
    // An explicit GRANT ... TO anon IS the audited "this is public on purpose"
    // signal; demanding a policy on top would break that blessed pattern.
    const { code } = runGate(`
      -- unauthenticated admission landing page reads this
      CREATE TABLE public.probe_public_no_rls (code text PRIMARY KEY);
      GRANT SELECT ON TABLE public.probe_public_no_rls TO anon, authenticated;
    `);
    expect(code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Backup / rollback relations — the rule with no escape hatch.
//
// Each of the three shapes below EXITED 0 before this rule existed, measured on
// 2026-08-01 against the guard as it then stood. Two of them did worse than miss:
// they printed "✓ ... 1 locked" over a relation carrying a live GRANT TO anon.
// That is the 2026-07-31 shape, where one `_bak_learner_section_repair_20260731`
// table published 179 learners' identities to the public anon key.
// ---------------------------------------------------------------------------

describe('check-table-anon-revoke gate — backup relations have no exemption', () => {
  it('FAILS a _bak_ CTAS with no revoke and no RLS (the 2026-07-31 shape)', () => {
    // CREATE TABLE AS never enables RLS, so this is how a repair backup is
    // actually born. Both dimensions must fire, and the exit code must be 1.
    //
    // Honest scope: this shape was ALREADY red before the backup rule existed —
    // the generic rules catch it, and a mutation run against the pre-change guard
    // confirms it exited 1 there too. It is kept as a REGRESSION pin: the backup
    // path now owns this relation's verdict, so a refactor of that path could
    // silently take it over and lose the failure. It is not evidence of new
    // coverage; the hatched and granted fixtures below are.
    const { code, out } = runGate(`
      CREATE TABLE public._bak_learner_section_repair_20260731 AS
        SELECT id, full_name FROM public.learners_profiles;
    `, 'bak-bare.sql');
    expect(code).toBe(1);
    expect(out).toContain('BACKUP RELATION NOT LOCKED');
    expect(out).toContain('_bak_learner_section_repair_20260731');
    expect(out).toContain('no anon revoke');
    expect(out).toContain('no ENABLE ROW LEVEL SECURITY');
  });

  it('FAILS a _bak_ table even when the file carries BOTH escape-hatch markers', () => {
    // Measured pre-change: exited 0 and reported "0 new table(s)/view(s) checked"
    // — the guard did not merely pass it, it never looked at it. The hatch is a
    // whole-FILE marker, so one legitimate scratch table in a repair migration
    // silently exempted every backup relation beside it.
    const { code, out } = runGate(`
      -- ci:allow-anon-table live repair backup, dropped next week
      -- ci:allow-no-rls live repair backup, dropped next week
      CREATE TABLE public._bak_learner_repair_20260731 AS
        SELECT id, full_name FROM public.learners_profiles;
    `, 'bak-hatched.sql');
    expect(code).toBe(1);
    expect(out).toContain('_bak_learner_repair_20260731');
    expect(out).toContain('ci:allow-anon-table does NOT cover a backup relation');
    expect(out).toContain('ci:allow-no-rls does NOT cover a backup relation');
    // It must actually inspect the relation, not skip the file.
    expect(out).not.toContain('0 new table(s)/view(s) checked');
  });

  it('FAILS a _bak_ table published by GRANT ... TO anon (was scored as LOCKED)', () => {
    // The sharpest regression. Criterion (b) — "public on purpose" — used to
    // accept this AND exempt it from the RLS check, so a table granted to the
    // public anon key reported clean on both dimensions.
    const { code, out } = runGate(`
      CREATE TABLE public._bak_hostel_allocations_20260731 AS
        SELECT id, student_id FROM public.hostel_allocations;
      GRANT SELECT ON TABLE public._bak_hostel_allocations_20260731 TO anon;
    `, 'bak-granted.sql');
    expect(code).toBe(1);
    expect(out).toContain('_bak_hostel_allocations_20260731');
    expect(out).toContain('BACKUP RELATION NOT LOCKED');
    // Assert the COUNTER, not the absence of a phrase: the summary must score the
    // relation as inspected-and-not-locked. (A first pass asserted
    // `not.toContain('1 locked')` and failed — the guard's own explanatory text
    // quotes that phrase when describing the old behaviour, so the assertion was
    // matching prose rather than the verdict.)
    expect(out).toContain('1 new table(s)/view(s) checked, 0 locked');
  });

  it('PASSES a _bak_ table that carries the revoke AND enables RLS', () => {
    // The satisfiable path — proving the rule is a gate, not a wall.
    const { code, out } = runGate(`
      CREATE TABLE public._bak_learner_section_repair_20260801 AS
        SELECT id, full_name FROM public.learners_profiles;
      REVOKE ALL ON TABLE public._bak_learner_section_repair_20260801 FROM anon, PUBLIC;
      GRANT SELECT ON TABLE public._bak_learner_section_repair_20260801 TO service_role;
      ALTER TABLE public._bak_learner_section_repair_20260801 ENABLE ROW LEVEL SECURITY;
    `, 'bak-ok.sql');
    expect(code).toBe(0);
    expect(out).toContain('backup relation');
  });

  it('accepts a blanket REVOKE ON ALL TABLES for a backup table (a real revoke, not an exemption)', () => {
    const { code } = runGate(`
      CREATE TABLE public._bak_fee_repair_20260801 AS SELECT 1 AS id;
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
      ALTER TABLE public._bak_fee_repair_20260801 ENABLE ROW LEVEL SECURITY;
    `, 'bak-blanket.sql');
    expect(code).toBe(0);
  });

  it('FAILS a _rollback_ VIEW with no revoke, but does NOT demand RLS of it', () => {
    // A view cannot carry a policy at all, so demanding RLS would be an
    // unsatisfiable gate. The anon revoke is the real exposure path for a view
    // anyway: unless it is security_invoker it runs as its OWNER, so it can
    // republish a correctly locked table straight to anon.
    const { code, out } = runGate(`
      CREATE VIEW public._rollback_learner_snapshot AS
        SELECT id, full_name FROM public.learners_profiles;
      GRANT SELECT ON TABLE public._rollback_learner_snapshot TO anon;
    `, 'rollback-view.sql');
    expect(code).toBe(1);
    expect(out).toContain('_rollback_learner_snapshot');
    expect(out).toContain('[view] no anon revoke');
    expect(out).toContain('0 new table(s) checked');   // RLS dimension: not demanded
  });

  it('covers the *_backup_<date> naming too, not only the _bak_ house convention', () => {
    // Calibrated against the four real ones the `bak` pattern alone misses:
    // hr_leave_applications_backup_20260728, ims_rls_policy_backup_20260728,
    // student_attendance_backup_20250109, _staff_scope_lockdown_backup_20260511.
    //
    // BOTH hatch markers are present on purpose. With only one, the file goes red
    // on the OTHER dimension and the test passes without ever exercising the
    // backup rule — a mutation run against the pre-change guard caught exactly
    // that, so this fixture is written to be green on main and red only here.
    const { code, out } = runGate(`
      -- ci:allow-anon-table repair leftover
      -- ci:allow-no-rls repair leftover
      CREATE TABLE public.hr_leave_applications_backup_20260801 AS
        SELECT * FROM public.hr_leave_applications;
    `, 'suffix-backup.sql');
    expect(code).toBe(1);
    expect(out).toContain('hr_leave_applications_backup_20260801');
    expect(out).toContain('BACKUP RELATION NOT LOCKED');
  });

  it('FAILS a _bak_ CTAS created inside a DO block (dollar-quoted, but it RUNS)', () => {
    // The regression that guards the phantom fix from overshooting. A DO body is
    // dollar-quoted, so a parser that killed the phantoms by skipping dollar-quotes
    // wholesale would go silent here — on a CTAS copy of learner rows, which is the
    // 2026-07-31 shape exactly. Quoting is not the question; execution is.
    const { code, out } = runGate(`
      DO $$
      BEGIN
        CREATE TABLE public._bak_do_block_20260802 AS
          SELECT id, full_name FROM public.learners_profiles;
      END $$;
    `, 'bak-do-block.sql');
    expect(code).toBe(1);
    expect(out).toContain('_bak_do_block_20260802');
    expect(out).toContain('BACKUP RELATION NOT LOCKED');
  });

  it('PASSES a _bak_ CTAS in a DO block that revokes anon INSIDE the same block', () => {
    // Backup relations have no escape hatch, so if an in-block REVOKE could not be
    // seen the gate would be a wall with no way through rather than a gate.
    const { code } = runGate(`
      DO $$
      BEGIN
        CREATE TABLE public._bak_do_locked_20260802 AS SELECT 1 AS id;
        REVOKE ALL ON TABLE public._bak_do_locked_20260802 FROM anon, PUBLIC;
        ALTER TABLE public._bak_do_locked_20260802 ENABLE ROW LEVEL SECURITY;
      END $$;
    `, 'bak-do-locked.sql');
    expect(code).toBe(0);
  });

  it('does NOT fire on legitimate feature tables that merely sound like backups', () => {
    // The false-positive guard. `snapshot` is a real domain word here
    // (accreditation_iiqa_snapshots, cdc_placement_snapshots,
    // hostel_occupancy_snapshots …) and is deliberately NOT in the pattern; if it
    // were, real feature work would hit a gate with no hatch and the gate would
    // get disabled. Segment matching is also why `bakery_orders` is safe.
    const { code } = runGate(`
      -- ci:allow-anon-table ordinary feature table, hatch still available
      -- ci:allow-no-rls ordinary feature table, hatch still available
      CREATE TABLE public.hostel_occupancy_snapshots (id uuid PRIMARY KEY);
      CREATE TABLE public.cdc_placement_snapshots (id uuid PRIMARY KEY);
      CREATE TABLE public.bakery_orders (id uuid PRIMARY KEY);
    `, 'no-false-positive.sql');
    expect(code).toBe(0);
  });
});
