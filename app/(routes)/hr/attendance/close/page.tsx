'use client';

/**
 * Attendance Month Close — the step between biometric and payroll.
 *
 * THE ORDER MATTERS AND IS THE WHOLE POINT. Punches are imported, staff raise
 * short time off / leave / comp-off, approvals recompute the affected days, and
 * only then does HR Head freeze the month. After that, no request touching it
 * can be raised, decided or withdrawn, and the per-staff day counts stop moving
 * — which is what makes them safe for payroll to read.
 *
 * EVERY REQUEST MUST BE DECIDED FIRST. The close control is disabled while any
 * leave, short time off or compensatory off for that institution-month is still
 * awaiting a decision, and the three types are counted separately so the
 * blocker is nameable rather than a single "12 pending". The database refuses
 * independently — fn_hr_lock_attendance_period raises — but a button that looks
 * available and then fails is a worse way to learn the same fact.
 *
 * hr_payroll_periods also has a `locked` status and is NOT this. Its lock is the
 * last stage of a five-signature chain, reached after payslips are distributed.
 *
 * Gated on hr.attendance.period.view, held by HR Head plus the Super
 * Administrator. Denial is enforced in Postgres — by the console RPC, by RLS,
 * and by triggers on hr_attendance_records and hr_leave_applications.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAttendancePeriodConsole,
  useLockAttendancePeriod,
  useReopenAttendancePeriod,
} from '@/hooks/hr/use-attendance-periods';
import type { AttendancePeriodConsoleRow } from '@/lib/services/hr/attendance/attendance-period-service';

import { CloseConsoleTable, type CloseStateFilter } from './_components/close-console-table';
import { CloseConsoleFilters } from './_components/close-console-filters';
import { coverageOf } from './_components/close-console-columns';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Current year/month in IST — the server is not necessarily in Asia/Kolkata. */
function nowIST(): { year: number; month: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
  }).format(new Date());
  const [y, m] = p.split('-').map(Number);
  return { year: y, month: m };
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className='rounded-lg border p-3 sm:p-4'>
      <p className='text-[11px] uppercase tracking-wide text-muted-foreground sm:text-xs'>
        {label}
      </p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl ${tone ?? ''}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * Biometric coverage for the institution being closed.
 *
 * THE GAP IS THE THING WORTH STOPPING FOR. A close writes one frozen summary per
 * person WITH attendance data, so anyone uncovered gets no row at all and
 * payroll later finds nothing for them rather than a zero. At Dental College in
 * July that would have been 148 of 152 people.
 *
 * An acknowledgement rather than a hard percentage threshold: 4 of 152 is
 * obviously wrong and 1 of 2 is probably fine, and any cut-off between them
 * would be a number nobody chose. What must not happen is closing at 3% WITHOUT
 * KNOWING, and a tick box fixes exactly that.
 */
function CoveragePanel({
  row,
  acknowledged,
  onAcknowledge,
}: {
  row: AttendancePeriodConsoleRow;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
}) {
  const c = coverageOf(row);
  return (
    <div className='space-y-3'>
      <div className='rounded-lg border p-3 text-sm'>
        <p>
          <span className='font-semibold tabular-nums'>{c.covered}</span> of{' '}
          <span className='font-semibold tabular-nums'>{c.active}</span> active staff have
          attendance data this month
          {c.pct !== null && <span className='text-muted-foreground'> ({c.pct}%)</span>}.
        </p>
        {row.relieved_with_records > 0 && (
          <p className='mt-1 text-xs text-muted-foreground'>
            {row.relieved_with_records} of them have already been relieved — the biometric import
            matches on employee code and ignores whether someone still works here.
          </p>
        )}
      </div>

      {c.hasGap && (
        <>
          <Alert variant={c.pct !== null && c.pct < 60 ? 'destructive' : undefined}>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription className='text-xs'>
              <span className='font-medium'>
                {c.uncovered} staff member(s) have no attendance data for this month.
              </span>{' '}
              They will get no frozen day counts at all, so payroll will find nothing for them
              rather than a zero. Import their biometric data first if that is not intended.
            </AlertDescription>
          </Alert>
          <label className='flex cursor-pointer items-start gap-2.5 text-sm'>
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => onAcknowledge(v === true)}
              className='mt-0.5'
            />
            <span>
              I understand that {c.uncovered} of {c.active} staff will be closed with no
              attendance data.
            </span>
          </label>
        </>
      )}
    </div>
  );
}

