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
 * THE CELL WASH CARRIES THE OUTCOME, NOT THE STATUS CODE.
 *
 * A calendar is read at a glance, and the question staff ask of it is "which
 * days cost me money" — not "which of eight status codes applied". So every day
 * that is credited (Present, any Leave, On Duty, Regularized, Clinical Posting)
 * gets the same GREEN wash, and a loss-of-pay day gets a RED one; a half day
 * sits between them in amber. The chip and text colours still differ per status,
 * so P, CL and OD remain distinguishable inside the green — the wash answers
 * "was I paid", the label answers "why".
 *
 * Week off and holiday keep their own washes: they are neither earned nor lost,
 * and colouring them green would inflate the month at a glance.
 */
export const TONE_CLASSES: Record<AttendanceTone, ToneClasses> = {
  present: {
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    text: 'text-emerald-700 dark:text-emerald-400',
    cell: 'bg-emerald-50/80 dark:bg-emerald-950/30',
  },
  half: {
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-400',
    cell: 'bg-amber-50/80 dark:bg-amber-950/30',
  },
  absent: {
    chip: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    text: 'text-red-600 dark:text-red-400',
    cell: 'bg-red-50/80 dark:bg-red-950/30',
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
    // Green like Present: an approved leave day is a paid day.
    cell: 'bg-emerald-50/80 dark:bg-emerald-950/30',
  },
  duty: {
    chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    text: 'text-indigo-700 dark:text-indigo-300',
    // On Duty / Clinical Posting — worked elsewhere, so credited.
    cell: 'bg-emerald-50/80 dark:bg-emerald-950/30',
  },
  pending: {
    chip: 'bg-muted text-muted-foreground',
    text: 'text-muted-foreground',
    cell: '',
  },
};

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
export function AttendanceLegend({ className }: { className?: string }) {
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

      {/* The wash is a second, coarser signal than the codes above, so it needs
          saying once — otherwise a violet CL sitting on green reads as a clash
          rather than as "leave, and paid". */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-4 shrink-0 rounded-sm border bg-emerald-50/80 dark:bg-emerald-950/30" />
          Green day = paid (present, leave, on duty)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-4 shrink-0 rounded-sm border bg-red-50/80 dark:bg-red-950/30" />
          Red day = loss of pay
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-4 shrink-0 rounded-sm border bg-amber-50/80 dark:bg-amber-950/30" />
          Amber = half day
        </span>
      </p>
    </div>
  );
}
