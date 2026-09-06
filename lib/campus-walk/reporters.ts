// lib/campus-walk/reporters.ts
// ============================================================================
// Campus Walk — WHO IS PERMITTED. One resolver, five call sites.
//
// Spec: specs/campus-walk-2026-08-17.md (D2 "Director only for v1 — prove
// routing before opening up").
//
// ── WHAT CHANGED AND WHAT DID NOT ───────────────────────────────────────────
// D2 is unchanged: exactly one person may file, repeat, and approve. What
// changed is where that sentence is written down. It used to be five copies of
//     email === DIRECTOR_EMAIL
// spread across two pages and three routes, each importing the hardcoded
// address from lib/auth/preview-session.ts. Three things followed from that:
//   1. no seeded test.* account could ever reach these screens, so the happy
//      path was untestable by the standard harness BY CONSTRUCTION;
//   2. handing capture to somebody while the Director travels was a code
//      change and a release;
//   3. if his address ever changed, the feature broke and needed a developer.
// The rule is now a configuration row. The behaviour it expresses today is
// identical.
//
// ── THE MECHANISM IS THE ONE THIS REPO ALREADY HAS ──────────────────────────
// platform_policies + the fn_get_policy SECURITY DEFINER resolver
// (supabase/migrations/20260429000002_platform_policies_substrate.sql, resolver
// last redefined by 20260731180000_platform_policies_cohort_scope.sql). No new
// table, no bespoke settings file, no env var. The closest existing precedent
// is lib/learners-council/broadcast-server.ts, which stores an approver's
// identity on exactly this substrate and reads it with exactly this RPC.
//
// The row is admin-editable without a deploy: platform_policies_update is
// `is_super_admin() OR is_admin()`. It is seeded global, and fn_get_policy
// resolves user > cohort > institution > role > global, so a narrower row can
// be added later without touching this file.
//
// Called with the SESSION client, not the service-role client, matching
// lib/policies/get-policy.ts. fn_get_policy is granted to `authenticated` and
// REVOKED from `anon` (20260731180000), and every call site here has already
// established a signed-in user before asking — an anonymous caller is refused
// before this module is reached.
//
// ── FAIL SAFE, NEVER FAIL OPEN ──────────────────────────────────────────────
// Missing row, unreadable row, wrong JSON shape, or a list that normalises to
// nothing all resolve to the hardcoded Director address — never to "everyone".
// That direction is not a style preference. project_* RLS is
// `auth.uid() IS NOT NULL` for read AND write
// (20260528000000_pm_projects_foundation.sql:842, 847-848), so the database
// enforces NOTHING here; this comparison is the entire boundary. A
// misconfiguration that opened it would let any authenticated user file
// tickets and approve their own closures.
//
// Note the one failure that is NOT covered, deliberately: a list that is
// non-empty but wrong (say `["*"]`, which matches no real address) locks
// everybody out, including the Director. That fails CLOSED, which is the safe
// direction, and an admin can correct the row. Silently union-ing the Director
// back in would make the setting unable to express "capture has moved to
// somebody else", which is one of the two reasons it exists.
//
// ── THE ONLY PLACE DIRECTOR_EMAIL BELONGS ───────────────────────────────────
// This module is the sole importer of DIRECTOR_EMAIL in the campus-walk lane.
// Re-introducing it at a call site would re-create the drift this file removes.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { DIRECTOR_EMAIL } from '@/lib/auth/preview-session';

/**
 * The policy row. Seeded global by
 * supabase/migrations/20260909200000_campus_walk_reporters_policy.sql.
 *
 * Passed to fn_get_policy as a literal rather than through POLICY_KEYS /
 * getPolicyArray, matching lib/learners-council/broadcast-server.ts:112 and
 * lib/social/governance/config-reader.ts. Adding it to lib/policies/keys.ts is
 * a worthwhile tidy-up, but that file is shared with concurrent work and a
 * literal key is what several existing readers already do.
 */
export const CAMPUS_WALK_REPORTERS_POLICY_KEY = 'campus_walk.reporters.allowed_emails';

/** Where the gate lands when the setting cannot be trusted. Exactly one person. */
const FALLBACK_REPORTERS: readonly string[] = [DIRECTOR_EMAIL.toLowerCase()];

/**
 * JSONB in, clean lowercase address list out.
 *
 * Accepts an array of strings (the seeded shape) and also a bare string, since
 * a textarea widget makes `"someone@jkkn.ac.in"` an entirely plausible thing
 * for an admin to save. Anything else — a number, an object, a nested array —
 * contributes nothing and drops the result toward the empty list, which the
 * caller then treats as "not configured" and answers with the fallback.
 */
function normaliseReporterEmails(raw: unknown): string[] {
  const entries: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const emails: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const email = entry.trim().toLowerCase();
    if (!email) continue;
    if (!emails.includes(email)) emails.push(email);
  }
  return emails;
}

/**
 * Everyone permitted to use the campus walk lane right now.
 *
 * Never returns an empty array: an empty answer would read as "no one", and the
 * three unreadable/absent/empty cases are all indistinguishable from a
 * half-finished configuration. All of them yield the Director alone.
 */
export async function getCampusWalkReporters(): Promise<string[]> {
  let raw: unknown;
  try {
    const supabase = await createClient();
    // p_scope_id named explicitly (rather than defaulted) to keep PostgREST's
    // overload resolution unambiguous — same call shape already proven in
    // production by lib/policies/get-policy.ts and broadcast-server.ts.
    const { data, error } = await supabase.rpc('fn_get_policy', {
      p_key: CAMPUS_WALK_REPORTERS_POLICY_KEY,
      p_scope_id: null,
    });
    if (error) {
      console.error(
        '[campus-walk/reporters] policy read failed, falling back to the Director:',
        error.message
      );
      return [...FALLBACK_REPORTERS];
    }
    raw = data;
  } catch (err) {
    console.error(
      '[campus-walk/reporters] policy read threw, falling back to the Director:',
      err
    );
    return [...FALLBACK_REPORTERS];
  }

  const configured = normaliseReporterEmails(raw);
  return configured.length > 0 ? configured : [...FALLBACK_REPORTERS];
}

/**
 * The gate. Case-insensitive, as every call site already was.
 *
 * A blank or absent address is refused without a lookup — an account with no
 * email can never be on an allowlist of emails.
 */
export async function isCampusWalkReporter(email: string | null | undefined): Promise<boolean> {
  const candidate = (email ?? '').trim().toLowerCase();
  if (!candidate) return false;
  const permitted = await getCampusWalkReporters();
  return permitted.includes(candidate);
}
