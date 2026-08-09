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
 * "Match the page you're on" (the locked rule): usePathname() → pickGuideLane
 * (pure) → on a guide module's route, the highest-priority VISIBLE persona that
 * module contributes to (else the viewer's own lane); on a route NO module owns,
 * the generic platform OVERVIEW lane ("how to get around"), not an unrelated
 * module lane. The overview is also the floor, so the FAB is useful on every
 * signed-in page — not just the instrumented modules.
 *
 * Mounted bottom-LEFT (left-4 right-auto) so it never stacks on the global
 * bug-reporter / work-pulse FABs (bottom-right). On mobile/tablet it sits higher
 * (bottom-36 ≈ 144px) to clear the lg:hidden BottomNavbar + AttentionBar stack
 * (which the page itself pads pb-36 to clear); on lg+ there is no bottom nav, so
 * it drops to bottom-4. Hidden on non-app surfaces (auth / public / onboarding)
 * so it only appears where a signed-in user works.
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
import { useFloatingStackRetract } from "@/hooks/use-floating-stack-retract";
import { GuideDrawer } from "@/components/guide/guide-drawer";
import { pickGuideLane } from "@/lib/guide/pick-lane";
import { matchModuleRoute } from "@/lib/guide/route-map";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

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
  // Remaining app/(public) pages — outsider-facing (employer verify links,
  // booking embeds, polls, routing forms), so the signed-in Help FAB stays off.
  "/proof",
  "/employers",
  "/embed",
  "/poll",
  "/r",
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
  /** The generic platform OVERVIEW lane — opened on routes no module guide owns
   *  (and as the final fallback). Always provided by the server mount. */
  overview: PersonaGuide;
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
  overview,
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

  /**
   * The lane to open, per "match the page you're on" (pure — see pick-lane.ts):
   * on a guide module's route, the highest-priority VISIBLE persona that module
   * fills (else `own`); on a route no module owns, the generic OVERVIEW lane.
   * Never null — the overview is the floor — so the FAB shows on every signed-in
   * page. Recomputed on route change so re-opening on a new page re-matches.
   */
  const guide = React.useMemo<PersonaGuide>(
    () => pickGuideLane({ pathname, lanes: byPersona, own, overview }),
    [pathname, byPersona, own, overview]
  );

  // The module whose page we're on — scopes the drawer's "Open full guide" link
  // to THAT module only. Null whenever the contextual lane is the generic
  // overview (a guide-less route, or a module with no content for this viewer),
  // so "Open full guide" then opens the un-scoped overview/full guide.
  const moduleId = React.useMemo<string | null>(
    () => (guide === overview ? null : matchModuleRoute(pathname)?.module ?? null),
    [guide, overview, pathname]
  );

  // ── Progress (shared between FAB badge + drawer). Hooks MUST run before any
  //    early return, so this is computed unconditionally. The overview lane
  //    carries persona "learner" (its keys are namespace-disjoint from the
  //    learner MODULE lane), so progress for both resolves cleanly. ──
  const progressPersona: CanonicalPersona = guide.persona;
  const progress = useGuideProgress({
    persona: progressPersona,
    surface: "launcher",
    initialCompleted: initialCompleted?.[progressPersona],
    onToggle: onToggleStep,
    onEvent,
  });

  const lp = laneProgress(guide, progress.completed);
  const remaining = trackProgress && !lp.complete ? lp.total - lp.done : 0;

  // ── Hydration gate (do not remove; see the incident this encodes) ──
  // This component's ENTIRE output is a function of usePathname(), and it is
  // mounted inside a <Suspense> boundary in the ROOT layout whose server mount
  // awaits DB round-trips (resolveGuideAccess + getCompletedSteps). That
  // boundary's HTML therefore streams in LATE — routinely after the client has
  // already client-navigated away from the pathname the request started on
  // (app/page.tsx redirects "/" → /dashboard from a useEffect, and the
  // post-login flow does the same). React then hydrates that late boundary
  // against HTML rendered for the OLD pathname; when the two fall on opposite
  // sides of isHiddenRoute() the server emitted nothing while the client
  // renders the FAB, and hydration fails ("server rendered HTML didn't match").
  //
  // A pathname can't be reconciled across that gap, so the FAB simply never
  // participates in hydration: the server — and the first client render —
  // render nothing, and the button appears on the commit after mount, when
  // usePathname() is authoritative. It costs one frame on a `fixed`,
  // out-of-flow help button, and nothing on the server data it renders from
  // (lanes/progress still arrive as props, with no client round-trip).
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  const visible = hydrated && !isHiddenRoute(pathname);

  // ── Retract while scrolling down (mobile only) ──
  // This FAB is `fixed left-4`, i.e. parked in the same 48px-wide column that
  // the FIRST button of every Decision Queue action row occupies (that button
  // starts at x = 24 on mobile), so it covers the leading edge of ✓ Approve /
  // 🔥 Claim rescue / Acknowledge on whichever card has scrolled into its band.
  // Sets body[data-scrolling-down], which the `scrolling-down:` classes below
  // key off. Gated on `visible` so hidden routes don't attach a listener, and
  // keyed on `pathname` so navigating away never strands it retracted.
  // Hooks must run before the early return, so this sits above it.
  useFloatingStackRetract(visible, pathname);

  // Early return AFTER all hooks (invariant: hooks before returns).
  if (!visible) return null;

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
          "group fixed bottom-nav-safe left-4 right-auto z-40 lg:bottom-4 flex items-center gap-2 rounded-full bg-primary px-3.5 py-3 text-primary-foreground shadow-lg",
          "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          // Retract out of the way of the left-aligned card controls underneath
          // while the user scrolls down (mobile only — see the variant's note in
          // tailwind.config.ts). All three utilities are load-bearing:
          //   pointer-events-none  applies instantly (not transitionable), so
          //     the FAB stops swallowing a tap meant for ✓ Approve at the START
          //     of the fade rather than at the end of it.
          //   opacity-0            the visible retract, over `duration-200`.
          //   invisible            takes the button out of the tab order and the
          //     a11y tree. opacity alone leaves a keyboard/AT user on a narrow
          //     (<1024px) viewport able to Tab to — and activate with Enter — an
          //     invisible Help button. `visibility` transitions discretely and
          //     stays `visible` while either endpoint is, so the fade-out still
          //     plays in full and the fade-in reveals immediately.
          "scrolling-down:pointer-events-none scrolling-down:opacity-0 scrolling-down:invisible"
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
        key={guide === overview ? "overview" : guide.persona}
        guide={guide}
        basePath={basePath}
        moduleId={moduleId}
        scopeId={scopeId}
        open={open}
        onClose={() => setOpen(false)}
        trackProgress={trackProgress}
        progress={progress}
      />
    </>
  );
}
