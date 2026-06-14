/**
 * Smart Guide — PURE lane selection for the platform Help FAB.
 *
 * "Match the page you're on" (the locked rule) as a PURE function so it can be
 * unit-tested without React/DOM and reused by the FAB. Given the current route,
 * the viewer's VISIBLE composed lanes, their default ("own") lane, and the
 * generic platform OVERVIEW lane, it returns the ONE lane the FAB should open:
 *
 *   - On a route a guide MODULE owns  → the highest-priority VISIBLE persona that
 *     module contributes to (with content); else the viewer's own lane; else any
 *     visible lane with content, by priority.
 *   - On a route NO module owns (dashboards, settings, un-guided modules) → the
 *     generic OVERVIEW lane ("how to get around"), NOT an unrelated module lane
 *     the viewer happens to qualify for.
 *   - If a module matched but nothing the viewer can see has content → the
 *     OVERVIEW lane (the floor). The function therefore NEVER returns null, so
 *     the FAB is useful on every signed-in page. (Route-level HIDING —
 *     auth / public / onboarding — is the FAB's own concern, not this function's.)
 *
 * No I/O, no React, no "server-only" — safe to import anywhere and to unit-test.
 */
import type { CanonicalPersona, PersonaGuide } from "./types";
import { matchModuleRoute } from "./route-map";

/**
 * Persona priority (most-specific / highest-altitude first) — the read-only
 * CLIENT counterpart of the server resolver's PRIORITY (resolve-persona.ts).
 * Kept here, not imported, because that resolver is "server-only"; this is the
 * pure selector that both the FAB and its tests share. Keep the two in sync:
 * facilitator outranks coordinator (the shipped #1404 flip).
 */
export const LANE_PRIORITY: readonly CanonicalPersona[] = [
  "platform-admin",
  "module-admin",
  "supervisor",
  "unit-lead",
  "facilitator",
  "coordinator",
  "parent",
  "external",
  "learner",
] as const;

export interface PickGuideLaneArgs {
  /** Current pathname (usePathname()). */
  pathname: string;
  /** The viewer's VISIBLE composed + server-filtered lanes, indexed by persona. */
  lanes: ReadonlyMap<CanonicalPersona, PersonaGuide>;
  /** The viewer's default lane (highest-priority visible). */
  own: CanonicalPersona;
  /** The generic platform OVERVIEW lane (route fallback + safety-net floor). */
  overview: PersonaGuide;
}

/** Pick the single lane the FAB should open for the current route. Never null. */
export function pickGuideLane({
  pathname,
  lanes,
  own,
  overview,
}: PickGuideLaneArgs): PersonaGuide {
  const hasContent = (p: CanonicalPersona): boolean => {
    const lane = lanes.get(p);
    return !!lane && lane.sections.length > 0;
  };

  const mod = matchModuleRoute(pathname);

  // A route no guide module owns → the generic platform overview. "Match the
  // page": a page without its own guide gets "how to get around", not a module
  // lane the viewer merely qualifies for.
  if (!mod) return overview;

  // On a module's route, prefer the highest-priority visible persona that module
  // contributes to, then the viewer's own lane, then any visible lane — all in
  // priority order. The first candidate WITH content wins.
  const candidates: CanonicalPersona[] = [];
  for (const p of LANE_PRIORITY) {
    if (mod.personas.includes(p) && lanes.has(p)) candidates.push(p);
  }
  if (lanes.has(own)) candidates.push(own);
  for (const p of LANE_PRIORITY) {
    if (lanes.has(p)) candidates.push(p);
  }

  const chosen = candidates.find(hasContent);
  if (chosen) {
    const lane = lanes.get(chosen);
    if (lane) return lane;
  }

  // Module matched but nothing the viewer can see has content → overview floor.
  return overview;
}
