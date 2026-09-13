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
 * loop: every institution in `institutions` with no scope row for `loopKey`,
 * or whose scope row carries a blank email. Order is preserved from
 * `institutions` (the callers pass a name-sorted list).
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
  return institutions.filter((i) => !scoped.has(i.id));
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
