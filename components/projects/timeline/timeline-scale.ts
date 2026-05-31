/**
 * Timeline scale + geometry helpers (Decision F2.1)
 *
 * Pure date→pixel math for the Gantt. No React. `date-fns` is the project's
 * date library (installed; used across components/ui/date-*). Day/week/month
 * zoom is a single column-width knob over a day-resolution axis: bars are always
 * positioned to the day, the zoom only changes pixels-per-day and which header
 * gridlines render.
 */

import {
  differenceInCalendarDays,
  eachDayOfInterval,
  startOfDay,
  isWeekend,
  addDays,
} from 'date-fns';

export type TimelineZoom = 'day' | 'week' | 'month';

/** Pixels per day at each zoom level. Day = roomy, month = compact. */
export const PX_PER_DAY: Record<TimelineZoom, number> = {
  day: 40,
  week: 16,
  month: 5,
};

/** Left gutter (px) reserved for the task-name column. */
export const ROW_LABEL_WIDTH = 240;

/** Height (px) of a single Gantt row. */
export const ROW_HEIGHT = 36;

/** Parse a YYYY-MM-DD / ISO date string to a local Date at midnight, or null. */
export function parseDateOnly(date: string | null | undefined): Date | null {
  if (!date) return null;
  const part = date.slice(0, 10);
  const [y, m, d] = part.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export interface TimelineRange {
  /** Inclusive first day rendered. */
  start: Date;
  /** Inclusive last day rendered. */
  end: Date;
  /** Total days in [start, end] inclusive. */
  totalDays: number;
}

/**
 * Compute the rendered date window from every dated entity, padded a little so
 * the first/last bars aren't flush against the edge. Falls back to a one-month
 * window around today when nothing is dated.
 */
export function computeRange(dates: (string | null | undefined)[]): TimelineRange {
  const parsed = dates
    .map(parseDateOnly)
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());

  if (parsed.length === 0) {
    const today = startOfDay(new Date());
    return {
      start: addDays(today, -7),
      end: addDays(today, 21),
      totalDays: 29,
    };
  }

  const min = startOfDay(new Date(Math.min(...parsed)));
  const max = startOfDay(new Date(Math.max(...parsed)));
  const start = addDays(min, -3);
  const end = addDays(max, 3);
  return {
    start,
    end,
    totalDays: differenceInCalendarDays(end, start) + 1,
  };
}

/** X offset (px) of a given date from the range start. */
export function dateToX(date: Date, range: TimelineRange, zoom: TimelineZoom): number {
  const days = differenceInCalendarDays(startOfDay(date), range.start);
  return days * PX_PER_DAY[zoom];
}

/** Total chart width (px) for the time axis (excludes the label gutter). */
export function chartWidth(range: TimelineRange, zoom: TimelineZoom): number {
  return range.totalDays * PX_PER_DAY[zoom];
}

export interface BarGeometry {
  /** Left offset in px. */
  x: number;
  /** Width in px (>= a minimum so a 1-day bar is visible). */
  width: number;
}

/**
 * Geometry for a task/phase bar spanning [start, due] inclusive. When only one
 * of the two dates is present we render a minimum-width bar at that date so the
 * row is still anchored on the axis. Returns null when neither date is set.
 */
export function barGeometry(
  startDate: string | null | undefined,
  dueDate: string | null | undefined,
  range: TimelineRange,
  zoom: TimelineZoom
): BarGeometry | null {
  const start = parseDateOnly(startDate);
  const due = parseDateOnly(dueDate);
  const anchor = start ?? due;
  if (!anchor) return null;

  const x = dateToX(anchor, range, zoom);
  const end = due ?? start!;
  const spanDays = Math.max(1, differenceInCalendarDays(end, anchor) + 1);
  const width = Math.max(PX_PER_DAY[zoom], spanDays * PX_PER_DAY[zoom]);
  return { x, width };
}

export interface DayCell {
  date: Date;
  x: number;
  isWeekend: boolean;
  /** First day of a week (Monday) — used to draw week gridlines. */
  isWeekStart: boolean;
  /** First day of a month — used to draw month gridlines + labels. */
  isMonthStart: boolean;
}

/** Every day in the range with its x and weekend/boundary flags for the grid. */
export function dayCells(range: TimelineRange, zoom: TimelineZoom): DayCell[] {
  return eachDayOfInterval({ start: range.start, end: range.end }).map((date) => ({
    date,
    x: dateToX(date, range, zoom),
    isWeekend: isWeekend(date),
    // getDay: 0=Sun..6=Sat → Monday is week start.
    isWeekStart: date.getDay() === 1,
    isMonthStart: date.getDate() === 1,
  }));
}

/**
 * Convert a horizontal pixel delta (drag distance) into a whole-day shift.
 * Rounds to the nearest day so a drag snaps to the grid.
 */
export function pxDeltaToDays(deltaPx: number, zoom: TimelineZoom): number {
  return Math.round(deltaPx / PX_PER_DAY[zoom]);
}

/** Shift a YYYY-MM-DD date string by N days, returning YYYY-MM-DD (or null). */
export function shiftDateString(
  date: string | null | undefined,
  days: number
): string | null {
  const d = parseDateOnly(date);
  if (!d) return null;
  const shifted = addDays(d, days);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
