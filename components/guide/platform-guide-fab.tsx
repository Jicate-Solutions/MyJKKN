"use client";

/**
 * Platform Smart Guide — the ONE route-aware "? Help" FAB for all of MyJKKN.
 *
 * Replaces the three per-module FABs (AI Pulse / Campus Living / PDE) with a
 * single platform-wide launcher mounted once, high in the tree. It receives, as
 * PLAIN DATA already permission-filtered SERVER-SIDE (see PlatformGuideFabMount):
 *   - `lanes`: the viewer's VISIBLE composed lanes (one PersonaGuide per visible
 *      canonical persona) — sections the viewer can't see were dropped on the
 *      server, so `can` never crosses to the client,
 *   - `own`: the viewer's default lane (highest-priority lane they can see),
 *   - nothing else about permissions.
 *
 * "Match the page you're on" (the locked rule): usePathname() → which module owns
 * this route (route-map, pure) → open the highest-priority VISIBLE persona that
 * module contributes to; off a guide module, open `own`; if the chosen lane has
 * no content, fall back to the first lane that does (the overview).
 *
 * Mounted bottom-LEFT (left-4 right-auto) so it never stacks on the global
 * bug-reporter / work-pulse FABs (bottom-right). Hidden on non-app surfaces
 * (auth / public / onboarding) so it only appears where a signed-in user works.
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";

import {
  type PersonaGuide,
  type CanonicalPersona,
  type GuideEvent,
  laneProgress,
} from "@/lib/guide/types";
import { useGuideProgress } from "@/lib/guide/use-progress";
import { GuideDrawer } from "@/components/guide/guide-drawer";
import { matchModuleRoute } from "@/lib/guide/route-map";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

/**
 * Persona priority (most-specific / highest-altitude first) — mirrors the server
 * resolver's PRIORITY. Kept here (not imported) because the resolver is
 * server-only; this is the read-only client counterpart for picking the most
 * relevant lane among several the viewer can see on a given route.
 */
