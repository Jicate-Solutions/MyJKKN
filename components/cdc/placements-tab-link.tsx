'use client';

/**
 * PlacementsTabLink — thin component for cross-linking from the drive detail page
 * to the placements list filtered to that drive.
 *
 * Usage in cdc/drives/[id]/page.tsx (Sprint 4+ opt-in — DO NOT edit drive page now):
 *   import { PlacementsTabLink } from '@/components/cdc/placements-tab-link';
 *   <PlacementsTabLink driveId={drive.id} driveStatus={drive.status} />
 *
 * Spec Round 2.4 / Sprint 3: only meaningful after results_announced.
 * Shows disabled state for earlier statuses.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Briefcase } from 'lucide-react';
import type { CdcDriveStatus } from '@/types/cdc';

interface Props {
  driveId: string;
  driveStatus: CdcDriveStatus;
  placementCount?: number;
}

const RESULTS_VISIBLE_STATUSES: CdcDriveStatus[] = [
  'results_announced',
  'closed',
];

export function PlacementsTabLink({ driveId, driveStatus, placementCount }: Props) {
  const isActive = RESULTS_VISIBLE_STATUSES.includes(driveStatus);

  if (!isActive) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2 opacity-50">
        <Briefcase className="h-4 w-4" />
        Placements
        <span className="text-xs text-muted-foreground">(available after results)</span>
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm" className="gap-2">
      <Link href={`/cdc/placements?drive_id=${driveId}`}>
        <Briefcase className="h-4 w-4" />
        View Placements
        {typeof placementCount === 'number' && (
          <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 text-xs font-medium">
            {placementCount}
          </span>
        )}
      </Link>
    </Button>
  );
}
