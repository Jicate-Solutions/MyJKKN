/**
 * Platform Smart Guide — dashboard adoption surfaces (SERVER mount).
 *
 * Resolves the viewer's own canonical lane (fail-closed), server-filters it by
 * `can`, then renders the two PLATFORM-level adoption surfaces on the dashboard:
 *   - <NextStepWidget>: a compact "your setup, next step" card (push, not pull).
 *   - <OnboardingLauncher>: the always-visible Start / Resume / Replay entry into
 *     the guided walkthrough (label derived from saved progress, never a
 *     first-login flag).
 * Both open the unified /guide. `can` never crosses to the client — only the
 * plain filtered lane + completed keys do.
 *
 * Fail-soft: any throw renders nothing rather than taking the dashboard down.
 * Renders nothing when the viewer's lane has no steps (nothing to onboard).
 *
 * (Per-module <ModuleWelcome> cards are placed per module as each module gains a
 * guide fragment — they're per-module content, not a platform surface.)
 */
import { resolveGuideAccess } from "@/lib/guide/resolve-persona";
import { composeLane } from "@/lib/guide/registry";
import { filterLaneSections } from "@/lib/guide/filter";
import { getCompletedSteps, logGuideEvent } from "@/lib/guide/actions";
import { OnboardingLauncher } from "@/components/guide/onboarding-launcher";
import { NextStepWidget } from "@/components/guide/guide-surfacing";

export async function GuideAdoptionMount() {
  let access;
  try {
    access = await resolveGuideAccess();
  } catch {
    return null;
  }

  const lane = filterLaneSections(composeLane(access.own), access.can);
  if (lane.sections.length === 0) return null; // nothing to onboard

  let completed: string[] = [];
  try {
    completed = await getCompletedSteps(access.own);
  } catch {
    completed = [];
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <NextStepWidget
          guide={lane}
          basePath="/guide"
          scopeId={access.scopeId}
          completed={completed}
          onEvent={logGuideEvent}
        />
      </div>
      <div className="shrink-0">
        <OnboardingLauncher
          guide={lane}
          basePath="/guide"
          completed={completed}
          onEvent={logGuideEvent}
        />
      </div>
    </div>
  );
}
