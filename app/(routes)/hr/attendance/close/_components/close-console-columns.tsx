'use client';

/**
 * Column definitions for the month-close console.
 *
 * EVERY COLUMN CARRIES AN EXPLICIT `size`. The advanced DataTable renders cells
 * as `px-4 py-2 truncate max-w-0`, so a column left at the 150px default clips
 * its content off the edge rather than wrapping — and the things being clipped
 * here are the request counts the screen exists to show.
 *
 * THE COUNT CELLS OPEN IN A NEW TAB, carrying ?institution, ?from and ?to so the
 * approvals screen lists exactly the rows counted here rather than its
 * unfiltered all-time queue. Clearing an approval backlog is a detour, not a
 * destination.
 */

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { CalendarCheck, ExternalLink, FileSpreadsheet, Lock, LockOpen } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AttendancePeriodConsoleRow } from '@/lib/services/hr/attendance/attendance-period-service';

/** Approvals tab slugs, matching what /hr/leave/approvals reads from `?tab=`. */
export const APPROVAL_TABS = {
  leave: 'leave',
  sto: 'short-time-off',
  comp: 'comp-off',
} as const;

/**
 * Where a row sits in the HR Head's working order. Lower sorts first.
 *
 * Ready → act now. Review → action needed elsewhere before you can act. Closed →
 * done. No data → nothing to do here at all, so it goes last rather than
 * cluttering the top with rows that cannot be worked on.
 */
export type CloseState = 'ready' | 'review' | 'closed' | 'nodata';

export function closeStateOf(r: AttendancePeriodConsoleRow): CloseState {
  if (r.status === 'locked') return 'closed';
  if (r.record_count === 0) return 'nodata';
  return r.pending_total > 0 ? 'review' : 'ready';
}

export const CLOSE_STATE_RANK: Record<CloseState, number> = {
  ready: 0,
  review: 1,
  closed: 2,
  nodata: 3,
};

export const CLOSE_STATE_LABEL: Record<CloseState, string> = {
  ready: 'Ready to close',
  review: 'Needs review',
  closed: 'Closed',
  nodata: 'No data',
};

/**
 * Biometric coverage for one institution-month.
 *
 * `covered` is how many people the close will actually freeze; `active` is the
 * roster. A close writes one summary per COVERED person, so `uncovered` is the
 * number who end up with no row at all — the figure worth putting in front of
 * someone before they commit.
 *
 * Ratio can exceed 1: the import matches on employee code and ignores
 * staff.is_active, so relieved staff are counted too (Nursing was 25 of 24 in
 * July). Deliberately not clamped — a coverage over 100% is a real signal, not
 * a rendering glitch.
 */
export interface Coverage {
  covered: number;
  active: number;
  uncovered: number;
  pct: number | null;
  /** Anyone on the roster with no attendance data this month. */
  hasGap: boolean;
}

export function coverageOf(r: AttendancePeriodConsoleRow): Coverage {
  const covered = r.staff_with_records;
  const active = r.active_staff;
  const uncovered = Math.max(0, active - covered);
  return {
    covered,
    active,
    uncovered,
    pct: active > 0 ? Math.round((covered / active) * 100) : null,
    hasGap: uncovered > 0,
  };
}

/** yyyy-MM-dd bounds of the month, built from parts — never via toISOString(). */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, '0');
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function StateBadge({ state, lockedAt }: { state: CloseState; lockedAt: string | null }) {
  if (state === 'closed') {
    return (
      <span className='flex min-w-0 flex-col gap-0.5'>
        <Badge variant='outline' className='w-fit border-emerald-300 font-normal text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'>
          <Lock className='mr-1 h-3 w-3' />
          Closed
        </Badge>
        <span className='truncate text-[11px] text-muted-foreground'>{formatDate(lockedAt)}</span>
      </span>
    );
  }
  if (state === 'nodata') {
    return <Badge variant='secondary' className='font-normal'>No data</Badge>;
  }
  if (state === 'review') {
    return (
      <Badge variant='outline' className='border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'>
        Needs review
      </Badge>
    );
  }
  return (
    <Badge variant='outline' className='border-primary/50 font-normal text-primary'>Ready</Badge>
  );
}

/**
 * A request-type count. Non-zero becomes a new-tab link; zero stays plain text —
 * a "0" that navigates somewhere only loses your place.
 */
function CountCell({ count, href, title }: { count: number; href: string; title: string }) {
  if (count === 0) return <span className='block text-right tabular-nums text-muted-foreground'>0</span>;
  return (
    <span className='block text-right'>
      <Link
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        title={title}
        className='inline-flex items-center gap-1 font-medium tabular-nums text-amber-700 underline-offset-2 hover:underline dark:text-amber-400'
      >
        {count}
        <ExternalLink className='h-3 w-3 opacity-60' />
      </Link>
    </span>
  );
}

export interface CloseColumnActions {
  year: number;
  month: number;
  canManage: boolean;
  isSuperAdmin: boolean;
  /** hr.payroll.register.view — shows the Salary register link on closed rows. */
  canViewRegister: boolean;
  busy: boolean;
  onClose: (row: AttendancePeriodConsoleRow) => void;
  onReopen: (row: AttendancePeriodConsoleRow) => void;
}

