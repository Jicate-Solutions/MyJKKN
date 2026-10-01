'use client';

/**
 * CDC drive — "this clashes" callout on the drive form.
 *
 * Director ruling, 2026-09-18: ALLOW-AND-WARN. On 17 Sep the Foxconn India and
 * INDO-MIM drives both ran 10:00–16:00 in Senthuraja Hall on the same day and
 * nothing said a word; 11 learners had said yes to both. So the coordinator is
 * TOLD before they save — and can still save. This component never disables a
 * control and never blocks the submit.
 *
 * It renders nothing at all when there is no date yet, while the check is in
 * flight, when the check fails (a clash warning that cannot load must not look
 * like a clash), or when the day is clear.
 */

import { AlertTriangle, CalendarClock } from 'lucide-react';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useDriveClash } from '@/hooks/cdc/use-drive-clash';

interface Props {
  /** The drive being edited; null while creating. */
  driveId: string | null;
  driveDate: string;
  driveStartTime: string;
  driveEndTime: string;
  venueLabel: string;
  /** Edit mode only: the coordinator has moved the drive onto a different day. */
  dateChanged?: boolean;
}

/** How many clashing drives to name before collapsing into "and N more". */
const MAX_NAMED = 3;

export function DriveClashWarning({
  driveId,
  driveDate,
  driveStartTime,
  driveEndTime,
  venueLabel,
  dateChanged = false,
}: Props) {
  // The coordinator is still typing the venue; do not query on every keystroke.
  const debouncedVenue = useDebounceValue(venueLabel, 400);
  const { data, isLoading, isError } = useDriveClash({
    driveId,
    driveDate,
    driveStartTime,
    driveEndTime,
    venueLabel: debouncedVenue,
  });

  if (isLoading || isError || !data || !data.has_clash) return null;

  const namedVenue = data.venue.slice(0, MAX_NAMED);
  const hiddenVenue = data.venue.length - namedVenue.length;

  const namedImpact = data.learner_impact.slice(0, MAX_NAMED);
  const hiddenImpact = data.learner_impact.length - namedImpact.length;

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 space-y-2">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            This drive clashes with another one. You can still save it.
          </p>

          {namedVenue.length > 0 ? (
            <ul className="space-y-1 text-amber-900/90 dark:text-amber-200/90">
              {namedVenue.map((v) => (
                <li key={`venue-${v.drive_id}`}>
                  <strong>{v.venue_label}</strong> is already booked {v.start_time}–{v.end_time}{' '}
                  that day by <strong>{v.title}</strong>.
                </li>
              ))}
              {hiddenVenue > 0 ? (
                <li>
                  …and {hiddenVenue} more {hiddenVenue === 1 ? 'drive' : 'drives'} in the same venue.
                </li>
              ) : null}
            </ul>
          ) : null}

          {data.learners_affected > 0 ? (
            <div className="text-amber-900/90 dark:text-amber-200/90">
              <p>
                <strong>
                  {data.learners_affected}{' '}
                  {data.learners_affected === 1 ? 'learner has' : 'learners have'}
                </strong>{' '}
                already said yes to another drive that day
                {namedImpact.length > 0 ? (
                  <>
                    {' '}
                    ({namedImpact.map((l) => `${l.title} — ${l.willing_count}`).join(', ')}
                    {hiddenImpact > 0 ? `, and ${hiddenImpact} more` : ''})
                  </>
                ) : null}
                . They cannot attend both.
              </p>
            </div>
          ) : null}

          {dateChanged && data.own_willing_count > 0 ? (
            <p className="flex items-start gap-1.5 text-amber-900/90 dark:text-amber-200/90">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                You are moving the date of a drive{' '}
                <strong>
                  {data.own_willing_count}{' '}
                  {data.own_willing_count === 1 ? 'learner has' : 'learners have'}
                </strong>{' '}
                already said yes to.
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