export default function AttendanceMonthClosePage() {
  const { canAccess, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.attendance.period', 'view');
  const canManage = canAccess('hr.attendance.period', 'manage');
  // Closing a month is not the end of the errand: the register is the
  // reason it was frozen. Gated on its OWN key, which HR Head holds and
  // most holders of hr.attendance.period.view do not.
  const canViewRegister = canAccess('hr.payroll.register', 'view');

  // Lazy initialisers: nowIST reads a clock, so it must run once on mount.
  const [year, setYear] = useState(() => nowIST().year);
  const [month, setMonth] = useState(() => nowIST().month);

  const { data, isLoading, error, refetch, isFetching } =
    useAttendancePeriodConsole(year, month);
  const lock = useLockAttendancePeriod();
  const reopen = useReopenAttendancePeriod();

  const [confirmRow, setConfirmRow] = useState<AttendancePeriodConsoleRow | null>(null);
  const [reopenRow, setReopenRow] = useState<AttendancePeriodConsoleRow | null>(null);
  const [reason, setReason] = useState('');
  const [stateFilter, setStateFilter] = useState<CloseStateFilter>('all');
  /** Ticked when the close would leave roster staff with no frozen row. */
  const [gapAcknowledged, setGapAcknowledged] = useState(false);

  const rows = useMemo(() => data ?? [], [data]);

  const stats = useMemo(() => {
    const withData = rows.filter((r) => r.record_count > 0);
    return {
      institutions: rows.length,
      withData: withData.length,
      closed: rows.filter((r) => r.status === 'locked').length,
      blocked: withData.filter((r) => r.status !== 'locked' && r.pending_total > 0).length,
      ready: withData.filter((r) => r.status !== 'locked' && r.pending_total === 0).length,
      pending: rows.reduce((n, r) => n + r.pending_total, 0),
    };
  }, [rows]);

  const shiftMonth = useCallback((delta: number) => {
    const m0 = month - 1 + delta;
    setYear((y) => y + Math.floor(m0 / 12));
    setMonth((((m0 % 12) + 12) % 12) + 1);
  }, [month]);

  const runLock = useCallback(
    async (row: AttendancePeriodConsoleRow) => {
      try {
        await lock.mutateAsync({ institutionId: row.institution_id, year, month });
        toast.success(`${row.institution_name} closed for ${MONTHS[month - 1]} ${year}.`);
        setConfirmRow(null);
      } catch (err) {
        // The RPC's message names the blocking count, so it is shown verbatim.
        toast.error(getErrorMessage(err));
      }
    },
    [lock, month, year]
  );

  const runReopen = useCallback(async () => {
    if (!reopenRow?.period_id || !reason.trim()) return;
    try {
      await reopen.mutateAsync({ periodId: reopenRow.period_id, reason: reason.trim() });
      toast.success(`${reopenRow.institution_name} reopened. The frozen day counts were discarded.`);
      setReopenRow(null);
      setReason('');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [reason, reopen, reopenRow]);

  if (!permsLoading && !canView) {
    return (
      <ContentLayout title='Attendance Month Close'>
        <Alert variant='destructive' className='mt-6'>
          <ShieldAlert className='h-4 w-4' />
          <AlertDescription>
            Closing an attendance month is restricted to the HR Head and the Super
            Administrator. Your role does not have access to this page.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Attendance Month Close'>
      <Breadcrumb className='mb-4'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href='/dashboard'>Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href='/hr'>HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className='hidden sm:block' />
          <BreadcrumbItem className='hidden sm:block'>
            <BreadcrumbLink asChild><Link href='/hr/attendance'>Attendance</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Month Close</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mb-4 space-y-1'>
        <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>
          Attendance Month Close
        </h1>
        <p className='max-w-3xl text-sm text-muted-foreground'>
          Freeze the month once the biometric data is in and every request has been decided.
          A month cannot be closed while any leave, short time off or compensatory off is
          still awaiting a decision.
        </p>
      </div>

      {/* Toolbar: stacks on a phone, one row from sm up. */}
      <div className='mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='icon' className='h-9 w-9 shrink-0'
                  onClick={() => shiftMonth(-1)} aria-label='Previous month'>
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <div className='flex-1 rounded-md border px-4 py-1.5 text-center text-sm font-medium sm:min-w-[180px] sm:flex-none'>
            {MONTHS[month - 1]} {year}
          </div>
          <Button variant='outline' size='icon' className='h-9 w-9 shrink-0'
                  onClick={() => shiftMonth(1)} aria-label='Next month'>
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
        <Button variant='outline' size='sm' className='h-9 w-full sm:w-auto'
                onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant='destructive' className='mb-4'>
          <AlertDescription>{getErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {/* 2 columns on a phone rather than 1: these are short numbers, and a
          single column would push the institution list below the fold. */}
      <div className='mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5'>
        <StatCard label='Institutions' value={stats.withData} />
        <StatCard label='Ready to close' value={stats.ready}
                  tone={stats.ready > 0 ? 'text-primary' : undefined} />
        <StatCard label='Blocked' value={stats.blocked}
                  tone={stats.blocked > 0 ? 'text-amber-700 dark:text-amber-400' : undefined} />
        <StatCard label='Closed' value={stats.closed}
                  tone={stats.closed > 0 ? 'text-emerald-700 dark:text-emerald-400' : undefined} />
        <StatCard label='Requests to decide' value={stats.pending}
                  tone={stats.pending > 0 ? 'text-amber-700 dark:text-amber-400' : undefined} />
      </div>

      {stats.blocked > 0 && (
        <Alert className='mb-4'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>
            <span className='font-medium'>
              {stats.blocked} institution(s) cannot be closed yet
            </span>{' '}
            — {stats.pending} request(s) are still awaiting a decision. Every one must be decided before its month can be closed. Start in{' '}
            <Link href='/hr/leave/approvals' className='underline'>Leave Approvals</Link>, or use
            the per-row counts below &mdash; each opens that institution&apos;s queue in a new tab, already filtered to this month.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className='flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
          Loading institutions…
        </div>
      ) : (
        <>
        <CloseConsoleFilters rows={rows} value={stateFilter} onChange={setStateFilter} />
        <CloseConsoleTable
          rows={rows}
          stateFilter={stateFilter}
          year={year}
          month={month}
          canManage={canManage}
          canViewRegister={canViewRegister}
          isSuperAdmin={isSuperAdmin}
          busy={lock.isPending}
          onClose={(row) => { setConfirmRow(row); setGapAcknowledged(false); }}
          onReopen={(row) => { setReopenRow(row); setReason(''); }}
        />
        </>
      )}

      {stats.withData > 0 && stats.closed === stats.withData && (
        <Alert className='mt-5'>
          <CheckCircle2 className='h-4 w-4' />
          <AlertDescription>
            Every institution with attendance data is closed for {MONTHS[month - 1]} {year}. The
            frozen day counts are ready for payroll.
          </AlertDescription>
        </Alert>
      )}

      {/* Plain close. Only reachable when nothing is pending. */}
      <AlertDialog open={Boolean(confirmRow)} onOpenChange={(o) => { if (!o) setConfirmRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Close {MONTHS[month - 1]} {year} for {confirmRow?.institution_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Day counts will be frozen — working days, present, absent, leave by type, comp off
              and loss of pay. After this, leave, short time off and compensatory off covering
              this month can no longer be raised, approved or withdrawn.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmRow ? <CoveragePanel
            row={confirmRow}
            acknowledged={gapAcknowledged}
            onAcknowledge={setGapAcknowledged}
          /> : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                lock.isPending ||
                (confirmRow ? coverageOf(confirmRow).hasGap && !gapAcknowledged : true)
              }
              onClick={(e) => {
                e.preventDefault();
                if (confirmRow) void runLock(confirmRow);
              }}
            >
              {lock.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Close month
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(reopenRow)} onOpenChange={(o) => { if (!o) setReopenRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen {reopenRow?.institution_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The frozen day counts will be discarded, and requests covering this month become
              possible again. Anything already generated from those counts will no longer match.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='reopen-reason'>Reason (required)</Label>
            <Input
              id='reopen-reason'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='Why this month is being reopened'
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reason.trim() || reopen.isPending}
              onClick={(e) => { e.preventDefault(); void runReopen(); }}
            >
              {reopen.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Reopen month
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
