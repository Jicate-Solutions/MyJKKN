'use client';

// components/pde/guide/pde-guide-fab.tsx
// ============================================================================
// The "?Help" floating button for every PDE screen.
//
// Resolves the viewer's lane client-side (useGuideLane) and renders the shared
// GuideLauncher FAB, which owns the in-app drawer. Offset bottom-LEFT
// (left-4 right-auto) so it never stacks on the global bug/lightning FABs that
// live bottom-right (app/(routes)/layout.tsx).
//
// Hidden while permissions load (no flash). The learner lane is ungated, so
// every PDE viewer has at least that baseline lane.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { GuideLauncher } from './guide-launcher';
import { GUIDES } from '@/lib/pde/guide/content';
import { useGuideLane } from '@/lib/pde/guide/use-guide-lane';
import {
  getCompletedSteps,
  toggleStep,
  logGuideEvent,
} from '@/lib/pde/guide/actions';

export function PdeGuideFab() {
  const { own, isLoading } = useGuideLane();
  // Shared queryKey with the full page → checking a step on either surface
  // reflects after refetch; the FAB shows a live "steps remaining" badge.
  const { data: completed } = useQuery({
    queryKey: ['pde-guide-progress', own],
    queryFn: () => getCompletedSteps(own),
    enabled: !isLoading,
    staleTime: 60_000,
  });
  if (isLoading) return null;
  return (
    <GuideLauncher
      guide={GUIDES.lanes[own]}
      basePath="/pde/guide"
      variant="fab"
      className="left-4 right-auto"
      trackProgress
      initialCompleted={completed ?? []}
      onToggleStep={toggleStep}
      onEvent={logGuideEvent}
    />
  );
}
