'use client';

/**
 * The month's figures, shaped the way payroll reads them.
 * Created: 2026-08-27.
 *
 * WHAT THIS REPLACED. The strip here counted raw status tokens — Present, Half
 * day, Absent, Leave, Week off, Holiday, Not processed, Effective hours. That
 * answers "what did each day look like" and not the question anyone actually
 * brings to this page: how many days am I paid for, and how many cost me pay.
 * There was no working-day figure, Casual Leave and On Duty were one
 * undifferentiated "Leave", and nothing added up to a total.
 *
 * The primary row is an equation, left to right:
 *   Working Days ← Present + Paid Leave (+ holiday) ... minus LOP → Total Paid.
 * The secondary row keeps the raw counts for anyone reconciling a day.
 *
 * RED MEANS ONE THING. Only LOP is tinted, and only when it is non-zero, so a
 * glance at the card finds the number that costs money. Everything else stays
 * neutral — or green once the month is closed, matching the calendar's own
 * "these figures are final" treatment.
 */

import { cn } from '@/lib/utils';
import {
  formatDayCount,
  formatDuration,
  type AttendanceMonthSummary,
} from '@/types/hr-attendance';

function Card({
  label,
  value,
  hint,
  tone = 'default',
  closed,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'total' | 'lop';
  closed: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-card px-3 py-2.5',
        closed && 'bg-emerald-50 dark:bg-emerald-950/40',
        tone === 'total' && 'bg-primary/5',
        tone === 'lop' && 'bg-red-50 dark:bg-red-950/30',
      )}
    >
      <dt
        className={cn(
          'text-[11px] uppercase tracking-wide text-muted-foreground',
          closed && tone === 'default' && 'text-emerald-800/70 dark:text-emerald-300/70',
          tone === 'lop' && 'text-red-700/80 dark:text-red-300/80',
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          'text-xl font-semibold tabular-nums',
          closed && tone === 'default' && 'text-emerald-900 dark:text-emerald-200',
          tone === 'total' && 'text-primary',
          tone === 'lop' && 'text-red-700 dark:text-red-300',
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

export function AttendanceSummaryCards({
  summary,
  closed,
  className,
}: {
  summary: AttendanceMonthSummary;
  /** Month locked by HR — the figures are final, so say so in green. */
  closed: boolean;
  className?: string;
}) {
  const d = formatDayCount;

  return (
    <div className={cn('space-y-2', className)}>
      <dl
        className={cn(
          'grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-5',
          closed && 'border-emerald-300 bg-emerald-200 dark:border-emerald-800 dark:bg-emerald-900',
        )}
      >
        <Card
          label="Working days"
          value={d(summary.workingDays)}
          hint={summary.weeklyOff > 0 ? `${summary.weeklyOff} week off excluded` : undefined}
          closed={closed}
        />
        <Card label="Present" value={d(summary.present)} closed={closed} />

        <Card label="Paid leave" value={d(summary.paidLeaveTotal)} closed={closed}>
          {summary.paidLeaveByType.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              {summary.paidLeaveByType.map((b) => (
                <span key={b.code} title={b.label} className="whitespace-nowrap">
                  <span className="font-medium">{b.code}</span> {d(b.days)}
                </span>
              ))}
            </p>
          )}
        </Card>

        <Card
          label="Loss of pay"
          value={d(summary.lop)}
          tone={summary.lop > 0 ? 'lop' : 'default'}
          hint={summary.halfDay > 0 ? `includes ${summary.halfDay} half day` : undefined}
          closed={closed}
        />
        <Card label="Total paid days" value={d(summary.totalPaid)} tone="total" closed={closed} />
      </dl>

      {/* The raw counts the figures above were derived from. Muted: they are
          for reconciling a specific day, not for reading the month. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            ['Week off', d(summary.weeklyOff)],
            ['Holiday', d(summary.holiday)],
            ['Half day', d(summary.halfDay)],
            ['Not processed', d(summary.pending)],
            ['Effective hours', formatDuration(summary.effectiveMinutes)],
          ] as Array<[string, string]>
        ).map(([label, value]) => (
          <div key={label} className="bg-card px-3 py-1.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {/* State the identity rather than leaving the reader to check it — a
          month with unprocessed days is the one case where paid + LOP does not
          reach the working-day count, and that is worth seeing. */}
      <p className="text-xs text-muted-foreground">
        {closed && <span className="font-medium text-foreground">This month is closed. </span>}
        {d(summary.totalPaid)} paid + {d(summary.lop)} loss of pay
        {summary.pending > 0 ? ` + ${d(summary.pending)} not processed` : ''} ={' '}
        {d(summary.totalPaid + summary.lop + summary.pending)} of {d(summary.workingDays)} working
        days.
      </p>
    </div>
  );
}
