'use client';

/**
 * Weekly shift timing editor for one (institution, staff scope, category).
 *
 * A flat DataTable was rejected: the requirement is "Mon-Fri one timing,
 * Saturday another", which reads as 7 opaque rows in a generic table. A week
 * grid with a copy-to-weekdays action maps onto how HR actually thinks about it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Copy, History, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/utils';

import {
  useSaveShiftTimingWeek,
  useShiftTimingWeek,
} from '@/hooks/hr/use-shift-timings';
import type { WeekDayInput } from '@/lib/services/hr/shift-timing-service';
import { todayISO } from '@/lib/services/hr/attendance-recompute-service';
import {
  DAY_OF_WEEK_OPTIONS,
  APPLICABLE_GENDER_OPTIONS,
  DEFAULT_WORKING_DAY,
  computeGraceDeadline,
  firstSessionStart,
  timeToMinutes,
  toHHMM,
  validateTimingRow,
  type HRShiftTiming,
  type IsoDayOfWeek,
  type ShiftApplicableGender,
  type ShiftStaffScope,
} from '@/types/hr-shift-timings';

interface WeeklyTimingGridProps {
  institutionId: string;
  staffScope: ShiftStaffScope;
  employmentCategoryId?: string | null;
  /**
   * With staffScope 'work_pattern': the pattern whose week this is. Part of
   * `params` AND of `scopeKey`, for the same reason applicableGender is —
   * missing from either, the grid keeps showing the previous pattern's week.
   */
  workPatternId?: string | null;
  /** Human label for the scope, used in the save toast. */
  scopeLabel: string;
  /**
   * OWNED BY THE PAGE, NOT BY THIS GRID (2026-08-25).
   *
   * Each scope lives in its own TabsContent and Radix unmounts the inactive
   * one. While this was local state it was re-initialised to today every time a
   * tab was opened, so backdating Teaching to 1 July, switching to Non-teaching
   * and saving silently applied that second save from TODAY -- leaving the two
   * scopes on different rules, with no error and no warning. Hoisting it makes
   * the date one decision for the whole edit, which is what it always was.
   */
  effectiveFrom: string;
  onEffectiveFromChange: (value: string) => void;
  /**
   * WHICH staff this week is for. Owned by the page, like effectiveFrom and for
   * the same reason — Radix unmounts the inactive tab, so per-tab state would
   * silently reset to 'all' and write the wrong row.
   *
   * It is part of `params` AND of `scopeKey` below. Missing from either one, the
   * grid keeps showing the previous gender's week after the selector changes.
   */
  applicableGender?: ShiftApplicableGender;
  /**
   * Fired after a SUCCESSFUL save. The Override tab uses it to collapse the
   * builder back to the list, so the override just written appears there and
   * "Add another override" is reachable again — without it the builder stays
   * open showing the row it just saved, which reads as "this is the only
   * override you get".
   *
   * Not fired on failure: the operator must keep their unsaved edits.
   */
  onSaved?: () => void;
}

function blankWeek(): WeekDayInput[] {
  return DAY_OF_WEEK_OPTIONS.map(({ value }) =>
    value === 7
      ? {
          day_of_week: value,
          is_working_day: false,
          grace_minutes: 0,
          second_saturday_holiday: false,
        }
      : {
          day_of_week: value,
          ...DEFAULT_WORKING_DAY,
          second_saturday_holiday: value === 6,
        },
  );
}

function hydrate(rows: HRShiftTiming[]): WeekDayInput[] {
  if (rows.length === 0) return blankWeek();
  const byDay = new Map(rows.map((r) => [r.day_of_week, r]));
  return DAY_OF_WEEK_OPTIONS.map(({ value }) => {
    const row = byDay.get(value);
    if (!row) {
      return value === 7
        ? { day_of_week: value, is_working_day: false, grace_minutes: 0, second_saturday_holiday: false }
        : { day_of_week: value, ...DEFAULT_WORKING_DAY, second_saturday_holiday: value === 6 };
    }
    return {
      day_of_week: row.day_of_week,
      is_working_day: row.is_working_day,
      first_half_start: toHHMM(row.first_half_start) ?? '',
      first_half_end: toHHMM(row.first_half_end) ?? '',
      second_half_start: toHHMM(row.second_half_start) ?? '',
      second_half_end: toHHMM(row.second_half_end) ?? '',
      grace_minutes: row.grace_minutes,
      second_saturday_holiday: row.second_saturday_holiday,
    };
  });
}

