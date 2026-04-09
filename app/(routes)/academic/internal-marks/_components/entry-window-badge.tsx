'use client';

import { Badge } from '@/components/ui/badge';
import type { CiaRound, EntryWindowStatus } from '@/types/internal-marks';
import { getEntryWindowStatus } from '@/types/internal-marks';

const STATUS_CONFIG: Record<
  EntryWindowStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' }
> = {
  open: { label: 'Entry Open', variant: 'default' },
  upcoming: { label: 'Upcoming', variant: 'secondary' },
  closed: { label: 'Entry Closed', variant: 'destructive' },
};

interface EntryWindowBadgeProps {
  round: CiaRound;
}

export function EntryWindowBadge({ round }: EntryWindowBadgeProps) {
  const status = getEntryWindowStatus(round);
  const config = STATUS_CONFIG[status];

  return (
    <Badge variant={config.variant} className='text-xs'>
      {config.label}
    </Badge>
  );
}
