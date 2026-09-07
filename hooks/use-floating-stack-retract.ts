'use client';

/**
 * Drives `body[data-scrolling-down]`, which the `scrolling-down:` Tailwind
 * variant (tailwind.config.ts) keys off to retract the mobile floating stack.
 *
 * WHY THIS EXISTS — the geometry, because it decides the shape of the fix:
 *
 *   The platform Help FAB is `fixed bottom-nav-safe left-4` and is 48px wide,
 *   so it occupies x ∈ [16, 64]. Decision Queue action rows are
 *   `flex flex-wrap gap-2` inside a `p-4` card inside the dashboard's `px-2`
 *   wrapper, and <main> has no horizontal padding below `lg` — so the FIRST
 *   button in every row starts at x = 24. The FAB therefore covers the leading
 *   40px of whichever left-aligned control has scrolled into its vertical band:
 *   ✓ Approve on approval cards, 🔥 Claim rescue on rescue cards, Acknowledge
 *   on anomaly cards. A tap there opens Help instead of acting on the item.
 *
 *   This is not an offset that can be nudged away. The inert gutter left of any
 *   card control is 24px (8px page + 16px card padding) and the minimum
 *   accessible touch target is 44px, so no tappable control parked at the left
 *   edge can clear the content. A fixed element over a scrolling list of
 *   left-aligned controls will always intersect one of them at SOME scroll
 *   offset — which is why the fix here is temporal (get out of the way) rather
 *   than spatial (move it somewhere safe; there is nowhere safe).
 *
 * BEHAVIOUR — the Material "FAB hides on scroll-down" convention:
 *   scrolling DOWN past the top zone  → retract (fade out, tap-inert)
 *   scrolling UP, or back in the top zone → restore
 *
 *   Direction-aware restore is doing the real work. The reported flow is
 *   "scroll down the queue to the card you want, stop, tap Approve" — with a
 *   plain time-based restore the FAB fades back in a moment after the scroll
 *   stops, i.e. exactly when the thumb arrives. Staying retracted until the
 *   user scrolls UP keeps it clear for that whole flow. A scroll-up is a
 *   one-gesture, universally understood way to get it back.
 *
 * SCOPE — the variant bakes in `@media not all and (min-width: 1024px)`, so
 * none of this applies at `lg`+. At `lg` the FAB is still `fixed left-4` but
 * <main> carries `lg:ml-72`, so the FAB sits over the sidebar and never over
 * queue cards. There is no desktop collision to solve, and retracting a help
 * button that a keyboard user may be tabbing to would be a regression.
 *
 * The listener is per-consumer rather than a refcounted singleton: today the
 * Help FAB is the only caller, and two callers would simply write the same
 * attribute from the same scroll position (wasteful, never wrong).
 */

import { useEffect } from 'react';

const ATTR = 'data-scrolling-down';

/** Ignore sub-threshold movement so rubber-banding and 1px jitter don't flap
 *  the FAB. Deltas accumulate — `last` only moves once the threshold is met. */
const DIRECTION_THRESHOLD_PX = 24;

/** Near the top of the page the FAB always shows, regardless of direction. */
const TOP_ZONE_PX = 96;

/**
 * @param enabled  Attach only while the floating element is actually rendered.
 *                 Callers early-return `null` on hidden routes but must still
 *                 run their hooks, so they pass that same condition here.
 * @param resetKey Re-attach (and restore the stack) when this changes — pass
 *                 the pathname. Without it, navigating while retracted would
 *                 leave the new page's stack hidden until the user scrolls.
 */
export function useFloatingStackRetract(enabled: boolean, resetKey?: string): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let last = window.scrollY;
    let queued = false;

    const apply = () => {
      queued = false;
      const y = window.scrollY;
      const delta = y - last;
      if (Math.abs(delta) < DIRECTION_THRESHOLD_PX) return;
      last = y;
      if (delta > 0 && y > TOP_ZONE_PX) {
        document.body.setAttribute(ATTR, '');
      } else {
        document.body.removeAttribute(ATTR);
      }
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(apply);
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      // Never leave the stack retracted behind us — on unmount, on route
      // change, or when `enabled` flips false.
      document.body.removeAttribute(ATTR);
    };
  }, [enabled, resetKey]);
}
