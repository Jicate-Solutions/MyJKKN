'use client';

/**
 * The days picked on a multi-day worked-day claim, one line each: its own
 * "usable until" (worked day + 1 calendar month, the rule hr_comp_off_set_expiry
 * applies per row) or, in red, why that one day cannot be claimed. Submit stays
 * disabled while any line is red — the insert is all-or-nothing.
 */

import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { COMP_OFF_EXPIRY_WARNING_DAYS, addOneMonth, formatIsoDate } from '@/types/hr-comp-off';

export interface ClaimDayRow {
  date: string;
  /** Null when the day can be claimed. */
  problem: string | null;
}

const weekday = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

export function ClaimDaysList({
  rows,
  today,
  onRemove,
}: {
  rows: ClaimDayRow[];
  today: string;
  onRemove: (date: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Pick each day you worked — they do not need to be continuous. One full day is
        earned per day worked, each usable for one month from that day.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border text-sm">
      {rows.map(({ date, problem }) => {
        const expires = addOneMonth(date);
        const left = daysBetween(today, expires);
        return (
          <li key={date} className="flex items-start justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">
                {weekday(date)} {formatIsoDate(date)}
              </p>
              {problem ? (
                <p className="text-xs text-destructive">{problem}</p>
              ) : (
                <p
                  className={cn(
                    'text-xs text-muted-foreground',
                    left <= COMP_OFF_EXPIRY_WARNING_DAYS && 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  Usable until <strong>{formatIsoDate(expires)}</strong>
                  {left <= COMP_OFF_EXPIRY_WARNING_DAYS && ` — only ${left} day(s) left`}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => onRemove(date)}
              aria-label={`Remove ${formatIsoDate(date)}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
