/**
 * Platform Smart Guide — SERVER mount for the one platform Help FAB.
 *
 * This async server component is the seam between the server-only guide layers
 * and the client FAB. It runs ON THE SERVER (it imports the server-only
 * resolver), so the permission predicate `can` NEVER reaches the browser:
 *
 *   1. resolveGuideAccess()  → { visible, own, can, scopeId }  (fail-closed)
 *   2. for each VISIBLE persona: composeLane(p) then filterLaneSections(lane, can)
 *      — section-level gating happens HERE, server-side; only plain PersonaGuide
 *        data crosses to the client.
 *   3. pre-load each visible lane's completed step keys (adoption layer) in
 *      parallel, so the FAB badge + drawer hydrate without a client round-trip.
 *   4. render <PlatformGuideFab …/> with that plain data.
 *
 * Mounted once high in the tree (root layout). Fail-soft: any throw degrades to
 * rendering nothing rather than taking a page down — but resolveGuideAccess is
 * itself try/caught to LEARNER_ONLY, so the common path always yields ≥1 lane.
 */
import { resolveGuideAccess } from "@/lib/guide/resolve-persona";
import { composeLane, PLATFORM_OVERVIEW_LANE } from "@/lib/guide/registry";
import { filterLaneSections } from "@/lib/guide/filter";
import type { CanonicalPersona, PersonaGuide } from "@/lib/guide/types";
import { PlatformGuideFab } from "@/components/guide/platform-guide-fab";
import { getCompletedSteps, logGuideEvent, toggleStep } from "@/lib/guide/actions";

export async function PlatformGuideFabMount() {
  let access;
  try {
    access = await resolveGuideAccess();
  } catch {
    return null; // resolver already fail-closes; this is belt-and-suspenders
  }

  // Build the viewer's visible lanes = compose (canonical lane) → server-filter
  // (drop sections the viewer can't see). `can` stays on the server.
  const lanes: PersonaGuide[] = access.visible.map((p: CanonicalPersona) =>
    filterLaneSections(composeLane(p), access.can)
  );

  // The route-fallback OVERVIEW lane (opened on routes no module guide owns, and
  // as the FAB's floor). It carries no gated sections, so filtering is a no-op —
  // run it through anyway so the contract stays uniform if that ever changes.
  const overview: PersonaGuide = filterLaneSections(PLATFORM_OVERVIEW_LANE, access.can);

  // Pre-load completed steps for each visible lane (parallel; fail-soft per lane).
  const completedEntries = await Promise.all(
    access.visible.map(async (p) => [p, await getCompletedSteps(p)] as const)
  );
  const initialCompleted: Partial<Record<CanonicalPersona, string[]>> = {};
  for (const [p, keys] of completedEntries) initialCompleted[p] = keys;

  return (
    <PlatformGuideFab
      lanes={lanes}
      overview={overview}
      own={access.own}
      scopeId={access.scopeId}
      basePath="/guide"
      trackProgress
      initialCompleted={initialCompleted}
      onToggleStep={toggleStep}
      onEvent={logGuideEvent}
    />
  );
}
