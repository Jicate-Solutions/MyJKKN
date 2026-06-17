/**
 * Smart Guide — PURE lane selection for the platform Help FAB.
 *
 * "Match the page you're on" (the locked rule) as a PURE function so it can be
 * unit-tested without React/DOM and reused by the FAB. Given the current route,
 * the viewer's VISIBLE composed lanes, and the generic platform OVERVIEW lane,
 * it returns the ONE lane the FAB drawer should open — SCOPED TO THE PAGE'S
 * MODULE, so the contextual drawer shows THIS page's guide, not the viewer's
 * whole cross-module role lane:
 *
 *   - On a route a guide MODULE owns → the highest-priority VISIBLE persona that
 *     module fills, with its sections RESTRICTED to that module (the `<module>:`
 *     step-key namespace composeLane stamps). So a module-admin on /pde sees PDE
 *     admin steps — NOT the AI Pulse / Campus Living admin steps that share the
 *     module-admin lane. The full cross-module role guide stays one tap away via
 *     the always-visible nav "Guide" item.
 *   - On a route NO module owns (dashboards, settings, un-guided modules) → the
 *     generic OVERVIEW lane ("how to get around").
 *   - If the matched module fills no visible persona the viewer has content for
 *     → the OVERVIEW lane (the floor). NEVER returns null, so the FAB is useful
 *     on every signed-in page. (Route-level HIDING — auth / public / onboarding
 *     — is the FAB's own concern, not this function's.)
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
  /**
   * The viewer's default lane (highest-priority visible). Retained for API
   * compatibility; the module-scoped picker is fully determined by route +
   * priority + visibility + per-module content, so `own` is no longer read.
   */
  own: CanonicalPersona;
  /** The generic platform OVERVIEW lane (route fallback + safety-net floor). */
  overview: PersonaGuide;
}

/** Pick the single lane the FAB should open for the current route. Never null. */
export function pickGuideLane({
  pathname,
  lanes,
  overview,
}: PickGuideLaneArgs): PersonaGuide {
  const mod = matchModuleRoute(pathname);

  // A route no guide module owns → the generic platform overview. "Match the
  // page": a page without its own guide gets "how to get around", not a module
  // lane the viewer merely qualifies for.
  if (!mod) return overview;

  // The highest-priority VISIBLE persona this module fills, with its sections
  // RESTRICTED to this module (composeLane namespaces every section id as
  // `<module>:<sectionId>`). This is what makes the contextual drawer show the
  // PAGE'S module guide instead of the persona's whole cross-module lane. The
  // namespaced keys are unchanged, so completed-step progress carries over.
  const prefix = `${mod.module}:`;
  for (const p of LANE_PRIORITY) {
    if (!mod.personas.includes(p)) continue;
    const lane = lanes.get(p);
    if (!lane) continue;
    const sections = lane.sections.filter((s) => s.id.startsWith(prefix));
    if (sections.length > 0) {
      return { ...lane, sections, journey: sections.map((s) => s.title) };
    }
  }

  // Module matched but the viewer has no visible content from it → overview floor.
  return overview;
}
