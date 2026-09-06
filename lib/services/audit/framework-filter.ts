// Which catalog parameters belong to a cycle, given the bodies it audits against.
//
// This predicate is deliberately SHARED between the "new cycle" wizard preview
// and the draft→in-progress freeze (AuditCycleService.transitionPhase). Before
// this existed the two disagreed: the preview filtered by framework while the
// freeze took every active row, so a cycle previewing "38 parameters will be
// frozen" actually froze 63. Q3/Q4 FY26-27 are tagged {NAAC,NBA,NIRF} yet each
// froze all 25 CARRE-* rows, which map to {"carre": …} and match none of those
// three. One predicate, two call sites — they cannot drift apart again.
//
// Case: framework_mapping keys are inconsistent in the catalog — 36 rows use
// lowercase ('naac','nba','nirf','ugc'), and the two org-wide checks use
// uppercase ('NAAC','IQAC'). Chips are uppercase. So both sides are lowercased
// before comparing; do not "tidy" that away.

/**
 * True when a parameter is mapped to at least one of the given bodies.
 *
 * @param frameworkMapping the parameter's `framework_mapping` jsonb, e.g.
 *   `{"nba":"1.1","naac":"1.1.2"}` or `{"carre":"E1"}`
 * @param frameworks the cycle's chosen bodies, e.g. `['NAAC','NBA','NIRF']`
 */
export function parameterMatchesFrameworks(
  frameworkMapping: Record<string, string> | null | undefined,
  frameworks: readonly string[]
): boolean {
  if (!frameworks.length) return false;
  const wanted = new Set(frameworks.map((f) => f.toLowerCase()));
  return Object.keys(frameworkMapping ?? {}).some((body) =>
    wanted.has(body.toLowerCase())
  );
}

/** Filter a catalog (or snapshot) row list down to the cycle's chosen bodies. */
export function filterParametersByFrameworks<
  T extends { framework_mapping?: Record<string, string> | null },
>(parameters: readonly T[], frameworks: readonly string[]): T[] {
  return parameters.filter((p) =>
    parameterMatchesFrameworks(p.framework_mapping, frameworks)
  );
}
