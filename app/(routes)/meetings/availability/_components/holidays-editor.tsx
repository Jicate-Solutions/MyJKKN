'use client';

// app/(routes)/meetings/availability/_components/holidays-editor.tsx
//
// M2 — date-specific overrides ("Holidays / special hours") for the My
// Availability page. Sits below the weekly-hours editor.
//
// What it edits:
//   - Closed dates (a single NULL/NULL override row → the day shows NO slots).
//   - Special-hours dates (one start/end override window that REPLACES the
//     weekly hours for that one date).
//
// Engine semantics it surfaces (native-slot-engine.ts): if ANY override rows
// exist for a date they REPLACE that date's weekly windows; a NULL/NULL row
// closes the day. Writes go through the setScheduleOverride / delete server
// actions — RLS scopes them to the signed-in host.
//
// Pattern: availability-editor.tsx (Card + Shadcn inputs + sonner toasts +
// explicit loading/empty/error states, rule #27).

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CalendarOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  listScheduleOverrides,
  setScheduleOverride,
  deleteScheduleOverrideDate,
  type ScheduleOverride,
} from '../actions';

const toHHmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Human date label from a "YYYY-MM-DD" string (no Date() tz drift). */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  // Construct as UTC noon so the displayed calendar date never shifts by tz.
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Today as "YYYY-MM-DD" in the browser's local date (for the min= guard). */
function todayLocalIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
    n.getDate(),
  ).padStart(2, '0')}`;
}

export function HolidaysEditor({ scheduleId }: { scheduleId: string }) {
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add form
  const [date, setDate] = useState('');
  const [closed, setClosed] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');

  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listScheduleOverrides(scheduleId).then((res) => {
      if (!active) return;
      if (res.success && res.data) {
        setOverrides(res.data);
      } else {
        setLoadError(res.error ?? 'Could not load your date overrides.');
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [scheduleId]);

  // Group rows by date so a special-hours date with multiple windows shows once.
  const byDate = new Map<string, ScheduleOverride[]>();
  for (const o of overrides) {
    (byDate.get(o.date) ?? byDate.set(o.date, []).get(o.date)!).push(o);
  }
  const dates = [...byDate.keys()].sort();

  function handleAdd() {
    if (!date) {
      toast.error('Please choose a date.');
      return;
    }
    if (!closed && startTime >= endTime) {
      toast.error(`Start time (${startTime}) must be before end time (${endTime}).`);
      return;
    }
    startSave(async () => {
      const res = await setScheduleOverride({
        scheduleId,
        date,
        closed,
        startTime: closed ? undefined : startTime,
        endTime: closed ? undefined : endTime,
      });
      if (res.success && res.data) {
        setOverrides(res.data);
        toast.success(
          closed ? `${formatDate(date)} marked as closed.` : `Special hours set for ${formatDate(date)}.`,
        );
        setDate('');
      } else {
        toast.error(res.error ?? 'Could not save the override.');
      }
    });
  }

  function handleDelete(d: string) {
    setDeletingDate(d);
    startDelete(async () => {
      const res = await deleteScheduleOverrideDate(scheduleId, d);
      if (res.success && res.data) {
        setOverrides(res.data);
        toast.success(`Reverted ${formatDate(d)} to your weekly hours.`);
      } else {
        toast.error(res.error ?? 'Could not remove the override.');
      }
      setDeletingDate(null);
    });
  }

  function describe(rows: ScheduleOverride[]): string {
    const windows = rows.filter((r) => r.startMinute != null && r.endMinute != null);
    if (windows.length === 0) return 'Closed all day';
    return windows
      .map((r) => `${toHHmm(r.startMinute!)}–${toHHmm(r.endMinute!)}`)
      .join(', ');
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarOff className="h-4 w-4 text-muted-foreground" aria-hidden />
          Holidays &amp; special hours
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <p className="text-xs text-muted-foreground">
          Override your weekly hours for specific dates — mark a day{' '}
          <strong>closed</strong> (no bookings) or set <strong>special hours</strong>{' '}
          that replace the usual hours for that one day.
        </p>

        {/* Add form */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="override-date" className="text-xs">
                Date
              </Label>
              <Input
                id="override-date"
                type="date"
                value={date}
                min={todayLocalIso()}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={closed ? 'default' : 'outline'}
                onClick={() => setClosed(true)}
              >
                Closed all day
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!closed ? 'default' : 'outline'}
                onClick={() => setClosed(false)}
              >
                Special hours
              </Button>
            </div>
          </div>

          {!closed && (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="min-w-0 flex-1 sm:w-32 sm:flex-none"
                aria-label="Special hours start time"
              />
              <span className="text-sm text-muted-foreground">–</span>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="min-w-0 flex-1 sm:w-32 sm:flex-none"
                aria-label="Special hours end time"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleAdd} disabled={isSaving || !date}>
              {isSaving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              Save override
            </Button>
          </div>
        </div>

        {/* List */}
        {!loaded ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading date overrides…
          </p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : dates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No date overrides yet. Your weekly hours apply to every day.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {dates.map((d) => {
              const rows = byDate.get(d)!;
              const isClosed = rows.every((r) => r.startMinute == null);
              return (
                <li key={d} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{formatDate(d)}</p>
                    <p
                      className={
                        isClosed
                          ? 'text-xs text-destructive'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {describe(rows)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(d)}
                    disabled={isDeleting && deletingDate === d}
                    aria-label={`Remove override for ${formatDate(d)}`}
                  >
                    {isDeleting && deletingDate === d ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    )}
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
