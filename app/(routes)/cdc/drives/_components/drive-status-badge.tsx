'use client';

import { Badge } from '@/components/ui/badge';
import type { CdcDriveStatus } from '@/types/cdc';
import { CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';

export const STATUS_BADGE_VARIANT: Record<CdcDriveStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  announced: 'secondary',
  willingness_open: 'default',
  eligibility_locked: 'default',
  attendance_day: 'default',
  results_announced: 'default',
  closed: 'secondary',
  cancelled: 'destructive',
};

export function DriveStatusBadge({ status, className }: { status: CdcDriveStatus; className?: string }) {
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status]} className={className}>
      {CDC_DRIVE_STATUS_LABELS[status]}
    </Badge>
  );
}