export function getCloseConsoleColumns(
  a: CloseColumnActions
): ColumnDef<AttendancePeriodConsoleRow>[] {
  const { from, to } = monthBounds(a.year, a.month);
  const href = (r: AttendancePeriodConsoleRow, tab: string) =>
    `/hr/leave/approvals?tab=${tab}&institution=${r.institution_id}&from=${from}&to=${to}`;

  return [
    {
      accessorKey: 'institution_name',
      size: 240,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Institution' />,
      cell: ({ row }) => (
        <span className='truncate text-sm font-medium'>{row.original.institution_name}</span>
      ),
    },
    {
      id: 'state',
      // Sorted on the WORKING-ORDER rank, not the label — alphabetically
      // "Closed" would come before "Ready", which is the opposite of useful.
      accessorFn: (r) => CLOSE_STATE_RANK[closeStateOf(r)],
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
      cell: ({ row }) => (
        <StateBadge state={closeStateOf(row.original)} lockedAt={row.original.locked_at} />
      ),
    },
    {
      id: 'coverage',
      // Sorted on the RATIO, not the raw count: 65 of 71 is a healthier month
      // than 26 of 131, and sorting by the numerator would rank them the other
      // way round.
      accessorFn: (r) => (r.active_staff > 0 ? r.staff_with_records / r.active_staff : 0),
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title='In biometric' />,
      cell: ({ row }) => {
        const c = coverageOf(row.original);
        // Under 60% the number is the story, not a footnote.
        const tone = c.pct === null ? '' : c.pct < 60 ? 'text-destructive' : c.hasGap ? 'text-amber-700 dark:text-amber-400' : '';
        return (
          <span className='flex min-w-0 flex-col items-end gap-0.5'>
            <span className={`tabular-nums ${tone}`}>
              <span className='font-medium'>{c.covered}</span>
              <span className='text-muted-foreground'> / {c.active}</span>
            </span>
            {c.pct !== null && (
              <span className='text-[11px] text-muted-foreground'>
                {c.pct}%{row.original.relieved_with_records > 0 && ` · ${row.original.relieved_with_records} relieved`}
              </span>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: 'pending_leave',
      size: 100,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Leave' />,
      cell: ({ row }) => (
        <CountCell
          count={row.original.pending_leave}
          href={href(row.original, APPROVAL_TABS.leave)}
          title={`${row.original.pending_leave} leave request(s) awaiting a decision`}
        />
      ),
    },
    {
      accessorKey: 'pending_short_time_off',
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Short time off' />,
      cell: ({ row }) => (
        <CountCell
          count={row.original.pending_short_time_off}
          href={href(row.original, APPROVAL_TABS.sto)}
          title={`${row.original.pending_short_time_off} short time off request(s) awaiting a decision`}
        />
      ),
    },
    {
      accessorKey: 'pending_comp_off',
      size: 110,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Comp off' />,
      cell: ({ row }) => (
        <CountCell
          count={row.original.pending_comp_off}
          href={href(row.original, APPROVAL_TABS.comp)}
          title={`${row.original.pending_comp_off} comp off claim(s) awaiting a decision`}
        />
      ),
    },
    {
      accessorKey: 'unprocessed_days',
      size: 110,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Unjudged' />,
      cell: ({ row }) =>
        row.original.unprocessed_days > 0 ? (
          <span className='block text-right tabular-nums text-amber-700 dark:text-amber-400'>
            {row.original.unprocessed_days}
          </span>
        ) : (
          <span className='block text-right tabular-nums text-muted-foreground'>0</span>
        ),
    },
    {
      id: 'actions',
      size: 300,
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const r = row.original;
        const state = closeStateOf(r);

        if (state === 'closed') {
          // Closing is not the end of the errand — the month was frozen so
          // payroll could read it. Carry the institution and month across so
          // the register opens on the month just closed rather than making
          // someone re-pick both. Gated on the register key, which HR Head
          // holds and nobody else does.
          const registerHref =
            `/hr/payroll/register?institution=${r.institution_id}` +
            `&year=${a.year}&month=${a.month}`;

          return (
            <div className='flex items-center justify-end gap-1.5'>
              {a.canViewRegister && (
                <Button asChild variant='outline' size='sm' className='h-8'>
                  <Link href={registerHref}>
                    <FileSpreadsheet className='mr-1.5 h-3.5 w-3.5' />
                    Salary register
                  </Link>
                </Button>
              )}
              {a.isSuperAdmin && (
                <Button variant='outline' size='sm' className='h-8' onClick={() => a.onReopen(r)}>
                  <LockOpen className='mr-1.5 h-3.5 w-3.5' />
                  Reopen
                </Button>
              )}
            </div>
          );
        }
        if (!a.canManage) return null;

        return (
          <TooltipProvider disableHoverableContent>
            <Tooltip delayDuration={150}>
              {/* A disabled button fires no pointer events, so the tooltip needs
                  a wrapper to hang off — otherwise the one explanation the user
                  needs is unreachable. */}
              <TooltipTrigger asChild>
                <span className='inline-block'>
                  <Button
                    size='sm'
                    className='h-8'
                    disabled={state !== 'ready' || a.busy}
                    onClick={() => a.onClose(r)}
                  >
                    <CalendarCheck className='mr-1.5 h-3.5 w-3.5' />
                    Close
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side='left' className='max-w-xs'>
                {state === 'nodata'
                  ? 'No biometric data imported for this institution this month.'
                  : state === 'review'
                    ? `${r.pending_total} request(s) still awaiting a decision. Every leave, short time off and comp off for this month must be decided first.`
                    : `Freeze ${r.staff_with_records} staff members' day counts.`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
  ];
}
