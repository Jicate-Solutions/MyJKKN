'use client';

// Schedule tab — WHEN IT RUNS.
//
// Lifted verbatim from the old single-step form. These day(s) and hours ARE the
// room booking: the spine holds this window on EACH day of the event, never one
// continuous multi-day block. The registration window is a separate tab —
// keeping the two apart is the whole point (they used to be the same pair of
// inputs, which held rooms for weeks).

import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { EventCreateForm } from './event-create-form';

export function ScheduleTab({
  form,
  set,
  multiDay,
  onMultiDayChange,
  offCampus,
  daySlotCount,
  badDayRange,
  badTimes,
  tooManyDays,
  maxDays,
}: {
  form: EventCreateForm;
  set: <K extends keyof EventCreateForm>(field: K, value: EventCreateForm[K]) => void;
  multiDay: boolean;
  onMultiDayChange: (next: boolean) => void;
  offCampus: boolean;
  daySlotCount: number;
  badDayRange: boolean;
  badTimes: boolean;
  tooManyDays: boolean;
  maxDays: number;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 opacity-60" /> When it runs
        </Label>
        <label
          htmlFor="multi-day"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          Runs over several days
          <Switch id="multi-day" checked={multiDay} onCheckedChange={onMultiDayChange} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="event_date" className="text-xs">
            {multiDay ? 'First day' : 'Event date'}
            {!offCampus && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id="event_date"
            type="date"
            value={form.event_date}
            onChange={(e) => set('event_date', e.target.value)}
          />
        </div>
        {multiDay && (
          <div className="space-y-1.5">
            <Label htmlFor="last_day" className="text-xs">
              Last day
            </Label>
            <Input
              id="last_day"
              type="date"
              min={form.event_date || undefined}
              value={form.last_day}
              onChange={(e) => set('last_day', e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="start_time" className="text-xs">
            Starts at
            {!offCampus && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id="start_time"
            type="time"
            value={form.start_time}
            onChange={(e) => set('start_time', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_time" className="text-xs">
            Ends at
            {!offCampus && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id="end_time"
            type="time"
            value={form.end_time}
            onChange={(e) => set('end_time', e.target.value)}
          />
        </div>
      </div>

      {badDayRange && (
        <p className="text-xs text-destructive">
          The last day must be on or after the first day.
        </p>
      )}
      {tooManyDays && (
        <p className="text-xs text-destructive">
          An event can span at most {maxDays} days — split a longer programme into
          separate events.
        </p>
      )}
      {badTimes && (
        <p className="text-xs text-destructive">
          The end time must be after the start time.
        </p>
      )}
      {!offCampus && daySlotCount > 0 && !badTimes && (
        <p className="text-xs text-muted-foreground">
          {daySlotCount > 1
            ? `The room is held for these hours on each of the ${daySlotCount} days — it stays free outside them.`
            : 'The room is held for exactly these hours — it stays free outside them.'}
        </p>
      )}
    </div>
  );
}
