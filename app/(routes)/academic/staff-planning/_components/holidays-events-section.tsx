'use client';

import moment from 'moment';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCalendarItems } from '@/hooks/calendar/use-calendar';
import type { CalendarItem } from '@/types/calendar';

const KIND_LABELS: Record<string, string> = {
  holiday: 'Holiday',
  event: 'Event',
};

/** Human-readable date/range for a calendar item ("D MMM" or "D MMM – D MMM"). */
function formatWhen(item: CalendarItem): string {
  const start = moment(item.start_at);
  const end = moment(item.end_at);
  return start.isSame(end, 'day')
    ? start.format('D MMM YYYY')
    : `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`;
}

interface HolidaysEventsSectionProps {
  institutionId?: string;
}

/**
 * Compact "Holidays & Events" list scoped to the selected institution, so
 * staff planning stays aware of upcoming public holidays and events without
 * leaving the page. Reuses the global Calendar module's fn_calendar_items
 * resolver (via useCalendarItems) rather than a new holiday mechanism.
 */
export function HolidaysEventsSection({ institutionId }: HolidaysEventsSectionProps) {
  const start = moment().format('YYYY-MM-DD');
  const end = moment().add(60, 'days').format('YYYY-MM-DD');

  const { data: items = [], isLoading } = useCalendarItems({
    institutionIds: institutionId ? [institutionId] : null,
    start,
    end,
    kinds: ['holiday', 'event'],
  });

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base font-semibold'>
          <CalendarDays className='h-4 w-4 text-muted-foreground' />
          Holidays & Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='space-y-2'>
            <Skeleton className='h-5 w-full' />
            <Skeleton className='h-5 w-3/4' />
          </div>
        ) : items.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No public holidays or events in the next 60 days.
          </p>
        ) : (
          <ul className='space-y-2'>
            {items
              .slice()
              .sort((a, b) => a.start_at.localeCompare(b.start_at))
              .map((item) => (
                <li
                  key={item.item_id}
                  className='flex flex-wrap items-center gap-2 text-sm'
                >
                  <span
                    className='h-2 w-2 shrink-0 rounded-full'
                    style={{ backgroundColor: item.color_code || '#6b7280' }}
                    aria-hidden
                  />
                  <span className='font-medium'>{item.title}</span>
                  <Badge variant='secondary' className='capitalize'>
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </Badge>
                  <span className='text-muted-foreground'>{formatWhen(item)}</span>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
