'use client';

/**
 * Shared colour vocabulary for the Attendance Log and Calendar.
 * Created: 2026-08-09.
 *
 * Both tabs render the same tokens, so the tone→class mapping lives here and
 * nowhere else. types/hr-attendance.ts owns the token→tone decision; this file
 * owns tone→Tailwind, which keeps class strings out of the type layer.
 */

import { cn } from '@/lib/utils';
import {
  LEGEND_ORDER,
  STATUS_TOKENS,
  type AttendanceTone,
  type AttendanceToken,
} from '@/types/hr-attendance';

interface ToneClasses {
  /** Small filled chip — legend swatch, log badge. */
  chip: string;
  /** Bare text — the `LOP : LOP` pair inside a calendar cell. */
  text: string;
  /** Whole-cell wash on the calendar grid. */
  cell: string;
}

/**
 * `cell` is the ALWAYS-ON wash and marks days that were never workable — week
 * off and holiday. It is structural: true regardless of what HR has decided, so
 * it shows in every month.
 *
 * The paid/unpaid wash is deliberately NOT here — see OUTCOME_WASH.
 */
export const TONE_CLASSES: Record<AttendanceTone, ToneClasses> = {
  present: {
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    text: 'text-emerald-700 dark:text-emerald-400',
    cell: '',
  },
  half: {
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-400',
    cell: '',
  },
  absent: {
    chip: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    text: 'text-red-600 dark:text-red-400',
    cell: '',
  },
  off: {
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    text: 'text-sky-700 dark:text-sky-300',
    cell: 'bg-sky-50/70 dark:bg-sky-950/30',
  },
  holiday: {
    chip: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300',
    text: 'text-pink-700 dark:text-pink-300',
    cell: 'bg-pink-50/70 dark:bg-pink-950/30',
  },
  leave: {
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    text: 'text-violet-700 dark:text-violet-300',
    cell: '',
  },
  duty: {
    chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    text: 'text-indigo-700 dark:text-indigo-300',
    cell: '',
  },
  pending: {
    chip: 'bg-muted text-muted-foreground',
    text: 'text-muted-foreground',
    cell: '',
  },
};

/**
 * THE PAID / UNPAID WASH — ONLY ON A CLOSED MONTH.
 *
 * Green means "this day was credited", red means "this day cost pay". That is a
 * settlement statement, and while a month is still open it would be a lie: an
 * absent day may yet be regularized, a leave may still be approved, and a
 * pending import can flip a day either way. Painting a live month in red and
 * green invites people to act on figures HR has not signed off. So the calendar
 * stays neutral until the month is locked, and only then colours in.
 *
 * Deeper than a tint on purpose: once it appears it is the primary reading of
 * the grid, and the -50 wash it replaced was barely visible against the card.
 * The chip and text colours still differ per status, so P, CL and OD remain
 * distinguishable inside the green — the wash answers "was I paid", the label
 * answers "why".
 *
 * Week off and holiday are absent from this map: they are neither earned nor
 * lost, so they keep their own structural wash above rather than reading as
 * paid days and inflating the month at a glance.
 */
const OUTCOME_WASH: Partial<Record<AttendanceTone, string>> = {
  present: 'bg-emerald-200/80 dark:bg-emerald-900/50',
  leave: 'bg-emerald-200/80 dark:bg-emerald-900/50',
  duty: 'bg-emerald-200/80 dark:bg-emerald-900/50',
  half: 'bg-amber-200/80 dark:bg-amber-900/50',
  absent: 'bg-red-200/80 dark:bg-red-900/50',
};

/** Legend swatches, so the key cannot drift from the grid it explains. */
export const OUTCOME_LEGEND = [
  { wash: OUTCOME_WASH.present!, label: 'Paid day — present, leave or on duty' },
  { wash: OUTCOME_WASH.half!, label: 'Half day' },
  { wash: OUTCOME_WASH.absent!, label: 'Loss of pay' },
] as const;

/**
 * The wash for one calendar cell.
 *
 * @param closed month locked by HR — only then does the paid/unpaid wash apply.
 */
export function cellWashFor(token: AttendanceToken, closed: boolean): string {
  const tone = STATUS_TOKENS[token].tone;
  return cn(TONE_CLASSES[tone].cell, closed && OUTCOME_WASH[tone]);
}

export function tonesFor(token: AttendanceToken): ToneClasses {
  return TONE_CLASSES[STATUS_TOKENS[token].tone];
}

/** The filled short-code chip used in the log's Status column. */
export function AttendanceTokenBadge({
  token,
  label,
  className,
}: {
  token: AttendanceToken;
  /**
   * Overrides the generic short code. The log passes day.tokenLabel so a leave
   * day prints its own type — 'CL' rather than a bare 'L', which cannot tell
   * Casual Leave from Loss of Pay.
   */
  label?: string;
  className?: string;
}) {
  const meta = STATUS_TOKENS[token];
  return (
    <span
      title={meta.label}
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tonesFor(token).chip,
        className,
      )}
    >
      {label ?? meta.short}
    </span>
  );
}

/**
 * The legend strip above the calendar. Comp Off is deliberately absent — no
 * COMP_OFF status type exists and nothing writes one, so listing it would
 * promise a state that can never appear. See types/hr-attendance.ts.
 */
export function AttendanceLegend({
  closed = false,
  className,
}: {
  /** Month locked by HR — the paid/unpaid wash is on the grid, so explain it. */
  closed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {LEGEND_ORDER.map((token) => {
          const meta = STATUS_TOKENS[token];
          return (
            <span key={token} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn('h-3 w-3 shrink-0 rounded-sm', tonesFor(token).chip)}
              />
              <span className="font-semibold">{meta.short}</span>
              <span className="text-muted-foreground">: {meta.label}</span>
            </span>
          );
        })}
      </div>

      {/* Only when the grid is actually washed. The wash is a second, coarser
          signal than the codes above, so it needs saying once — otherwise a
          violet CL sitting on green reads as a clash rather than as "leave,
          and paid". */}
      {closed && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Month closed —</span>
          {OUTCOME_LEGEND.map(({ wash, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span aria-hidden className={cn('h-3 w-4 shrink-0 rounded-sm border', wash)} />
              {label}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
