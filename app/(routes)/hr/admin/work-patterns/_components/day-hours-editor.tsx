'use client';

/**
 * The hours a pattern imposes on the days it works.
 *
 * OPTIONAL, AND USUALLY UNTOUCHED. The working-days grid decides WHICH days a
 * member works; a day left on "Institution hours" here keeps whatever the
 * institution's Shift Timings row says for that weekday, which is what almost
 * every pattern wants. This editor exists for the days where the pattern must
 * also restate the hours.
 *
 * The case that motivated it: a visiting consultant who owes ONE HOUR on a
 * Wednesday, worked whenever suits the clinic. Judged against the institution's
 * Dental teaching Wednesday (09:00-13:00 + 11:30-15:30) that hour read as an
 * absence, and with a retainer paid on scheduled days it cost a quarter of the
 * month. Neither a shift timing (institution-wide) nor a day mask (removes days
 * only) could express it.
 *
 * THE TWO MODES ARE EXCLUSIVE, enforced by a CHECK on
 * hr_work_pattern_week_days: a duration day carries minutes and no windows, a
 * window day carries windows and no minutes. The UI never lets them mix, so a
 * mode switch discards the other mode's inputs rather than keeping them warm.
 */

import { Clock } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DAY_OF_WEEK_OPTIONS, type IsoDayOfWeek } from '@/types/hr-shift-timings';
import type { HRWorkPatternDayHours } from '@/types/hr-work-patterns';

/** What the picker offers per day. 'institution' means "no row at all". */
type DayMode = 'institution' | 'duration' | 'span';

interface Props {
  /** The ticked days, in order. Days not ticked cannot carry hours. */
  days: IsoDayOfWeek[];
  /** Only the days that have an override. */
  value: Map<IsoDayOfWeek, HRWorkPatternDayHours>;
  onChange: (next: Map<IsoDayOfWeek, HRWorkPatternDayHours>) => void;
  disabled?: boolean;
}

function blank(day: IsoDayOfWeek, mode: 'duration' | 'span'): HRWorkPatternDayHours {
  return {
    day_of_week: day,
    attendance_mode: mode,
    required_minutes: mode === 'duration' ? 60 : null,
    first_half_start: mode === 'span' ? '09:00' : null,
    first_half_end: mode === 'span' ? '13:00' : null,
    second_half_start: null,
    second_half_end: null,
    grace_minutes: 0,
  };
}

function dayLabel(day: IsoDayOfWeek): string {
  return DAY_OF_WEEK_OPTIONS.find((o) => o.value === day)?.label ?? String(day);
}

export function DayHoursEditor({ days, value, onChange, disabled = false }: Props) {
  const setDay = (day: IsoDayOfWeek, row: HRWorkPatternDayHours | null) => {
    const next = new Map(value);
    if (row === null) next.delete(day);
    else next.set(day, row);
    onChange(next);
  };

  const patch = (day: IsoDayOfWeek, p: Partial<HRWorkPatternDayHours>) => {
    const cur = value.get(day);
    if (!cur) return;
    setDay(day, { ...cur, ...p });
  };

  if (days.length === 0) return null;

  return (
    <div>
      <Label className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        Hours per day
      </Label>
      <p className="mt-1 text-xs text-muted-foreground">
        Leave a day on <strong>Institution hours</strong> unless this pattern needs its own.
        &ldquo;Any time that day&rdquo; asks only for a total — useful for a visiting member
        who owes an hour whenever it suits.
      </p>

      <div className="mt-3 space-y-2">
        {days.map((day) => {
          const row = value.get(day);
          const mode: DayMode = row?.attendance_mode ?? 'institution';

          return (
            <div
              key={day}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
            >
              <span className="w-24 shrink-0 font-medium">{dayLabel(day)}</span>

              <Select
                value={mode}
                disabled={disabled}
                onValueChange={(v) =>
                  setDay(day, v === 'institution' ? null : blank(day, v as 'duration' | 'span'))
                }
              >
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="institution">Institution hours</SelectItem>
                  <SelectItem value="duration">Any time that day</SelectItem>
                  <SelectItem value="span">A set window</SelectItem>
                </SelectContent>
              </Select>

              {mode === 'duration' && row && (
                <span className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    step={15}
                    className="w-24"
                    disabled={disabled}
                    aria-label={`Minutes required on ${dayLabel(day)}`}
                    value={row.required_minutes ?? ''}
                    onChange={(e) =>
                      patch(day, {
                        // '' must become null, not 0: a 0-minute day would make
                        // every punch pair present. The RPC's CHECK refuses it.
                        required_minutes: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                  <span className="text-muted-foreground">
                    minutes, worked at any point
                  </span>
                </span>
              )}

              {mode === 'span' && row && (
                <span className="flex flex-wrap items-center gap-2">
                  <Input
                    type="time"
                    className="w-32"
                    disabled={disabled}
                    aria-label={`Start on ${dayLabel(day)}`}
                    value={row.first_half_start ?? ''}
                    onChange={(e) => patch(day, { first_half_start: e.target.value || null })}
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="time"
                    className="w-32"
                    disabled={disabled}
                    aria-label={`End on ${dayLabel(day)}`}
                    value={row.first_half_end ?? ''}
                    onChange={(e) => patch(day, { first_half_end: e.target.value || null })}
                  />
                  <Input
                    type="number"
                    min={0}
                    className="w-20"
                    disabled={disabled}
                    aria-label={`Grace minutes on ${dayLabel(day)}`}
                    value={row.grace_minutes}
                    onChange={(e) => patch(day, { grace_minutes: Number(e.target.value) || 0 })}
                  />
                  <span className="text-muted-foreground">min grace</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What is wrong with these hours, or null.
 *
 * Mirrors the CHECK on hr_work_pattern_week_days so the operator is told at the
 * form rather than by a constraint violation.
 */
export function validateDayHours(
  value: Map<IsoDayOfWeek, HRWorkPatternDayHours>,
): string | null {
  for (const [day, row] of value) {
    const label = dayLabel(day);
    if (row.attendance_mode === 'duration') {
      if (!row.required_minutes || row.required_minutes <= 0) {
        return `${label}: enter how many minutes are required.`;
      }
    } else {
      if (!row.first_half_start || !row.first_half_end) {
        return `${label}: a set window needs both a start and an end.`;
      }
      if (row.first_half_end <= row.first_half_start) {
        return `${label}: the window must end after it starts.`;
      }
    }
  }
  return null;
}
