// ============================================================================
// DEFECT C1 — the merge-order landmine, as a test.
//
// WHAT HAPPENED
//   supabase/migrations/20260811110000_director_handover_capture.sql carried a
//   CREATE OR REPLACE of fn_director_handover_create, copied from the spine
//   BEFORE the spine's review fixes landed (spine head b791fc4, 35 seconds
//   later). The copy was missing the whole multi-tenant block: no v_is_super,
//   no v_grantee_inst, no "You can only hand work to someone at your own
//   institution", no array_agg(DISTINCT btrim(k)) normalisation — and it
//   recorded the GRANTEE's institution on the row instead of the granter's.
//
//   Because 110000 > 100200, the copy WON on a fresh ordered apply. Because the
//   two bodies live in different files, git reported no conflict. Nothing in
//   review, in CI, or in the diff said a word.
//
// PROVEN, NOT ASSUMED (Postgres 16.14, 2026-08-05, real migrations, stubbed
// platform substrate only):
//   spine alone          -> REFUSED (42501) "You can only hand work to someone
//                           at your own institution"; grantee at College B ends
//                           with user_has_permission() = false.
//   spine + round-1 file -> row CREATED, institution_id recorded = College B's,
//                           and user_has_permission() = TRUE for a clerk at a
//                           college the granting Director has no relationship
//                           with. No super admin involved.
//   spine + fixed file   -> REFUSED again, same-college control still works.
//
// WHAT THIS TEST LOCKS
//   The rule that makes the reversion impossible rather than merely absent
//   today: no migration ABOVE the spine's own version may re-issue CREATE OR
//   REPLACE on a director-desk security function. Postgres cannot amend a body
//   in place, so "replace wholesale and keep them in step" is a promise review
//   cannot verify and merge order silently breaks. Change the function where it
//   is defined.
//
//   Assertion 3 is the one that survives the merge: once PR #2827 lands, the
//   spine's file is in this tree and the "winning definition still carries the
//   guard" check becomes a live simulation of the full ordered apply.
// ============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

/** The spine owns these. A later migration may CALL them; it may not replace them. */
const DIRECTOR_DESK_SECURITY_FUNCTIONS = [
  'fn_director_handover_create',
  'fn_can_hand_over',
  'fn_handover_key_is_blocked',
  'fn_handover_key_allowed_at_level',
  'fn_handover_grants_key',
  // Added 2026-08-06. Both sit on the same landmine path as the five above and
  // were missed by the original list:
  //   user_has_permission        — 4,093 call sites; the spine CREATE OR
  //                                REPLACEs it, so a later migration reverting
  //                                it silently takes handovers off every RLS
  //                                policy on the platform at once.
  //   fn_my_handover_permissions — feeds the CLIENT page gates. Reverting it
  //                                leaves the data readable and every page gate
  //                                shut: the exact four-layers defect this
  //                                feature exists to remove.
  'user_has_permission',
  'fn_my_handover_permissions',
];

/**
 * Redefinitions that HAVE been reviewed, keyed by migration version.
 *
 * Without this, the rule below is unshippable: the first legitimate bug-fix to
 * any protected function fails its own guard, and the pressure is then to delete
 * the guard rather than the bug. The registry keeps the friction where it
 * belongs — a redefinition is allowed only when somebody wrote down which
 * function and why, which is exactly the step PR #2840 skipped when it silently
 * reverted the cross-tenant guard.
 */
const APPROVED_REDEFINITIONS: Record<string, { fns: string[]; why: string }> = {
  '20260813020000': {
    fns: ['fn_handover_grants_key', 'fn_my_handover_permissions'],
    why: 'Removes the `institution_id IS NULL OR` short-circuit so a NULL institution means no-match rather than skip-the-test. Bodies machine-extracted from production via pg_get_functiondef; the only textual change is the deleted clause.',
  },
  '20260813030000': {
    fns: ['fn_handover_people_search'],
    why: 'Casts i.name::text — institutions.name is varchar(255) against a declared text OUT column, which raised 42804 and made the people picker return nothing. Found by the Director on production, not by CI.',
  },
  '20260820100000': {
    fns: ['fn_director_handover_create'],
    why: "Scopes a super admin's handover to the RECEIVER's institution instead of the granter's. Create exempted super admins from the same-institution check but still stamped the granter's institution on the row; fn_handover_grants_key then required the two to match, which can never hold across colleges — so the row was born unusable and the receiver was told their access level was wrong. Measured live 2026-08-11: 3 of 3 handovers dead this way. Body machine-extracted from production via pg_get_functiondef; the only change is the v_inst assignment. The ordinary-director branch is untouched and still raises 42501.",
  },
  '20260820110000': {
    fns: ['fn_handover_grants_key', 'fn_my_handover_permissions'],
    why: "Director decision 2 (2026-08-11): the due date stops ending access. Both access predicates carried `AND dh.due_date >= today`, so a deadline passing at midnight locked somebody out of a job they had accepted and were halfway through, and they had to come back and ask for it again. Access now ends only on a real ending — done, declined, revoked, handed back, or the grantee's profile going inactive — while the date colours the desk and drives the chase. Bodies machine-extracted from production via pg_get_functiondef and edited programmatically; the only change is the deleted clause.",
  },
  '20260927020000': {
    fns: ['user_has_permission'],
    why: "Adds an is_active = false OR is_login_disabled = true -> RETURN false guard to BOTH overloads, evaluated after the super-admin short-circuit and before the role checks, so a deactivated or login-disabled account holds no custom-role permissions (defense-in-depth behind the login block in app/auth/callback). NOT a revert of 20260811100100: the (text) form keeps that migration's Director-handover last resort verbatim -- the legacy fallback stays an IF and the body still ends in fn_handover_grants_key(auth.uid(), permission_name) -- and the (uuid, text) form keeps its own fn_handover_grants_key call. Verified by diffing both bodies against 20260811100100: the is_active guard is the only addition. Grants unchanged from the posture 20260811100100 asserts at apply time: (text) to authenticated + service_role, (uuid, text) to service_role only.",
  },
};

