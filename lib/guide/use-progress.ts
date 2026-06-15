"use client";

/**
 * Canonical Smart Guide — optimistic progress hook (CanonicalPersona-typed).
 *
 * Holds the viewer's completed-step set, updates the UI INSTANTLY on toggle, and
 * persists + instruments out-of-band. Everything is optional: with no `onToggle`
 * the completion is ephemeral (in-memory only); with no `onEvent` nothing is
 * logged. Pass the server actions in from the host so this stays import-agnostic.
 *
 * Byte-identical in behaviour to lib/ai-pulse/guide/use-progress.ts — only the
 * persona type is the canonical 9-persona union. Each renderer (page / drawer)
 * creates its own instance with its own `surface`.
 */
import * as React from "react";
import type { GuideEvent, GuideEventSink, CanonicalPersona } from "@/lib/guide/types";

export interface GuideProgressApi {
  completed: ReadonlySet<string>;
  /** Toggle one step's completion (optimistic) + persist + emit the event. */
  toggle: (stepKey: string) => void;
  /** Emit an instrumentation event (persona is filled in for you). */
  emit: (event: Omit<GuideEvent, "persona">) => void;
}

export function useGuideProgress(opts: {
  persona: CanonicalPersona;
  surface: GuideEvent["surface"];
  initialCompleted?: string[];
  /** Server action: persist a step toggle. Omit → ephemeral progress. */
  onToggle?: (persona: CanonicalPersona, stepKey: string, done: boolean) => Promise<unknown> | void;
  /** Event sink. Omit → no instrumentation. */
  onEvent?: (event: GuideEvent) => Promise<unknown> | void;
}): GuideProgressApi {
  const { persona, surface, initialCompleted, onToggle, onEvent } = opts;
  const [completed, setCompleted] = React.useState<Set<string>>(
    () => new Set(initialCompleted ?? [])
  );

  // Re-seed when the active PERSONA changes. The platform Help FAB is mounted
  // ONCE in the root layout and survives App-Router client navigations, flipping
  // its contextual persona per route (pickGuideLane) WITHOUT remounting this
  // hook — so without this, `completed` stays frozen to the first route's
  // persona and the FAB badge + drawer checkboxes mis-report after navigating
  // (e.g. module-admin on /pde → "learner" overview on /dashboard). Guarded by a
  // ref so we re-seed ONLY on a real persona change — never on mount (useState
  // already seeded), and never on an initialCompleted identity churn within one
  // persona (which would clobber the viewer's in-session optimistic toggles).
  // Keyed consumers (GuideView uses key={persona}) remount instead, so there
  // this is a one-time no-op.
  const seededPersona = React.useRef(persona);
  React.useEffect(() => {
    if (seededPersona.current === persona) return;
    seededPersona.current = persona;
    setCompleted(new Set(initialCompleted ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona]);

  const emit = React.useCallback<GuideEventSink>(
    (event) => {
      // Guard sync throws AND async rejections — onEvent may return a promise.
      try {
        void Promise.resolve(onEvent?.(event)).catch(() => {});
      } catch {
        /* analytics must never break the UI */
      }
    },
    [onEvent]
  );

  const emitPartial = React.useCallback(
    (event: Omit<GuideEvent, "persona">) => emit({ ...event, persona }),
    [emit, persona]
  );

  const toggle = React.useCallback(
    (key: string) => {
      const willBeDone = !completed.has(key);
      // Pure updater — NO side effects inside it. React double-invokes updaters
      // under StrictMode (dev), which would double-fire persistence + analytics.
      setCompleted((prev) => {
        const next = new Set(prev);
        if (willBeDone) next.add(key);
        else next.delete(key);
        return next;
      });
      // Side effects AFTER the update. Swallow async rejection so a failed
      // persist never becomes an unhandled rejection (best-effort; the set
      // re-seeds from the server on next load).
      try {
        void Promise.resolve(onToggle?.(persona, key, willBeDone)).catch(() => {});
      } catch {
        /* persistence failure must not block the optimistic UI */
      }
      emit({ name: willBeDone ? "step_complete" : "step_uncomplete", persona, surface, stepKey: key });
    },
    [completed, persona, surface, onToggle, emit]
  );

  // Memoize so consumers get a STABLE reference — otherwise a fresh object each
  // render makes any effect that deps on `progress` re-run every render.
  return React.useMemo(
    () => ({ completed, toggle, emit: emitPartial }),
    [completed, toggle, emitPartial]
  );
}
