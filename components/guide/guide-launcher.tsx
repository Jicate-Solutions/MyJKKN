"use client";

/**
 * Canonical Smart Guide — launcher. Owns the drawer open-state + the trigger.
 *
 * Copy of components/ai-pulse/guide/guide-launcher.tsx, re-pointed at the
 * CANONICAL contract (@/lib/guide/*) and typed to CanonicalPersona. Two
 * variants:
 *   - "fab":     a floating "? Help" button, always visible. Pinned bottom-RIGHT;
 *                pass className="left-4 right-auto" if a bug/chat FAB lives there.
 *   - "navlink": an inline "Guide" item for a sidebar/menu.
 *
 * NOTE: the PLATFORM FAB (components/guide/platform-guide-fab.tsx) does NOT use
 * this launcher — it needs route-aware lane SWITCHING across many lanes, so it
 * drives GuideDrawer directly. This launcher remains the canonical single-lane
 * trigger for per-page / nav use, kept at parity with the module template.
 */

import * as React from "react";
import { HelpCircle, BookOpen } from "lucide-react";

import { type PersonaGuide, type GuideEvent, type CanonicalPersona, laneProgress } from "@/lib/guide/types";
import { useGuideProgress } from "@/lib/guide/use-progress";
import { GuideDrawer } from "@/components/guide/guide-drawer";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

interface GuideLauncherProps {
  guide: PersonaGuide;
  /** Base path of the full-page guide, e.g. "/guide". */
  basePath: string;
  scopeId?: string | null;
  variant: "fab" | "navlink";
  className?: string;
  /* ── adoption layer (all optional) ── */
  trackProgress?: boolean;
  initialCompleted?: string[];
  onToggleStep?: (persona: CanonicalPersona, key: string, done: boolean) => Promise<unknown> | void;
  onEvent?: (event: GuideEvent) => Promise<unknown> | void;
}

export function GuideLauncher({
  guide,
  basePath,
  scopeId,
  variant,
  className,
  trackProgress,
  initialCompleted,
  onToggleStep,
  onEvent,
}: GuideLauncherProps) {
  const [open, setOpen] = React.useState(false);
  // ONE shared progress instance powers BOTH the FAB badge and the drawer, so
  // checking a step in the drawer updates the "steps remaining" badge live.
  const progress = useGuideProgress({
    persona: guide.persona,
    surface: "drawer",
    initialCompleted,
    onToggle: onToggleStep,
    onEvent,
  });
  const lp = laneProgress(guide, progress.completed);
  const remaining = trackProgress && !lp.complete ? lp.total - lp.done : 0;

  return (
    <>
      {variant === "fab" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={remaining > 0 ? `Help — ${remaining} setup steps left` : "Help"}
          className={cx(
            "group fixed bottom-nav-safe lg:bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-3.5 py-3 text-primary-foreground shadow-lg",
            "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className
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
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cx(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <BookOpen className="size-4 shrink-0" />
          <span className="flex-1 text-left">Guide</span>
          {remaining > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">{remaining}</span>
          )}
        </button>
      )}
      <GuideDrawer
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
