'use client';

// Entitlement header — tier badge + weekly quota meter for the resident
// housekeeping slot-booking page. Data comes from useMyEntitlement()
// (hooks/campus-living/use-housekeeping-bookings.ts).

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sparkles, BedDouble } from 'lucide-react';

interface Props {
  tierKey: string | null;
  /** hostel_categories.name — what the resident calls their room. */
  categoryName?: string | null;
  weeklyQuota: number;
  usedThisWeek: number;
  blockName: string;
  roomNumber: string;
}

const TIER_LABELS: Record<string, string> = {
  standard: 'Standard',
  premium: 'Premium',
  premium_plus: 'Premium Plus',
};

export function EntitlementHeader({
  tierKey,
  categoryName,
  weeklyQuota,
  usedThisWeek,
  blockName,
  roomNumber,
}: Props) {
  // The room category is the name on the resident's fee receipt ("Premium
  // Room + AC"); the tier key is the internal entitlement band it maps to.
  // Show the former when we have it.
  const tierLabel =
    categoryName || (tierKey && TIER_LABELS[tierKey]) || tierKey || 'Standard';
  const pct = weeklyQuota > 0 ? Math.min(100, (usedThisWeek / weeklyQuota) * 100) : 0;
  const remaining = Math.max(0, weeklyQuota - usedThisWeek);

  return (
    <Card>
      <CardContent className='p-4 space-y-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2 min-w-0 text-sm text-muted-foreground'>
            <BedDouble className='h-4 w-4 shrink-0' />
            <span className='truncate'>
              {blockName || 'Block —'}
              {roomNumber ? `, Room ${roomNumber}` : ''}
            </span>
          </div>
          <Badge variant='secondary' className='shrink-0 gap-1'>
            <Sparkles className='h-3 w-3 text-amber-500' />
            {tierLabel}
          </Badge>
        </div>

        <div className='space-y-1.5'>
          <div className='flex items-center justify-between text-sm'>
            <span className='font-medium'>
              {usedThisWeek} of {weeklyQuota} cleanings used this week
            </span>
            <span className='text-xs text-muted-foreground'>
              {remaining === 0 ? 'None left' : `${remaining} left`}
            </span>
          </div>
          <Progress value={pct} className='h-2' />
        </div>
      </CardContent>
    </Card>
  );
}
