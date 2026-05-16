'use client';

import { Badge } from '@/components/ui/badge';
import type { CiaRound, EntryWindowStatus } from '@/types/internal-marks';
import { getEntryWindowStatus, resolveRoundDates } from '@/types/internal-marks';

// 4-state styling per COE integration spec §6.4 — emerald/red/amber/grey dot
// with state-specific suffix label. The dot is rendered as a leading span so
// it works inside our Badge component without restructuring it.
const DOT_CLASS: Record<EntryWindowStatus, string> = {
  open: 'bg-emerald-500',
  expired: 'bg-red-500',
  upcoming: 'bg-amber-500',
  'no-dates': 'bg-gray-400',
};

const VARIANT: Record<EntryWindowStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  expired: 'destructive',
  upcoming: 'secondary',
  'no-dates': 'outline',
};

function statusLabel(status: EntryWindowStatus, round: CiaRound): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'expired':
      return 'Closed';
    case 'upcoming': {
      const { entryFrom } = resolveRoundDates(round);
      return entryFrom ? `Opens ${entryFrom}` : 'Upcoming';
    }
    case 'no-dates':
      return '';
  }
}

interface EntryWindowBadgeProps {
  round: CiaRound;
}

export function EntryWindowBadge({ round }: EntryWindowBadgeProps) {
  const status = getEntryWindowStatus(round);
  const label = statusLabel(status, round);
  if (!label) return null;

  return (
    <Badge variant={VARIANT[status]} className='flex items-center gap-1.5 text-xs'>
      <span className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[status]}`} />
      <span>{label}</span>
    </Badge>
  );
}