/** 450 -> "7h 30m", 480 -> "8h", 30 -> "30m", 0 -> "0m". */
function formatHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * How long ONE half runs, on its own terms: end - start.
 *
 * Deliberately independent of the other half AND of dailyWorkingMinutes below.
 * A half's length is a fact about that half alone, so it appears as soon as its
 * own two boxes are valid rather than waiting for the whole row -- and it is
 * NOT reconciled against the union total, because on the real 09:00-13:00 /
 * 12:30-16:30 pattern 4h + 4h legitimately does not equal 7h 30m. The overlap
 * note under "Working hours" is what explains that gap; do not "fix" it here by
 * pro-rating the shared 30 minutes across the two halves, which would report a
 * half as shorter than the window staff are actually required to cover.
 *
 * Null when either box is empty or invalid, which renders as nothing at all
 * rather than a misleading 0m.
 */
function halfMinutes(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null || e <= s) return null;
  return e - s;
}

/**
 * Hours actually worked in a day: the UNION of the two halves, never their sum
 * and never the outer span.
 *
 * NOT THE SUM. JKKN's real pattern is 09:00-13:00 with 12:30-16:30. Adding the
 * halves gives 8h, but nobody is present for 8 hours between 09:00 and 16:30 --
 * the 30-minute overlap is one stretch of time that belongs to both halves
 * administratively and is worked once. Summing would inflate every such day.
 *
 * NOT THE OUTER SPAN EITHER. 09:00-13:00 with 14:00-17:00 is a lunch break, and
 * first_half_start -> second_half_end would bill that hour off as worked.
 *
 * validateTimingRow guarantees fs < fe, ss < se, fs <= ss and fe <= se, so
 * second_half_end is always the latest boundary. Returns null for a day that is
 * not worked or not yet fully filled in, which is a blank cell rather than a 0.
 */
function dailyWorkingMinutes(row: WeekDayInput): {
  minutes: number;
  overlapMinutes: number;
  gapMinutes: number;
} | null {
  if (!row.is_working_day) return null;
  if (validateTimingRow(row)) return null;

  const first = halfMinutes(row.first_half_start, row.first_half_end);
  const second = halfMinutes(row.second_half_start, row.second_half_end);

  // One half only (2026-09-04): that half is the whole day.
  if (first !== null && second === null) return { minutes: first, overlapMinutes: 0, gapMinutes: 0 };
  if (second !== null && first === null) return { minutes: second, overlapMinutes: 0, gapMinutes: 0 };
  if (first === null || second === null) return null;

  const fs = timeToMinutes(row.first_half_start) as number;
  const fe = timeToMinutes(row.first_half_end) as number;
  const ss = timeToMinutes(row.second_half_start) as number;
  const se = timeToMinutes(row.second_half_end) as number;

  // Halves touch or overlap -> one continuous stretch.
  if (ss <= fe) {
    return { minutes: se - fs, overlapMinutes: fe - ss, gapMinutes: 0 };
  }
  // Halves are separated by a break, which is not worked.
  return { minutes: fe - fs + (se - ss), overlapMinutes: 0, gapMinutes: ss - fe };
}

/**
 * The next three 2nd Saturdays, starting with the current month's, as
 * "11 Jul, 8 Aug, 12 Sep". Concrete dates because the abstract rule is exactly
 * what nobody connects to the WEEKLY_OFF they are looking at.
 */
function upcomingSecondSaturdays(): string {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; out.length < 3 && i < 6; i++) {
    const probe = new Date(now.getFullYear(), now.getMonth() + i, 1);
    // 2nd Saturday = the first Saturday on/after the 8th.
    for (let d = 8; d <= 14; d++) {
      const candidate = new Date(probe.getFullYear(), probe.getMonth(), d);
      if (candidate.getDay() === 6) {
        out.push(
          candidate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        );
        break;
      }
    }
  }
  return out.join(', ');
}

