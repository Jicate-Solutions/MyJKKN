'use client';

import moment from 'moment';
import { CalendarDays, Clock, Building2, User, Tag, Info, AlarmClockOff } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { CalendarItem } from '@/types/calendar';

// Friendly labels for the underlying source feeds.
const KIND_LABELS: Record<string, string> = {
  holiday: 'Holiday',
  event: 'Event',
  meeting: 'Meeting',
  leave: 'Leave',
  reservation: 'Reservation',
};

/** Build a human-readable "when" string from the item's range + all-day flag. */
function formatWhen(item: CalendarItem): string {
  // All-day ranges are stored UTC-anchored (00:00:00Z → 23:59:59.999Z), so read
  // them back in UTC — browser-local parsing rolls the end into the next day
  // east of UTC and reports a 1-day holiday as a 2-day range.
  const start = item.all_day ? moment.utc(item.start_at) : moment(item.start_at);
  const end = item.all_day ? moment.utc(item.end_at) : moment(item.end_at);

  if (item.all_day) {
    return start.isSame(end, 'day')
      ? start.format('dddd, D MMMM YYYY')
      : `${start.format('D MMM YYYY')} – ${end.format('D MMM YYYY')}`;
  }

  if (start.isSame(end, 'day')) {
    return `${start.format('dddd, D MMMM YYYY')} · ${start.format('h:mm A')} – ${end.format('h:mm A')}`;
  }
  return `${start.format('D MMM YYYY, h:mm A')} – ${end.format('D MMM YYYY, h:mm A')}`;
}

/** Pull a display-worthy status off the resolver's `meta` blob, if present. */
function metaStatus(item: CalendarItem): string | null {
  const status = item.meta?.status;
  return typeof status === 'string' && status.length > 0 ? status : null;
}

interface EventDetailDialogProps {
  item: CalendarItem | null;
  onClose: () => void;
}

/**
 * Read-only detail panel for a calendar item. Opens when the user clicks an
 * event in the calendar grid; the parent passes the clicked item (or null to
 * keep it closed). All data comes from the already-fetched CalendarItem — no
 * extra request.
 */
export function EventDetailDialog({ item, onClose }: EventDetailDialogProps) {
  const color = item?.color_code || '#6b7280';
  const status = item ? metaStatus(item) : null;

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        {item && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <DialogTitle className="text-base leading-snug">{item.title}</DialogTitle>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="capitalize">
                      {KIND_LABELS[item.kind] ?? item.kind}
                    </Badge>
                    {item.category && (
                      <Badge variant="outline" className="gap-1">
                        <Tag className="h-3 w-3" />
                        {item.category}
                      </Badge>
                    )}
                    {status && (
                      <Badge
                        variant={status.toLowerCase() === 'cancelled' ? 'destructive' : 'outline'}
                        className="capitalize"
                      >
                        {status}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <Separator />

            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="When">
                  {formatWhen(item)}
                  {item.all_day && (
                    <Badge variant="secondary" className="ml-2 align-middle text-[10px]">All day</Badge>
                  )}
                </DetailRow>

                {item.person_name && (
                  <DetailRow icon={<User className="h-4 w-4" />} label="Person">
                    {item.person_name}
                  </DetailRow>
                )}

                {item.institution_name && (
                  <DetailRow icon={<Building2 className="h-4 w-4" />} label="Institution">
                    {item.institution_name}
                  </DetailRow>
                )}

                {item.blocks_attendance && (
                  <DetailRow icon={<AlarmClockOff className="h-4 w-4" />} label="Attendance">
                    Blocks attendance on these dates
                  </DetailRow>
                )}

                {item.description && (
                  <DetailRow icon={<Info className="h-4 w-4" />} label="Details">
                    <span className="whitespace-pre-wrap">{item.description}</span>
                  </DetailRow>
                )}
              </div>
            </DialogDescription>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 break-words">{children}</div>
      </div>
    </div>
  );
}
