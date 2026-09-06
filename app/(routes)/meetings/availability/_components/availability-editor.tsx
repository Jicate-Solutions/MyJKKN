'use client';

// app/(routes)/meetings/availability/_components/availability-editor.tsx
//
// NATIVE weekly-availability editor for the "My Availability" page.
// Replaces the broken cross-origin Cal.com iframe with a first-class MyJKKN UI.
//
// What it edits (MVP):
//   - Weekly RECURRING working hours: 7 days (Mon–Sun), each with an enabled
//     toggle and one OR MORE start/end time ranges (add/remove per day).
//   - The schedule timezone.
//
// What it intentionally does NOT edit (handled by a sibling component):
//   - Date-specific overrides (holidays, one-off changes) live in
//     holidays-editor.tsx (M2). saveMySchedule only touches the weekly windows,
//     so the two editors never clobber each other.
//
// Data model bridge:
//   Cal.com stores availability as windows keyed by a `days[]` array
//   (e.g. one window { days:[Mon..Fri], 09:00–17:00 }). A weekly editor is
//   easier to reason about PER DAY, so on load we EXPAND windows into per-day
//   ranges, and on save we COLLAPSE per-day ranges back into Cal.com windows
//   (merging days that share an identical set of ranges). Round-trips cleanly.
//
// All saves go through the saveMySchedule server action — the API key stays
// server-side. Explicit loading / empty / error states everywhere (rule #27).

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Clock, Save, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  CalComDayOfWeek,
  CalComScheduleAvailability,
} from '@/lib/services/integrations/cal-com-api-client';
import { saveMySchedule, type MyScheduleData } from '../actions';

// ──────────────────────────────────────────────────────────────────────────
// Day model — render Mon→Sun (Cal.com weekStart is Monday)
// ──────────────────────────────────────────────────────────────────────────

const DAYS: { key: CalComDayOfWeek; label: string; short: string }[] = [
  { key: 'Monday', label: 'Monday', short: 'Mon' },
  { key: 'Tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'Wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'Thursday', label: 'Thursday', short: 'Thu' },
  { key: 'Friday', label: 'Friday', short: 'Fri' },
  { key: 'Saturday', label: 'Saturday', short: 'Sat' },
  { key: 'Sunday', label: 'Sunday', short: 'Sun' },
];

