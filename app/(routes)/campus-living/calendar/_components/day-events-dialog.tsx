'use client';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatLongDate } from './calendar-utils';
import {
  CALENDAR_SOURCE_META,
  type CalendarEvent,
} from '@/types/campus-living/calendar';

interface DayEventsDialogProps {
  isoDate: string | null;
  events: CalendarEvent[];
  onClose: () => void;
}

/**
 * Drill-down link target for each source. Read-only — calendar surfaces
 * the events; users click through to the owning module to act on them.
 */
function hrefFor(event: CalendarEvent): string {
  switch (event.source) {
    case 'leave':
      return `/campus-living/leave?focus=${event.sourceId}`;
    case 'gate-pass':
      return `/campus-living/gate-pass?focus=${event.sourceId}`;
    case 'maintenance':
      return `/campus-living/maintenance?focus=${event.sourceId}`;
    case 'incident':
      return `/campus-living/incidents?focus=${event.sourceId}`;
    case 'mess':
      return `/campus-living/mess?focus=${event.sourceId}`;
    default:
      return '/campus-living';
  }
}

export function DayEventsDialog({ isoDate, events, onClose }: DayEventsDialogProps) {
  const open = Boolean(isoDate);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isoDate ? formatLongDate(isoDate) : ''}</DialogTitle>
          <DialogDescription>
            {events.length === 0
              ? 'No events on this day.'
              : `${events.length} event${events.length === 1 ? '' : 's'} on this day. Click an event to open its source page.`}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
          {events.map((event) => {
            const meta = CALENDAR_SOURCE_META[event.source];
            return (
              <li key={event.id}>
                <Link
                  href={hrefFor(event)}
                  className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/60 transition-colors"
                >
                  <span
                    className={cn(
                      'mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full',
                      meta.dotClass,
                    )}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium truncate">{event.title}</span>
                      <Badge variant="outline" className={cn('text-[10px]', meta.chipClass)}>
                        {meta.label}
                      </Badge>
                      {event.status && (
                        <Badge variant="secondary" className="text-[10px]">
                          {event.status}
                        </Badge>
                      )}
                    </div>
                    {event.subtitle && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {event.subtitle}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
