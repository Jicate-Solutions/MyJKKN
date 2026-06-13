'use client';

// components/campus-living/guide/campus-living-guide-fab.tsx
// ============================================================================
// The "?Help" floating button for every Campus Living screen.
//
// Resolves the viewer's lane client-side (useGuideLane) and renders the shared
// GuideLauncher FAB, which owns the in-app drawer. Offset bottom-LEFT
// (left-4 right-auto) so it never stacks on the global bug/lightning FABs that
// live bottom-right (app/(routes)/layout.tsx).
//
// Hidden while permissions load (no flash) and for a viewer with no lane.
// ============================================================================

import { GuideLauncher } from './guide-launcher';
import { GUIDES } from '@/lib/campus-living/guide/content';
import { useGuideLane } from '@/lib/campus-living/guide/use-guide-lane';

export function CampusLivingGuideFab() {
  const { own, isLoading } = useGuideLane();
  if (isLoading) return null;
  return (
    <GuideLauncher
      guide={GUIDES.lanes[own]}
      basePath="/campus-living/my-hostel/guide"
      variant="fab"
      className="left-4 right-auto"
    />
  );
}
