'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import type { CleaningTypeWithDetail, UsagePeriod } from '@/types/campus-living/housekeeping';

const PERIOD_LABEL: Record<UsagePeriod, string> = {
  day: 'today',
  week: 'this week',
  month: 'this month',
};

interface Props {
  types: CleaningTypeWithDetail[];
  remainingByType: Map<string, number>;
  selectedId: string | null;
  onSelect: (type: CleaningTypeWithDetail) => void;
}

export function TypePicker({ types, remainingByType, selectedId, onSelect }: Props) {
  return (
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
      {types.map((t) => {
        const remaining = remainingByType.get(t.id) ?? t.usage_limit_count;
        const exhausted = remaining <= 0;
        const selected = t.id === selectedId;

        return (
          <Card
            key={t.id}
            role='button'
            tabIndex={exhausted ? -1 : 0}
            aria-disabled={exhausted}
            onClick={() => !exhausted && onSelect(t)}
            onKeyDown={(e) => {
              if (!exhausted && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(t);
              }
            }}
            className={[
              'transition-colors',
              exhausted ? 'opacity-60' : 'cursor-pointer hover:bg-accent',
              selected ? 'border-primary ring-1 ring-primary' : '',
            ].join(' ')}
          >
            <CardContent className='space-y-2 p-4'>
              <div className='flex items-start justify-between gap-2'>
                <span className='font-medium'>{t.name}</span>
                <Badge variant='secondary' className='shrink-0'>
                  <Clock className='mr-1 h-3 w-3' />
                  {t.duration_minutes} min
                </Badge>
              </div>

              {t.description && (
                <p className='text-sm text-muted-foreground'>{t.description}</p>
              )}

              {/* "shared with your roommates" is the part learners misread: the
                  quota belongs to the ROOM, not to the person booking. */}
              {exhausted ? (
                <p className='text-sm text-destructive'>
                  Your room has used its bookings {PERIOD_LABEL[t.usage_period]}.
                </p>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {remaining} of {t.usage_limit_count} left {PERIOD_LABEL[t.usage_period]} —
                  shared with your roommates.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