/** A single contiguous time range within a day. */
interface TimeRange {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/** Per-day editor state: enabled flag + the ranges for that day. */
type WeeklyState = Record<CalComDayOfWeek, TimeRange[]>;

// A reasonable common timezone list for an Indian institution + a few globals.
const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

const DEFAULT_RANGE: TimeRange = { start: '09:00', end: '17:00' };

// ──────────────────────────────────────────────────────────────────────────
// Expand / collapse between Cal.com windows and per-day editor state
// ──────────────────────────────────────────────────────────────────────────

function expandToWeekly(windows: CalComScheduleAvailability[]): WeeklyState {
  const state = {} as WeeklyState;
  for (const d of DAYS) state[d.key] = [];

  for (const w of windows) {
    for (const day of w.days) {
      if (!state[day]) state[day] = [];
      state[day].push({ start: w.startTime, end: w.endTime });
    }
  }

  // Keep each day's ranges sorted by start time for stable display.
  for (const d of DAYS) {
    state[d.key].sort((a, b) => a.start.localeCompare(b.start));
  }
  return state;
}

function collapseToWindows(state: WeeklyState): CalComScheduleAvailability[] {
  // Group days by an identical signature of their ranges so days that share
  // the same hours collapse into one Cal.com window.
  const bySignature = new Map<string, { days: CalComDayOfWeek[]; ranges: TimeRange[] }>();

  for (const d of DAYS) {
    const ranges = state[d.key];
    if (!ranges || ranges.length === 0) continue; // disabled day → no window
    const signature = ranges.map((r) => `${r.start}-${r.end}`).join('|');
    const bucket = bySignature.get(signature);
    if (bucket) bucket.days.push(d.key);
    else bySignature.set(signature, { days: [d.key], ranges });
  }

  const windows: CalComScheduleAvailability[] = [];
  for (const { days, ranges } of bySignature.values()) {
    for (const r of ranges) {
      windows.push({ days, startTime: r.start, endTime: r.end });
    }
  }
  return windows;
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

interface AvailabilityEditorProps {
  schedule: MyScheduleData;
}

export function AvailabilityEditor({ schedule }: AvailabilityEditorProps) {
  const initialWeekly = useMemo(
    () => expandToWeekly(schedule.availability),
    [schedule.availability],
  );

  const [weekly, setWeekly] = useState<WeeklyState>(initialWeekly);
  const [timeZone, setTimeZone] = useState<string>(schedule.timeZone || 'Asia/Kolkata');
  const [dirty, setDirty] = useState(false);
  const [isSaving, startSaving] = useTransition();

  // Cal.com may store a timezone not in our short list — include it so the
  // Select can show the current value.
  const tzOptions = useMemo(() => {
    const set = new Set(TIMEZONES);
    if (timeZone) set.add(timeZone);
    return Array.from(set);
  }, [timeZone]);

  function markDirty(next: WeeklyState) {
    setWeekly(next);
    setDirty(true);
  }

  function toggleDay(day: CalComDayOfWeek, enabled: boolean) {
    const next = { ...weekly, [day]: enabled ? [{ ...DEFAULT_RANGE }] : [] };
    markDirty(next);
  }

  function addRange(day: CalComDayOfWeek) {
    const existing = weekly[day] ?? [];
    // New range starts where the last one ends (or default) for sensible UX.
    const last = existing[existing.length - 1];
    const newRange: TimeRange = last
      ? { start: last.end, end: minTime(last.end, '23:59') }
      : { ...DEFAULT_RANGE };
    markDirty({ ...weekly, [day]: [...existing, newRange] });
  }

  function removeRange(day: CalComDayOfWeek, index: number) {
    const existing = weekly[day] ?? [];
    const next = existing.filter((_, i) => i !== index);
    markDirty({ ...weekly, [day]: next });
  }

  function updateRange(
    day: CalComDayOfWeek,
    index: number,
    field: 'start' | 'end',
    value: string,
  ) {
    const existing = weekly[day] ?? [];
    const next = existing.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    markDirty({ ...weekly, [day]: next });
  }

  function changeTimeZone(tz: string) {
    setTimeZone(tz);
    setDirty(true);
  }

  // Client-side validation mirrors the server action so we fail fast with a
  // clear message instead of a round-trip.
  function validate(): string | null {
    for (const d of DAYS) {
      const ranges = weekly[d.key] ?? [];
      for (const r of ranges) {
        if (!r.start || !r.end) return `${d.label}: every range needs a start and end time.`;
        if (r.start >= r.end)
          return `${d.label}: start time (${r.start}) must be before end time (${r.end}).`;
      }
    }
    return null;
  }

  function handleSave() {
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const windows = collapseToWindows(weekly);

    startSaving(async () => {
      const result = await saveMySchedule(schedule.scheduleId, windows, timeZone);
      if (result.success) {
        toast.success('Availability saved.');
        setDirty(false);
      } else {
        toast.error(result.error ?? 'Failed to save your availability.');
      }
    });
  }

  const noDaysEnabled = DAYS.every((d) => (weekly[d.key]?.length ?? 0) === 0);

  return (
    <div className="space-y-4">
      {/* Timezone + save bar */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <Label htmlFor="tz-select" className="text-xs font-medium text-muted-foreground">
              Timezone
            </Label>
            <Select value={timeZone} onValueChange={changeTimeZone}>
              <SelectTrigger id="tz-select" className="w-full sm:w-64">
                <SelectValue placeholder="Select a timezone" />
              </SelectTrigger>
              <SelectContent>
                {tzOptions.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              All times below are interpreted in this timezone.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                Unsaved changes
              </span>
            ) : null}
            <Button onClick={handleSave} disabled={isSaving || !dirty}>
              <Save className="mr-1.5 h-4 w-4" aria-hidden />
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Weekly grid */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            {/* Name the set being edited — a host may keep more than one. */}
            {schedule.name ? `Weekly hours — ${schedule.name}` : 'Weekly hours'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-2 sm:p-4">
          {DAYS.map((d) => {
            const ranges = weekly[d.key] ?? [];
            const enabled = ranges.length > 0;
            return (
              <div
                key={d.key}
                className="flex flex-col gap-3 rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-accent/30 sm:flex-row sm:items-start"
              >
                {/* Day toggle */}
                <div className="flex w-full items-center gap-3 sm:w-44 sm:shrink-0 sm:pt-1.5">
                  <Switch
                    id={`day-${d.key}`}
                    checked={enabled}
                    onCheckedChange={(v) => toggleDay(d.key, v)}
                    aria-label={`Toggle availability on ${d.label}`}
                  />
                  <Label
                    htmlFor={`day-${d.key}`}
                    className={
                      enabled
                        ? 'text-sm font-medium'
                        : 'text-sm font-medium text-muted-foreground'
                    }
                  >
                    {d.label}
                  </Label>
                </div>

                {/* Ranges */}
                <div className="min-w-0 flex-1 space-y-2">
                  {!enabled ? (
                    <p className="pt-1.5 text-sm text-muted-foreground">Unavailable</p>
                  ) : (
                    <>
                      {ranges.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={r.start}
                            onChange={(e) => updateRange(d.key, i, 'start', e.target.value)}
                            className="min-w-0 flex-1 sm:w-32 sm:flex-none"
                            aria-label={`${d.label} range ${i + 1} start time`}
                          />
                          <span className="text-sm text-muted-foreground">–</span>
                          <Input
                            type="time"
                            value={r.end}
                            onChange={(e) => updateRange(d.key, i, 'end', e.target.value)}
                            className="min-w-0 flex-1 sm:w-32 sm:flex-none"
                            aria-label={`${d.label} range ${i + 1} end time`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRange(d.key, i)}
                            aria-label={`Remove ${d.label} range ${i + 1}`}
                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addRange(d.key)}
                        className="h-8 text-xs text-muted-foreground"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                        Add time range
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {noDaysEnabled ? (
            <p className="px-1 pt-2 text-xs text-muted-foreground">
              No days are enabled — you are currently unavailable for any bookings. Toggle a
              day on to add bookable hours.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] text-muted-foreground">
        These are your recurring weekly hours. For date-specific changes (holidays,
        one-off closures or special hours) use the editor below.
      </p>
    </div>
  );
}

/** Clamp helper — returns the smaller of two "HH:mm" strings. */
function minTime(a: string, b: string): string {
  return a < b ? a : b;
}
