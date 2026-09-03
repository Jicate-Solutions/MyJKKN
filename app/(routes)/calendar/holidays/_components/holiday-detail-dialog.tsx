'use client';

/**
 * Read-only detail panel for one calendar_entries row.
 *
 * A SIBLING of _components/event-detail-dialog.tsx, not a reuse of it. That one
 * renders a CalendarItem — the flattened fn_calendar_items row, which carries a
 * single `institution_name` and a category NAME. A calendar_entries row scopes
 * to an ARRAY of institutions (or the NULL "everyone" sentinel) and additionally
 * owns is_active, visibility and its audit timestamps. Feeding an entry through
 * the item-shaped dialog would flatten the scope to one name and drop exactly
 * the fields an admin opens this to check.
 *
 * All data comes from the already-fetched row — no extra request.
 */

import moment from 'moment';
import {
  AlarmClockOff,
  Building2,
  CalendarDays,
  Eye,
  History,
  Info,
  Link2,
  MapPin,
  PencilLine,
  Power,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import type { CalendarCategory, CalendarEntry } from '@/types/calendar';

import { dayCount, isCommonScope, isMultiDay } from './holiday-filters';

const KIND_LABELS: Record<string, string> = {
  holiday: 'Holiday',
  event: 'Event',
  meeting: 'Meeting',
};

/**
 * All-day ranges are stored UTC-anchored (00:00:00Z → 23:59:59.999Z), so they
 * are read back in UTC — browser-local parsing rolls the end into the next day
 * east of UTC and reports a 1-day holiday as a 2-day range.
 */
function formatWhen(e: CalendarEntry): string {
  const start = e.all_day ? moment.utc(e.start_at) : moment(e.start_at);
  const end = e.all_day ? moment.utc(e.end_at) : moment(e.end_at);

  if (e.all_day) {
    return isMultiDay(e)
      ? `${start.format('D MMM YYYY')} – ${end.format('D MMM YYYY')}`
      : start.format('dddd, D MMMM YYYY');
  }
  if (start.isSame(end, 'day')) {
    return `${start.format('dddd, D MMMM YYYY')} · ${start.format('h:mm A')} – ${end.format('h:mm A')}`;
  }
  return `${start.format('D MMM YYYY, h:mm A')} – ${end.format('D MMM YYYY, h:mm A')}`;
}

export function HolidayDetailDialog({
  entry,
  categories,
  institutionNames,
  canManage,
  onClose,
  onEdit,
}: {
  /** The clicked row, or null to keep the dialog closed. */
  entry: CalendarEntry | null;
  categories: CalendarCategory[];
  institutionNames: Map<string, string>;
  canManage: boolean;
  onClose: () => void;
  onEdit: (e: CalendarEntry) => void;
}) {
  const category = entry?.category_id
    ? categories.find((c) => c.id === entry.category_id)
    : undefined;
  // The entry's own colour wins; the category's is the fallback, so the dot
  // matches the chip this entry draws on /calendar.
  const color = entry?.color_code || category?.color_code || '#6b7280';

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md'>
        {entry && (
          <>
            {/* pr-10 clears DialogContent's built-in close ✕, which is
                positioned `absolute right-4 top-4` — with p-0 on the content a
                long title runs straight under it. */}
            <DialogHeader className='border-b px-6 py-4 pr-10 text-left'>
              <div className='flex items-start gap-3'>
                <span
                  className='mt-1.5 h-3 w-3 shrink-0 rounded-full'
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <div className='min-w-0'>
                  <DialogTitle className='text-base leading-snug'>{entry.title}</DialogTitle>
                  <div className='mt-1.5 flex flex-wrap gap-1.5'>
                    <Badge variant='secondary'>
                      {KIND_LABELS[entry.kind] ?? entry.kind}
                    </Badge>
                    {category && (
                      <Badge
                        variant='outline'
                        style={{ borderColor: category.color_code, color: category.color_code }}
                      >
                        {category.name}
                      </Badge>
                    )}
                    {!entry.is_active && <Badge variant='secondary'>Inactive</Badge>}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className='space-y-3 overflow-y-auto px-6 py-4 text-sm'>
              <DetailRow icon={<CalendarDays className='h-4 w-4' />} label='When'>
                {formatWhen(entry)}
                {entry.all_day && (
                  <Badge variant='secondary' className='ml-2 align-middle text-[10px]'>
                    All day
                  </Badge>
                )}
                {isMultiDay(entry) && (
                  <span className='ml-2 text-xs text-muted-foreground'>
                    {dayCount(entry)} days
                  </span>
                )}
              </DetailRow>

              <DetailRow icon={<Building2 className='h-4 w-4' />} label='Applies to'>
                {isCommonScope(entry) ? (
                  <span>
                    All institutions
                    <span className='block text-xs text-muted-foreground'>
                      Common entry — observed group-wide.
                    </span>
                  </span>
                ) : (
                  <div className='flex flex-wrap gap-1'>
                    {(entry.scope_institution_ids ?? []).map((id) => (
                      <Badge key={id} variant='outline' className='font-normal'>
                        {institutionNames.get(id) ?? 'Unknown institution'}
                      </Badge>
                    ))}
                  </div>
                )}
              </DetailRow>

              {entry.kind === 'holiday' && (
                <DetailRow icon={<AlarmClockOff className='h-4 w-4' />} label='Attendance'>
                  {entry.blocks_attendance
                    ? 'Blocks attendance marking on these dates'
                    : 'Does not block attendance marking'}
                </DetailRow>
              )}

              {entry.location && (
                <DetailRow icon={<MapPin className='h-4 w-4' />} label='Location'>
                  {entry.location}
                </DetailRow>
              )}

              {entry.meeting_url && (
                <DetailRow icon={<Link2 className='h-4 w-4' />} label='Meeting link'>
                  {/* Author-supplied URL, so it opens isolated from this tab. */}
                  <a
                    href={entry.meeting_url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='break-all text-primary hover:underline'
                  >
                    {entry.meeting_url}
                  </a>
                </DetailRow>
              )}

              {/* 'public' is the default on every live row, so it is only worth
                  a line when it is something else. */}
              {entry.visibility !== 'public' && (
                <DetailRow icon={<Eye className='h-4 w-4' />} label='Visibility'>
                  <span className='capitalize'>{entry.visibility}</span>
                </DetailRow>
              )}

              <DetailRow icon={<Power className='h-4 w-4' />} label='Status'>
                {entry.is_active
                  ? 'Active — showing on the calendar'
                  : 'Inactive — on record, but off the calendar'}
              </DetailRow>

              {entry.description && (
                <DetailRow icon={<Info className='h-4 w-4' />} label='Details'>
                  <span className='whitespace-pre-wrap'>{entry.description}</span>
                </DetailRow>
              )}

              <Separator />

              {/* created_by is a bare uuid on this table — resolving it to a
                  name needs a profiles join the list query does not make, so
                  the timestamps stand alone rather than printing an id. */}
              <DetailRow icon={<History className='h-4 w-4' />} label='Record'>
                <span className='text-xs text-muted-foreground'>
                  Created {moment(entry.created_at).format('D MMM YYYY, h:mm A')}
                  {entry.updated_at !== entry.created_at && (
                    <> · Updated {moment(entry.updated_at).format('D MMM YYYY, h:mm A')}</>
                  )}
                </span>
              </DetailRow>
            </div>

            <DialogFooter className='border-t px-6 py-4'>
              <Button variant='outline' onClick={onClose}>
                Close
              </Button>
              {canManage && (
                <Button onClick={() => onEdit(entry)}>
                  <PencilLine className='mr-2 h-4 w-4' />
                  Edit
                </Button>
              )}
            </DialogFooter>
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
    <div className='flex gap-3'>
      <span className='mt-0.5 shrink-0 text-muted-foreground' aria-hidden>
        {icon}
      </span>
      <div className='min-w-0'>
        <p className='text-xs font-medium text-muted-foreground'>{label}</p>
        <div className='mt-0.5 break-words'>{children}</div>
      </div>
    </div>
  );
}
