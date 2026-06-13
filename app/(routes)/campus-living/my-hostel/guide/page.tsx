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
// PROGRESS LAYER OFF for now: trackProgress=false + no toggle/event props →
// the renderers degrade to the plain (uncheckable) guide. Turning it on needs
// the guide_progress / guide_events tables + server actions (a follow-up).
// ============================================================================

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { ContentLayout } from '@/components/layout/content-layout';
import { Skeleton } from '@/components/ui/skeleton';

import { GUIDES } from '@/lib/campus-living/guide/content';
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
  const searchParams = useSearchParams();
  const { own, visible, isLoading } = useGuideLane();

  if (isLoading) {
    return (
      <ContentLayout title="Campus Living — Guide">
        <Skeleton className="h-64 w-full" />
      </ContentLayout>
    );
  }

  // Everyone with a campus-living foothold reaches this page (residents are
  // routed here by the nav chip; the resident lane is always visible), so there
  // is no denied state to reach here — `visible` always contains `resident`.
  const requestedRaw = searchParams.get('persona');
  const requested = isGuidePersona(requestedRaw) ? requestedRaw : null;
  const persona: GuidePersona =
    requested && visible.includes(requested) ? requested : own;

  return (
    <ContentLayout title="Campus Living — Guide">
      <GuideView
        key={persona}
        guides={GUIDES as GuideBook}
        persona={persona}
        visiblePersonas={visible}
        scopeId={null}
        basePath={BASE_PATH}
        scopeFallbackHref={PERSONA_HOME[own]}
        trackProgress={false}
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
