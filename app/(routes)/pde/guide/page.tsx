'use client';

// app/(routes)/pde/guide/page.tsx
// ============================================================================
// PDE — Smart Guide (full-page route)
//
// Installed via the /smart-guide skill (2026-06-14), mirroring the campus-living
// install: ONE data model (lib/pde/guide/content.ts) drives this page, an in-app
// drawer, and a "?Help" FAB on every PDE screen (components/pde/guide/*), so the
// three surfaces can't drift.
//
// CLIENT detection (MyJKKN's permission surface is the usePermissions() hook,
// not a server template): the viewer's lane + visible lanes are computed in
// useGuideLane (fail-CLOSED) and handed to the GuideView renderer. The learner
// lane is the ungated baseline; faculty + admin are gated on pde.faculty.view /
// pde.admin.view.
//
// PROGRESS LAYER ON: each step is a checkbox, progress persists per user
// (guide_progress), and every interaction fires a GuideEvent (guide_events) —
// reusing the tables the campus-living guide already created (no migration).
// All progress/event calls fail-soft — a hiccup never blocks the guide.
//
// HOOKS ORDER: every hook runs before the isLoading early-return. A useQuery
// after the guard is a Rules-of-Hooks violation (React #310) that passes CI and
// white-screens prod — the exact crash fixed for campus-living in PR #1380.
// ============================================================================

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { ContentLayout } from '@/components/layout/content-layout';
import { Skeleton } from '@/components/ui/skeleton';

import { GUIDES } from '@/lib/pde/guide/content';
import {
  getCompletedSteps,
  toggleStep,
  logGuideEvent,
} from '@/lib/pde/guide/actions';
import {
  isGuidePersona,
  type GuideBook,
  type GuidePersona,
} from '@/lib/pde/guide/types';
import { useGuideLane } from '@/lib/pde/guide/use-guide-lane';
import { GuideView } from '@/components/pde/guide/GuideView';

const BASE_PATH = '/pde/guide';

/** Per-lane "Back" home. Keys MUST equal the GuidePersona union (tsc enforces). */
const PERSONA_HOME: Record<GuidePersona, string> = {
  learner: '/pde/learn',
  faculty: '/pde/faculty/dashboard',
  admin: '/pde/admin',
};

function GuideInner() {
  // ALL hooks run unconditionally, before any early return.
  const searchParams = useSearchParams();
  const { own, visible, isLoading } = useGuideLane();

  // Active lane: the viewer's own, overridable by a permitted ?persona=.
  const requestedRaw = searchParams.get('persona');
  const requested = isGuidePersona(requestedRaw) ? requestedRaw : null;
  const persona: GuidePersona =
    requested && visible.includes(requested) ? requested : own;

  // Persisted completion for the active lane (server action via React Query).
  const { data: completed, isFetched: progressLoaded } = useQuery({
    queryKey: ['pde-guide-progress', persona],
    queryFn: () => getCompletedSteps(persona),
    enabled: !isLoading,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <ContentLayout title="PDE — Guide">
        <Skeleton className="h-64 w-full" />
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="PDE — Guide">
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

export default function PdeGuidePage() {
  // useSearchParams needs a Suspense boundary (Next 16 strict).
  return (
    <Suspense
      fallback={
        <ContentLayout title="PDE — Guide">
          <Skeleton className="h-64 w-full" />
        </ContentLayout>
      }
    >
      <GuideInner />
    </Suspense>
  );
}