export function WeeklyTimingGrid({
  institutionId,
  staffScope,
  employmentCategoryId = null,
  workPatternId = null,
  scopeLabel,
  effectiveFrom,
  onEffectiveFromChange,
  applicableGender = 'all',
  onSaved,
}: WeeklyTimingGridProps) {
  const params = useMemo(
    () => ({ institutionId, staffScope, employmentCategoryId, workPatternId, applicableGender }),
    [institutionId, staffScope, employmentCategoryId, workPatternId, applicableGender],
  );

  const { data, isLoading } = useShiftTimingWeek(params);
  const save = useSaveShiftTimingWeek();

  const [rows, setRows] = useState<WeekDayInput[]>(blankWeek());

  // Hydrate once per scope, NOT on every `data` identity change. A background
  // refetch (this app refetches on window focus) would otherwise wipe an
  // in-progress edit the moment the user tabs away and back.
  const scopeKey = `${institutionId}|${staffScope}|${employmentCategoryId ?? ''}|${workPatternId ?? ''}|${applicableGender}`;
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || hydratedFor.current === scopeKey) return;
    hydratedFor.current = scopeKey;
    setRows(hydrate(data));
  }, [data, scopeKey]);

  const patchDay = useCallback((dow: IsoDayOfWeek, patch: Partial<WeekDayInput>) => {
    setRows((prev) =>
      prev.map((r) => (r.day_of_week === dow ? { ...r, ...patch } : r)),
    );
  }, []);

  const copyMondayToWeekdays = useCallback(() => {
    setRows((prev) => {
      const mon = prev.find((r) => r.day_of_week === 1);
      if (!mon) return prev;
      return prev.map((r) =>
        r.day_of_week >= 2 && r.day_of_week <= 5
          ? {
              ...r,
              is_working_day: mon.is_working_day,
              first_half_start: mon.first_half_start,
              first_half_end: mon.first_half_end,
              second_half_start: mon.second_half_start,
              second_half_end: mon.second_half_end,
              grace_minutes: mon.grace_minutes,
            }
          : r,
      );
    });
  }, []);

  const errors = useMemo(
    () =>
      rows
        .map((r) => ({ dow: r.day_of_week, message: validateTimingRow(r) }))
        .filter((e): e is { dow: IsoDayOfWeek; message: string } => Boolean(e.message)),
    [rows],
  );

  const weekly = useMemo(() => {
    let minutes = 0;
    let firstHalf = 0;
    let secondHalf = 0;
    let days = 0;
    let hasSecondSaturdayOff = false;
    for (const row of rows) {
      const worked = dailyWorkingMinutes(row);
      // The half totals accumulate under the SAME guard as the union total, so
      // all three figures in the footer describe an identical set of days. Were
      // the halves summed outside it, a week with one incomplete row would show
      // a full-week first-half total against a five-day working total.
      if (!worked) continue;
      minutes += worked.minutes;
      firstHalf += halfMinutes(row.first_half_start, row.first_half_end) ?? 0;
      secondHalf += halfMinutes(row.second_half_start, row.second_half_end) ?? 0;
      days += 1;
      if (row.day_of_week === 6 && row.second_saturday_holiday) {
        hasSecondSaturdayOff = true;
      }
    }
    return { minutes, firstHalf, secondHalf, days, hasSecondSaturdayOff };
  }, [rows]);

  const isScheduledChange = effectiveFrom > todayISO();

  // The date the timing currently in force started. fn_save_shift_timing_week
  // branches on this: saving with effectiveFrom <= it CORRECTS the existing row
  // in place (history is re-judged); saving with a later date SUPERSEDES it
  // (history keeps the old rule). That is the single most consequential thing
  // on this screen and it used to be implied by a bare date input, so an
  // operator raising grace to un-dock a past day got a new row starting today
  // and no change to the day they were trying to fix.
  const currentEffectiveFrom = useMemo(() => {
    const dates = (data ?? [])
      .map((t) => (t as HRShiftTiming).effective_from)
      .filter(Boolean) as string[];
    return dates.length > 0 ? dates.sort()[0] : null;
  }, [data]);

  const canCorrectHistory = Boolean(
    currentEffectiveFrom && currentEffectiveFrom < todayISO(),
  );
  const isCorrectingHistory = Boolean(
    currentEffectiveFrom && effectiveFrom <= currentEffectiveFrom,
  );

  // The toast must name the gender too: "Non-teaching timings saved" is the
  // same sentence whether the Everyone or the Female week was written, and that
  // is the one thing an operator needs to be sure of here.
  const saveLabel =
    applicableGender === 'all'
      ? scopeLabel
      : `${scopeLabel} (${
          APPLICABLE_GENDER_OPTIONS.find((o) => o.value === applicableGender)?.label
          ?? applicableGender
        })`;

  const handleSave = useCallback(async () => {
    if (errors.length > 0) return;
    try {
      const result = await save.mutateAsync({
        institutionId,
        staffScope,
        employmentCategoryId,
        workPatternId,
        applicableGender,
        effectiveFrom,
        days: rows,
      });
      // Let the refreshed server rows win on the next render.
      hydratedFor.current = null;

      if (isScheduledChange) {
        toast.success(`${saveLabel} timings scheduled from ${effectiveFrom}`);
      } else if (result?.recomputeError) {
        // The timing IS saved; only the re-judging failed. Saying "save failed"
        // would send the operator back to re-enter data that is already stored.
        toast.warning(
          `${saveLabel} timings saved, but recomputing past attendance failed: ${result.recomputeError}`,
        );
      } else if (result?.recompute && result.recompute.changed > 0) {
        const t = result.recompute.transitions;
        const detail = Object.entries(t)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, n]) => `${n} ${k}`)
          .join(', ');
        toast.success(
          `${saveLabel} timings saved — ${result.recompute.changed} attendance day(s) recomputed${
            detail ? ` (${detail})` : ''
          }`,
        );
      } else if (result?.recompute) {
        toast.success(
          `${saveLabel} timings saved — ${result.recompute.examined} attendance day(s) re-checked, none changed`,
        );
      } else {
        toast.success(`${saveLabel} timings saved`);
      }

      onSaved?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [
    errors.length, save, institutionId, staffScope, employmentCategoryId, workPatternId,
    applicableGender, effectiveFrom, rows, isScheduledChange, saveLabel, onSaved,
  ]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canCorrectHistory && (
        <div className="rounded-md border p-3">
          <p className="text-sm font-medium">When does this change apply?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onEffectiveFromChange(currentEffectiveFrom!)}
              className={`rounded-md border p-3 text-left text-sm transition-colors ${
                isCorrectingHistory ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              }`}
            >
              <span className="font-medium">Correct from {currentEffectiveFrom}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Treats these as the hours that were always in force. Attendance
                already imported since then is re-judged against them.
              </span>
            </button>
            <button
              type="button"
              onClick={() => onEffectiveFromChange(todayISO())}
              className={`rounded-md border p-3 text-left text-sm transition-colors ${
                !isCorrectingHistory && !isScheduledChange
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
            >
              <span className="font-medium">Apply from {todayISO()}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                A genuine change of hours. Days before today keep the rule that
                was in force when they happened.
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-48">
          <Label htmlFor="effective-from">Effective from</Label>
          <Input
            id="effective-from"
            type="date"
            className="mt-1"
            value={effectiveFrom}
            onChange={(e) => onEffectiveFromChange(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copyMondayToWeekdays}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Monday to Mon–Fri
        </Button>
      </div>

      {isScheduledChange && (
        <Alert>
          <CalendarClock className="h-4 w-4" />
          <AlertDescription>
            This is a scheduled change. The current timings stay in force until{' '}
            <strong>{effectiveFrom}</strong>, so attendance before that date keeps
            evaluating against today&apos;s rules.
          </AlertDescription>
        </Alert>
      )}

      {isCorrectingHistory && !isScheduledChange && (
        <Alert>
          <History className="h-4 w-4" />
          <AlertDescription>
            Saving will re-judge every biometric attendance day from{' '}
            <strong>{effectiveFrom}</strong> to today against these hours. Leave,
            holiday and regularized days are not touched.
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-24 py-2 font-medium">Day</th>
              <th className="w-24 py-2 font-medium">Working</th>
              <th className="py-2 font-medium">First half</th>
              <th className="py-2 font-medium">Second half</th>
              <th className="w-36 py-2 font-medium">Working hours</th>
              <th className="w-40 py-2 font-medium">Grace (first session)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const day = DAY_OF_WEEK_OPTIONS.find((d) => d.value === row.day_of_week)!;
              // Grace runs from the day's FIRST session, which on a
              // second-half-only day is the afternoon — same as evaluateDay.
              const deadline = computeGraceDeadline(firstSessionStart(row), row.grace_minutes ?? 0);
              const worked = dailyWorkingMinutes(row);
              const firstHalf = halfMinutes(row.first_half_start, row.first_half_end);
              const secondHalf = halfMinutes(row.second_half_start, row.second_half_end);
              // A half with neither time is a half the day does not work. Both
              // fields cleared is the only way to say so, which also means a
              // field cleared mid-edit does not flip the half off by itself.
              const firstOff = !row.first_half_start && !row.first_half_end;
              const secondOff = !row.second_half_start && !row.second_half_end;
              const rowError = errors.find((e) => e.dow === row.day_of_week);

              return (
                <tr key={row.day_of_week} className="border-b align-top last:border-0">
                  <td className="py-3 font-medium">{day.short}</td>

                  <td className="py-3">
                    <Switch
                      checked={row.is_working_day}
                      onCheckedChange={(checked) =>
                        patchDay(row.day_of_week, {
                          is_working_day: checked,
                          ...(checked
                            ? { ...DEFAULT_WORKING_DAY, is_working_day: true }
                            : {
                                first_half_start: '',
                                first_half_end: '',
                                second_half_start: '',
                                second_half_end: '',
                                grace_minutes: 0,
                              }),
                        })
                      }
                      aria-label={`${day.label} is a working day`}
                    />
                  </td>

                  <td className="py-3">
                    {row.is_working_day ? (
                      <div className="space-y-1">
                        {firstOff ? (
                          <p className="text-xs text-muted-foreground">No first half</p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Input
                              type="time"
                              className="w-32"
                              value={row.first_half_start ?? ''}
                              onChange={(e) =>
                                patchDay(row.day_of_week, { first_half_start: e.target.value })
                              }
                              aria-label={`${day.label} first half start`}
                            />
                            <span className="text-muted-foreground">–</span>
                            <Input
                              type="time"
                              className="w-32"
                              value={row.first_half_end ?? ''}
                              onChange={(e) =>
                                patchDay(row.day_of_week, { first_half_end: e.target.value })
                              }
                              aria-label={`${day.label} first half end`}
                            />
                          </div>
                        )}
                        {firstHalf !== null && (
                          <p className="text-[11px] leading-snug text-muted-foreground tabular-nums">
                            {formatHM(firstHalf)}
                          </p>
                        )}
                        {/* One half may be switched off (2026-09-04) — a 09:00–14:00
                            Saturday with no afternoon. Off = both times blank;
                            on = the group default for that half. Never both off:
                            that is a non-working day, and the toggle above is
                            the way to say so. */}
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={!firstOff}
                            disabled={!firstOff && secondOff}
                            onCheckedChange={(checked) =>
                              patchDay(
                                row.day_of_week,
                                checked === true
                                  ? {
                                      first_half_start: DEFAULT_WORKING_DAY.first_half_start,
                                      first_half_end: DEFAULT_WORKING_DAY.first_half_end,
                                    }
                                  : { first_half_start: '', first_half_end: '' },
                              )
                            }
                            aria-label={`${day.label} works a first half`}
                          />
                          First half worked
                        </label>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="py-3">
                    {row.is_working_day ? (
                      <div className="space-y-1">
                        {secondOff ? (
                          <p className="text-xs text-muted-foreground">No second half</p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Input
                              type="time"
                              className="w-32"
                              value={row.second_half_start ?? ''}
                              onChange={(e) =>
                                patchDay(row.day_of_week, { second_half_start: e.target.value })
                              }
                              aria-label={`${day.label} second half start`}
                            />
                            <span className="text-muted-foreground">–</span>
                            <Input
                              type="time"
                              className="w-32"
                              value={row.second_half_end ?? ''}
                              onChange={(e) =>
                                patchDay(row.day_of_week, { second_half_end: e.target.value })
                              }
                              aria-label={`${day.label} second half end`}
                            />
                          </div>
                        )}
                        {secondHalf !== null && (
                          <p className="text-[11px] leading-snug text-muted-foreground tabular-nums">
                            {formatHM(secondHalf)}
                          </p>
                        )}
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={!secondOff}
                            disabled={!secondOff && firstOff}
                            onCheckedChange={(checked) =>
                              patchDay(
                                row.day_of_week,
                                checked === true
                                  ? {
                                      second_half_start: DEFAULT_WORKING_DAY.second_half_start,
                                      second_half_end: DEFAULT_WORKING_DAY.second_half_end,
                                    }
                                  : { second_half_start: '', second_half_end: '' },
                              )
                            }
                            aria-label={`${day.label} works a second half`}
                          />
                          Second half worked
                        </label>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="py-3">
                    {worked ? (
                      <div>
                        <p className="font-medium tabular-nums">
                          {formatHM(worked.minutes)}
                        </p>
                        {/* Say why the figure is not simply the two halves added
                            up, or 7h 30m against a 09:00-13:00 / 12:30-16:30 week
                            reads as an off-by-30-minutes bug. */}
                        {worked.overlapMinutes > 0 && (
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            halves overlap {formatHM(worked.overlapMinutes)}, counted once
                          </p>
                        )}
                        {worked.gapMinutes > 0 && (
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            {formatHM(worked.gapMinutes)} break, not counted
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="py-3">
                    {row.is_working_day ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={240}
                            className="w-20"
                            value={row.grace_minutes ?? 0}
                            onChange={(e) =>
                              patchDay(row.day_of_week, {
                                grace_minutes: Number(e.target.value),
                              })
                            }
                            aria-label={`${day.label} grace minutes`}
                          />
                          <span className="text-muted-foreground">min</span>
                        </div>
                        {deadline && (
                          <p className="text-xs text-muted-foreground">
                            On time until {deadline}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}

                    {row.day_of_week === 6 && (
                      <>
                        <label className="mt-3 flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={row.second_saturday_holiday ?? false}
                            onCheckedChange={(checked) =>
                              patchDay(row.day_of_week, {
                                second_saturday_holiday: checked === true,
                              })
                            }
                          />
                          2nd Saturday off
                        </label>
                        {/* This flag beats is_working_day for one Saturday a
                            month, which is invisible from the toggle above:
                            fn_resolve_shift_timings_bulk returns
                            is_working_day=false for day-of-month 8..14 when it
                            is set, so attendance reads WEEKLY_OFF on a day the
                            grid calls a working day. Naming the dates is the
                            difference between a rule and a surprise. */}
                        {row.second_saturday_holiday && row.is_working_day && (
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                            Saturday is a working day, but the 2nd Saturday of each
                            month is still a week off — {upcomingSecondSaturdays()}.
                          </p>
                        )}
                      </>
                    )}

                    {rowError && (
                      <p className="mt-2 text-xs text-destructive">{rowError.message}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td className="py-3 font-medium text-muted-foreground" colSpan={4}>
                Weekly total · {weekly.days} working day(s)
              </td>
              <td className="py-3">
                <p className="font-semibold tabular-nums">{formatHM(weekly.minutes)}</p>
                {weekly.days > 0 && (
                  <p className="text-[11px] leading-snug text-muted-foreground tabular-nums">
                    1st half {formatHM(weekly.firstHalf)} · 2nd half{' '}
                    {formatHM(weekly.secondHalf)}
                  </p>
                )}
                {weekly.hasSecondSaturdayOff && (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    before the monthly 2nd-Saturday off
                  </p>
                )}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        The two halves may overlap — 09:00–13:00 with 12:30–16:30 is normal. Grace
        applies to the first-half start only. A half counts as attended when the
        staff member is in at or before its start (plus grace) and out at or after
        its end.
      </p>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={save.isPending || errors.length > 0}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isScheduledChange ? 'Schedule change' : 'Save week'}
        </Button>
      </div>
    </div>
  );
}