/** Version of the spine migration that defines them (specs/director-desk/SPEC.md). */
const SPINE_RPCS_VERSION = '20260811100200';

/** This PR's own migration, and the only function it is allowed to create. */
const THIS_PR_MIGRATION = '20260811110000_director_handover_capture.sql';
const THIS_PR_ALLOWED_FUNCTIONS = ['fn_handover_people_search'];

interface MigrationFile {
  name: string;
  version: string;
  sql: string;
}

function loadMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((name) => ({
      name,
      version: name.slice(0, 14),
      sql: readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Does this SQL actually CREATE/REPLACE the named function, as opposed to
 * merely mentioning it in a comment, a COMMENT ON, a GRANT or a call?
 *
 * Comments are stripped first, which is load-bearing here: the fixed 110000
 * file explains the defect at length and names fn_director_handover_create
 * eight times in prose. A grep-based test would fail on its own explanation.
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

function definesFunction(sql: string, fn: string): boolean {
  const clean = stripSqlComments(sql);
  const re = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(`,
    'i'
  );
  return re.test(clean);
}

describe('director-desk migrations — merge order cannot revert a security fix', () => {
  const migrations = loadMigrations();

  it('finds this PR’s migration in the tree (guards against a vacuous pass)', () => {
    expect(migrations.map((m) => m.name)).toContain(THIS_PR_MIGRATION);
  });

  // ---- Assertion 1: the exact defect. Fails on the pre-fix file. ------------
  it('this PR’s migration does not redefine fn_director_handover_create', () => {
    const file = migrations.find((m) => m.name === THIS_PR_MIGRATION);
    expect(file).toBeDefined();
    expect(definesFunction(file!.sql, 'fn_director_handover_create')).toBe(false);
  });

  // ---- Assertion 2: it creates only what it is meant to create. -------------
  it('this PR’s migration creates exactly fn_handover_people_search and nothing else', () => {
    const file = migrations.find((m) => m.name === THIS_PR_MIGRATION)!;
    const created = [
      ...stripSqlComments(file.sql).matchAll(
        /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi
      ),
    ].map((m) => m[1]);
    expect([...new Set(created)].sort()).toEqual([...THIS_PR_ALLOWED_FUNCTIONS].sort());
  });

  // ---- Assertion 3: the general rule, and the ordered-apply simulation. -----
  it.each(DIRECTOR_DESK_SECURITY_FUNCTIONS)(
    'no migration after the spine redefines %s',
    (fn) => {
      const offenders = migrations
        .filter((m) => m.version > SPINE_RPCS_VERSION)
        .filter((m) => definesFunction(m.sql, fn))
        // An entry in APPROVED_REDEFINITIONS is a reviewed, reasoned exception.
        // Anything else is the accidental case this rule exists to catch.
        .filter((m) => !(APPROVED_REDEFINITIONS[m.version]?.fns ?? []).includes(fn))
        .map((m) => m.name);
      expect(offenders).toEqual([]);
    }
  );

  it('every approved redefinition names a real migration, a real function, and a reason', () => {
    // Stops the registry rotting into a blanket mute: an entry that no longer
    // matches a migration, or carries no reason, fails here rather than
    // silently widening what the rule above permits.
    for (const [version, entry] of Object.entries(APPROVED_REDEFINITIONS)) {
      const m = migrations.find((x) => x.version === version);
      expect(m, `approved redefinition ${version} has no matching migration`).toBeDefined();
      expect(entry.why.length, `${version} needs a reason`).toBeGreaterThan(40);
      for (const fn of entry.fns) {
        expect(
          definesFunction(m!.sql, fn),
          `${version} claims to redefine ${fn} but does not`
        ).toBe(true);
      }
    }
  });

  it('the definition that WINS a full ordered apply still carries the cross-tenant guard', () => {
    // Simulates the apply: migrations run in version order, so the last file to
    // define the function is the body production ends up with. Vacuous while the
    // spine (PR #2827) is on its own branch — assertion 3 is what holds the line
    // until then, and this becomes live the moment the two merge.
    const definers = migrations.filter((m) =>
      definesFunction(m.sql, 'fn_director_handover_create')
    );
    if (definers.length === 0) {
      expect(
        migrations.some((m) => m.version > SPINE_RPCS_VERSION && definesFunction(m.sql, 'fn_director_handover_create'))
      ).toBe(false);
      return;
    }
    const winner = definers[definers.length - 1];
    const body = stripSqlComments(winner.sql);
    // The four things the round-1 copy was missing, each named individually so a
    // failure says WHICH half of the guard went.
    expect(body, `${winner.name}: super-admin exemption flag`).toContain('v_is_super');
    expect(body, `${winner.name}: grantee institution lookup`).toContain('v_grantee_inst');
    expect(body, `${winner.name}: NULL-safe institution comparison`).toMatch(
      /IS\s+DISTINCT\s+FROM/i
    );
    expect(body, `${winner.name}: the refusal itself`).toContain(
      'You can only hand work to someone at your own institution'
    );
    expect(body, `${winner.name}: key normalisation before the walls`).toMatch(
      /array_agg\s*\(\s*DISTINCT\s+btrim\s*\(/i
    );
  });
});