const PRIORITY: readonly CanonicalPersona[] = [
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

/**
 * Route prefixes that are NOT part of the signed-in app shell — the FAB stays
 * hidden there (mirrors the old module-scoped FABs never appearing on auth /
 * onboarding screens). Matching is by first path segment.
 */
const HIDDEN_PREFIXES: readonly string[] = [
  // Auth / onboarding / utility surfaces (app/* outside the (routes) shell)
  "/auth",
  "/apply",
  "/driver",
  "/guest",
  "/logout",
  "/unauthorized",
  "/verify",
  "/student-form",
  "/offline",
  "/pwa-status",
  "/portfolio",
  "/sentry-example-page",
  "/c/",
  // Public, often logged-out / external-facing pages (the app/(public) group):
  // privacy, terms, referral, booking + meeting links. The FAB is for signed-in
  // app users, so it stays off these.
  "/privacy",
  "/terms",
  "/refer",
  "/meet",
  "/data-deletion",
  "/book",
  "/m",
];

function isHiddenRoute(pathname: string): boolean {
  // "/" is the transient role-based redirect page (→ /auth/login or a dashboard);
  // never show the FAB there. Handled exactly — it can't go in the prefix list
  // because startsWith("/") would match every route.
  if (pathname === "/") return true;
  for (const p of HIDDEN_PREFIXES) {
    if (pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/")) return true;
  }
  return false;
}

interface PlatformGuideFabProps {
  /** Visible composed + server-filtered lanes, one per visible canonical persona. */
  lanes: PersonaGuide[];
  /** The viewer's default lane (highest-priority visible). */
  own: CanonicalPersona;
  /** Current scope id, for resolving `:scopeId` deep-links (none at platform level today). */
  scopeId?: string | null;
  /** Base path of the full-page guide, for the drawer's "Open full guide" link. */
  basePath?: string;
  /* ── adoption layer (all optional) ── */
  trackProgress?: boolean;
  /** Completed step keys, keyed by persona (from getCompletedSteps per visible lane). */
  initialCompleted?: Partial<Record<CanonicalPersona, string[]>>;
  onToggleStep?: (persona: CanonicalPersona, key: string, done: boolean) => Promise<unknown> | void;
  onEvent?: (event: GuideEvent) => Promise<unknown> | void;
}

export function PlatformGuideFab({
  lanes,
  own,
  scopeId = null,
  basePath = "/guide",
  trackProgress,
  initialCompleted,
  onToggleStep,
  onEvent,
}: PlatformGuideFabProps) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = React.useState(false);

  // Index the visible lanes by persona for O(1) lookup. Stable across renders
  // unless the lanes prop identity changes (it won't within a request).
  const byPersona = React.useMemo(() => {
    const m = new Map<CanonicalPersona, PersonaGuide>();
    for (const l of lanes) m.set(l.persona, l);
    return m;
  }, [lanes]);

  const hasContent = React.useCallback(
    (p: CanonicalPersona): boolean => {
      const lane = byPersona.get(p);
      return !!lane && lane.sections.length > 0;
    },
    [byPersona]
  );

  /**
   * The lane to open, per "match the page you're on":
   *   1. route → module → highest-priority VISIBLE persona that module fills,
   *   2. else `own`,
   *   3. if that lane has no content, the first visible lane that does (overview).
   * Recomputed when the route changes so re-opening on a new page picks the
   * lane for THAT page.
   */
  const activePersona = React.useMemo<CanonicalPersona | null>(() => {
    const candidates: CanonicalPersona[] = [];

    const mod = matchModuleRoute(pathname);
    if (mod) {
      // highest-priority visible persona this module contributes to
      const visibleForModule = PRIORITY.filter(
        (p) => mod.personas.includes(p) && byPersona.has(p)
      );
      candidates.push(...visibleForModule);
    }

    // viewer's own lane next
    if (byPersona.has(own)) candidates.push(own);

    // any visible lane, in priority order — the overview safety net
    for (const p of PRIORITY) if (byPersona.has(p)) candidates.push(p);

    // first candidate WITH content; else first candidate at all; else null
    const withContent = candidates.find((p) => hasContent(p));
    if (withContent) return withContent;
    return candidates[0] ?? null;
  }, [pathname, byPersona, own, hasContent]);

  const guide = activePersona ? byPersona.get(activePersona) ?? null : null;

  // ── Progress (shared between FAB badge + drawer). Hooks MUST run before any
  //    early return, so this is computed unconditionally with safe fallbacks. ──
  const progressPersona: CanonicalPersona = activePersona ?? own;
  const progress = useGuideProgress({
    persona: progressPersona,
    surface: "launcher",
    initialCompleted: activePersona ? initialCompleted?.[activePersona] : undefined,
    onToggle: onToggleStep,
    onEvent,
  });

  const lp = guide ? laneProgress(guide, progress.completed) : null;
  const remaining = trackProgress && lp && !lp.complete ? lp.total - lp.done : 0;

  // Early returns AFTER all hooks (invariant: hooks before returns).
  if (isHiddenRoute(pathname)) return null;
  if (!guide) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          progress.emit({ name: "guide_open", surface: "launcher", context: pathname });
          setOpen(true);
        }}
        aria-label={remaining > 0 ? `Help — ${remaining} setup steps left` : "Help"}
        className={cx(
          "group fixed bottom-4 left-4 right-auto z-40 flex items-center gap-2 rounded-full bg-primary px-3.5 py-3 text-primary-foreground shadow-lg",
          "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      >
        <HelpCircle className="size-5 shrink-0" />
        <span className="hidden text-sm font-semibold sm:inline">Help</span>
        {remaining > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1 text-[11px] font-bold text-primary shadow ring-2 ring-primary"
          >
            {remaining}
          </span>
        )}
      </button>

      {/* key={persona} → switching the contextual lane fully remounts the drawer
          so its internal section open-state + progress wiring reset to the new
          lane (invariant: keyed switchable render). */}
      <GuideDrawer
        key={progressPersona}
        guide={guide}
        basePath={basePath}
        scopeId={scopeId}
        open={open}
        onClose={() => setOpen(false)}
        trackProgress={trackProgress}
        progress={progress}
      />
    </>
  );
}
