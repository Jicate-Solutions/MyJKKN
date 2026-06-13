'use client';

// app/(routes)/campus-living/my-hostel/guide/page.tsx
// ============================================================================
// CAMPUS LIVING — Smart Guide (full-page route)
//
// Installed via the /smart-guide skill (2026-06-13), upgrading the hand-built
// guide (PR #1376) to the one-data-model → many-renderers architecture:
// this page, an in-app drawer, and a "?Help" FAB on every campus-living screen
// (components/campus-living/guide/*), all driven by lib/campus-living/guide/
// content.ts so they can't drift.
//
// CLIENT detection (not the skill's server template): MyJKKN's permission
// system is the client-side usePermissions() hook — the same surface the AI
// Pulse guide and CampusLivingResidentGuard use. We compute the viewer's lane
// + visible lanes here (fail-CLOSED) and hand them to the GuideView renderer.
//
// PLACEMENT under /my-hostel/: student residents are confined to /my-hostel/*
// by CampusLivingResidentGuard, so the guide lives here and every resident-lane
// link stays inside that allow-list (see content.ts).
//
// PROGRESS LAYER ON: each step is a checkbox, progress persists per user
// (guide_progress), and every interaction fires a GuideEvent (guide_events) —
// the funnel that answers "do guide users adopt more?". Server actions are
// called from this client component (getCompletedSteps via React Query;
// toggleStep / logGuideEvent passed down). All fail-soft — a progress hiccup
// never blocks the guide.
// ============================================================================

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { ContentLayout } from '@/components/layout/content-layout';
import { Skeleton } from '@/components/ui/skeleton';

import { GUIDES } from '@/lib/campus-living/guide/content';
import {
  getCompletedSteps,
  toggleStep,
  logGuideEvent,
} from '@/lib/campus-living/guide/actions';
import {
  isGuidePersona,
  type GuideBook,
  type GuidePersona,
} from '@/lib/campus-living/guide/types';
import { useGuideLane } from '@/lib/campus-living/guide/use-guide-lane';
import { GuideView } from '@/components/campus-living/guide/GuideView';

const BASE_PATH = '/campus-living/my-hostel/guide';

/** Per-lane "Back" home. Keys MUST equal the GuidePersona union (tsc enforces). */
const PERSONA_HOME: Record<GuidePersona, string> = {
  resident: '/campus-living/my-hostel',
  warden: '/campus-living',
  mess: '/campus-living/mess/menu',
  admin: '/campus-living/settings/fee-config',
};

function GuideInner() {
  // ALL hooks run unconditionally, before any early return — a `useQuery`
  // after the isLoading guard is a hooks-order violation (React #310).
  const searchParams = useSearchParams();
  const { own, visible, isLoading } = useGuideLane();

  // Active lane: the viewer's own, overridable by a permitted ?persona=.
  // `own`/`visible` are defined even while permissions load (resident default).
  const requestedRaw = searchParams.get('persona');
  const requested = isGuidePersona(requestedRaw) ? requestedRaw : null;
  const persona: GuidePersona =
    requested && visible.includes(requested) ? requested : own;

  // Persisted completion for the active lane (server action via React Query).
  // Deferred until permissions resolve so we query for the settled persona.
  const { data: completed, isFetched: progressLoaded } = useQuery({
    queryKey: ['campus-living-guide-progress', persona],
    queryFn: () => getCompletedSteps(persona),
    enabled: !isLoading,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <ContentLayout title="Campus Living — Guide">
        <Skeleton className="h-64 w-full" />
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Campus Living — Guide">
      <GuideView
        // Re-key on persona AND once progress lands, so the renderer's
        // mount-time progress seed picks up the real completed set.
        key={`${persona}:${progressLoaded ? 'p' : 'n'}`}
        guides={GUIDES as GuideBook}
        persona={persona}
        visiblePersonas={visible}
        scopeId={null}
        basePath={BASE_PATH}
        scopeFallbackHref={PERSONA_HOME[own]}
        trackProgress
        initialCompleted={completed ?? []}
        onToggleStep={toggleStep}
        onEvent={logGuideEvent}
      />
    </ContentLayout>
  );
}

export default function CampusLivingGuidePage() {
  // useSearchParams needs a Suspense boundary (Next 16 strict).
  return (
    <Suspense
      fallback={
        <ContentLayout title="Campus Living — Guide">
          <Skeleton className="h-64 w-full" />
        </ContentLayout>
      }
    >
      <GuideInner />
    </Suspense>
  );
}
