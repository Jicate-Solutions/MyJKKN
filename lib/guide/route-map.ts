/**
 * Smart Guide — route → module map (PURE, no I/O, no React).
 *
 * The platform Help FAB needs to answer "which module am I on, and which guide
 * lanes does that module contribute to?" so it can open the guide on the lane
 * that MATCHES THE PAGE (the locked rule), not just the viewer's default lane.
 *
 * Source of truth is the REGISTRY: each ModuleGuide carries its `basePath`
 * (e.g. "/ai-pulse") and the canonical personas it fills (the keys of its
 * `lanes`). We derive both the prefix table and the per-module persona
 * contributions from REGISTRY so this can never drift from what was composed.
 *
 * Pure + framework-neutral (safe to import from client AND server) — the FAB
 * runs this against usePathname() on the client; nothing here touches I/O.
 */
import type { CanonicalPersona } from "./types";
import { REGISTRY } from "./registry";

/** One module's routing contribution, derived from its REGISTRY fragment. */
export interface ModuleRoute {
  /** Module namespace, e.g. "ai-pulse". */
  module: string;
  /** Route base, e.g. "/ai-pulse". */
  basePath: string;
  /**
   * Canonical personas this module contributes lanes to (the keys of its
   * `lanes` fragment), ordered as they appear in the registry. The FAB picks the
   * highest-priority VISIBLE persona among these for the current route.
   */
  personas: CanonicalPersona[];
}

/**
 * Per-module routes, sorted longest-basePath-first so the longest-prefix match
 * wins (defensive — module bases don't currently nest, but a future "/pde/x"
 * style base would otherwise be shadowed by a shorter prefix).
 */
export const MODULE_ROUTES: ModuleRoute[] = REGISTRY.map((m) => ({
  module: m.module,
  basePath: m.basePath,
  personas: Object.keys(m.lanes) as CanonicalPersona[],
})).sort((a, b) => b.basePath.length - a.basePath.length);

/** True when `pathname` is exactly `base` or a sub-path of it ("/base/..."). */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + "/");
}

/**
 * Map a pathname to its module by longest-prefix match over the REGISTRY module
 * basePaths. Returns the matched module's routing info, or null for a route no
 * guide module owns (a guide-less route → the FAB falls back to the viewer's
 * own lane / the overview).
 */
export function matchModuleRoute(pathname: string): ModuleRoute | null {
  if (!pathname) return null;
  for (const r of MODULE_ROUTES) {
    if (isUnder(pathname, r.basePath)) return r;
  }
  return null;
}
