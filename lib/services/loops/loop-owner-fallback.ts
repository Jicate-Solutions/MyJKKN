// ============================================================================
// Loop owner fallback — the TypeScript twin of fn_loop_owner_for_institution
// ============================================================================
// Created: 2026-09-13 (Director decisions: scoped Principals receive their
// college's attendance-intervention alerts; every college without a scope
// row falls back to loop_registry.owner_email — and that fallback must be
// VISIBLE, not silent).
//
// The database function (20261210020000) answers "who owns loop X at college
// Y?" for the notification route, one institution at a time. The two
// surfaces that must SHOW the fallback — the Owners & verdicts panel and the
// weekly loops-regress summary — already hold the scope rows and the
// institution list in memory, so they answer the set question here instead
// of round-tripping once per college. Same rule, pure functions, unit-tested:
// a scoped owner wins; a missing or blank scope falls back to the registry
// owner; a loop with no registry owner resolves to nobody.
// ============================================================================

/** The subset of a loop_owner_scopes row these helpers read. */
export interface LoopOwnerScope {
  loop_key: string;
  institution_id: string;
  owner_email: string | null | undefined;
}

/** The subset of an institutions row these helpers read. */
export interface LoopOwnerInstitution {
  id: string;
  name: string;
  /**
   * institutions.entity_type (NOT NULL in the table). Only colleges and
   * schools count as "falling back" — the estate also holds `company` and
   * `admin_office` rows (a vendor, an incubation forum, the back office) that
   * have no learners and would otherwise be the ONLY names on the fallback
   * line.
   */
  entity_type: string;
}

/** institutions.entity_type values that hold learners — the loop's colleges. */
export const LOOP_OWNER_ENTITY_TYPES: ReadonlySet<string> = new Set(['institution', 'school']);

/** True when the row is a college or a school. */
export function isLoopOwnerCollege(i: LoopOwnerInstitution): boolean {
  return LOOP_OWNER_ENTITY_TYPES.has(i.entity_type);
}

/** Mirror of the SQL NULLIF(btrim(...)): blank and whitespace are "absent". */
function present(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/**
 * One institution's owner: the scoped email when present, else the registry
 * owner, else null. Identical to fn_loop_owner_for_institution's COALESCE.
 */
export function resolveLoopOwnerEmail(
  scopedOwnerEmail: string | null | undefined,
  registryOwnerEmail: string | null | undefined
): string | null {
  return present(scopedOwnerEmail) ?? present(registryOwnerEmail);
}

/**
 * The institutions that currently fall back to the registry owner for one
 * loop: every college/school in `institutions` (see isLoopOwnerCollege) with
 * no scope row for `loopKey`, or whose scope row carries a blank email.
 * Order is preserved from `institutions` (the callers pass a name-sorted
 * list).
 */
export function institutionsFallingBack(
  loopKey: string,
  scopes: readonly LoopOwnerScope[],
  institutions: readonly LoopOwnerInstitution[]
): LoopOwnerInstitution[] {
  const scoped = new Set<string>();
  for (const s of scopes) {
    if (s.loop_key === loopKey && present(s.owner_email) !== null) {
      scoped.add(s.institution_id);
    }
  }
  return institutions.filter((i) => isLoopOwnerCollege(i) && !scoped.has(i.id));
}

/**
 * The one line the weekly summary and the panel carry:
 * "3 colleges fall back to director@jkkn.ac.in". Singular at one; when the
 * loop has no registry owner the line says so instead of naming nobody.
 */
export function fallbackSummaryLine(
  count: number,
  registryOwnerEmail: string | null | undefined
): string {
  const noun = count === 1 ? 'college falls' : 'colleges fall';
  const owner = present(registryOwnerEmail);
  return owner
    ? `${count} ${noun} back to ${owner}`
    : `${count} ${noun} back to nobody — the loop has no registry owner`;
}

// ── Per-scope owner status (fix round 2, 2026-09-13) ─────────────────────────
// A scope row names an address; whether an alert can REACH that address is a
// separate question the notification route answers per college. The panel
// must answer it too, beside the row, so a Principal whose account is missing
// or cannot open the rows is not a silent miss in a cron response nobody
// reads. Same rule in both places, pure and unit-tested here; the callers do
// the profile read (service role) and hand the candidates in.

/** Roles the learner_risk_assessments row policy admits institution-wide. */
export const LOOP_OWNER_READ_ROLES: ReadonlySet<string> = new Set(['principal', 'admin']);

/**
 * Escape LIKE/ILIKE metacharacters so a PostgREST `ilike` pattern matches the
 * value literally. Postgres' default escape character is the backslash.
 * PostgREST also rewrites a bare `*` to `%` before Postgres sees it, so `*`
 * is escaped too: `\*` reaches Postgres as `\%` (a literal percent), which no
 * real address contains — an owner email carrying `*` therefore matches
 * nobody instead of everybody.
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_*]/g, '\\$&');
}

/** The subset of a profiles row the status rule reads. */
export interface LoopOwnerProfileCandidate {
  id: string;
  role: string | null;
  institution_id: string | null;
  is_super_admin: boolean | null;
}

/**
 * Why an owner address cannot be notified — or `ok` when it can.
 *   owner_no_profile   no active, non-pre-registered profile carries the email
 *   owner_ambiguous    more than one does — none is picked, nothing is sent
 *   owner_cannot_read  one profile, but the learner_risk_assessments row
 *                      policy would not let it open the college's rows
 */
export type LoopOwnerStatus = 'ok' | 'owner_no_profile' | 'owner_ambiguous' | 'owner_cannot_read';

/**
 * Classify the profiles a case-insensitive email lookup returned for ONE
 * college's owner. `candidates` must already be filtered to active,
 * non-pre-registered profiles (the caller's query) — this function only
 * decides between none / several / one-that-may-not-read / ok.
 */
export function classifyLoopOwnerProfiles(
  candidates: readonly LoopOwnerProfileCandidate[],
  institutionId: string
):
  | { status: 'ok'; profile_id: string }
  | { status: Exclude<LoopOwnerStatus, 'ok'>; profile_id: null } {
  if (candidates.length === 0) return { status: 'owner_no_profile', profile_id: null };
  if (candidates.length > 1) return { status: 'owner_ambiguous', profile_id: null };
  const owner = candidates[0];
  const canRead =
    owner.is_super_admin === true ||
    (owner.institution_id === institutionId && LOOP_OWNER_READ_ROLES.has(owner.role ?? ''));
  return canRead
    ? { status: 'ok', profile_id: owner.id }
    : { status: 'owner_cannot_read', profile_id: null };
}

/**
 * The quiet inline warning the Owners & verdicts panel prints beside a scope
 * row, or null when the owner is reachable (or the status is unknown).
 */
export function loopOwnerStatusWarning(
  status: LoopOwnerStatus | null | undefined
): string | null {
  switch (status) {
    case 'owner_no_profile':
      return 'No active account for this email — alerts will not reach them';
    case 'owner_ambiguous':
      return 'More than one active account uses this email — alerts will not reach them';
    case 'owner_cannot_read':
      return 'This account cannot read risk data — alerts will not reach them';
    default:
      return null;
  }
}
