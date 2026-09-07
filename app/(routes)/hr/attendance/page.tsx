'use client';

// ============================================================================
// HR — My Attendance
// Rewritten: 2026-08-09.
// Plan: docs/superpowers/plans/2026-08-09-my-attendance-log-and-calendar.md
//
// WHAT THIS REPLACED
//   Until now this route was a static hub of three link cards (Regularize,
//   Regularize Approvals, Import Punches), built 2026-05-11 only so the
//   sidebar's "Attendance" entry would not 404. It showed no attendance to
//   anyone. Those three cards are admin-facing and now live on /hr/admin;
//   self-service regularization is reachable per-day from the log's Actions
//   column, which is where the correction is actually needed.
//
// DATA
//   Both tabs read hr_attendance_records, which is day-grain and already the
//   convergence point for four writers: the biometric importer (PRESENT /
//   HALF_DAY / ABSENT / WEEKLY_OFF), tr_recompute_attendance_on_holiday_change
//   (HOLIDAY), tr_recompute_attendance_on_leave_approval (LEAVE), and the
//   regularization service (REGULARIZED). No client-side merge required.
//
// ACCESS
//   Not enforced here beyond deciding what to render. hr_attendance_records_select
//   already permits super admin, is_admin(), the row's own staff member
//   (staff.profile_id = auth.uid()), and hr.attendance.view_all / .override
//   holders within role_has_institution_access(). The staff filter below is a
//   convenience for the 2 roles that hold view_all; RLS is the boundary.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, CalendarX, CheckCircle2, Clock, ListChecks, UserX } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';

import { usePermissions } from '@/hooks/use-permissions';
import { useCurrentEmployee } from '@/hooks/hr/use-regularization';
import {
  useAttendanceMonthsWithData,
  useAttendanceMonthView,
  type AttendancePeriodResolution,
} from '@/hooks/hr/use-attendance-records';
import {
  currentMonthKey,
  isPeriodClosed,
  monthLabel,
  type MonthKey,
} from '@/types/hr-attendance';
import { cn } from '@/lib/utils';

import { AttendanceCalendarTab } from './_components/attendance-calendar-tab';
import { AttendanceLogTab } from './_components/attendance-log-tab';
import { AttendanceMonthPicker } from './_components/attendance-month-picker';
import { AttendanceSummaryCards } from './_components/attendance-summary-cards';
import {
  AttendanceStaffFilter,
  type SelectedStaff,
} from './_components/attendance-staff-filter';

/** Reject a malformed or future ?month= rather than rendering an empty grid. */
function readMonthParam(raw: string | null): MonthKey {
  const now = currentMonthKey();
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return now;
  return raw > now ? now : raw;
}

export default function MyAttendancePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { can, isSuperAdmin, isLoading: permLoading } = usePermissions();
  const { data: employee, isLoading: empLoading } = useCurrentEmployee();

  const canViewAll = isSuperAdmin || can('hr.attendance.view_all');
  const canRegularizeSelf = isSuperAdmin || can('hr.attendance.regularize_self');
  // MIRRORS hr_attendance_periods_select EXACTLY. RLS denial returns zero rows,
  // not an error, so without this a viewer who cannot read the table at all
  // would be told the month "has not been closed" — a confident wrong answer
  // about a month that may well be closed. Checking the same predicate the
  // policy checks costs no extra request: usePermissions is already loaded.
  const canReadPeriod =
    isSuperAdmin || can('hr.attendance.view_self') || can('hr.attendance.period.view');
  // Whoever can go and do something about it gets the badge as a link.
  const canManagePeriod =
    isSuperAdmin ||
    can('hr.attendance.period.view') ||
    can('hr.attendance.period.manage');

  const tab = searchParams.get('tab') === 'calendar' ? 'calendar' : 'log';
  const month = readMonthParam(searchParams.get('month'));

  // Held in component state, not the URL. The URL can only carry the staff id,
  // and a page that renders a bare UUID as the person's name while it resolves
  // is worse than one that simply does not deep-link.
  const [selectedStaff, setSelectedStaff] = useState<SelectedStaff | null>(null);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const selfName = useMemo(
    () => [employee?.first_name, employee?.last_name].filter(Boolean).join(' ').trim() || 'Me',
    [employee?.first_name, employee?.last_name],
  );

  const staffId = selectedStaff?.id ?? employee?.id ?? null;
  const viewingOther = Boolean(selectedStaff && selectedStaff.id !== employee?.id);

  const {
    logDays, weeks, summary, isLoading, isFetching, isEmptyMonth, period, periodResolution, refresh,
  } = useAttendanceMonthView(staffId, month);
  const { data: monthsWithData } = useAttendanceMonthsWithData(staffId);

  const gateLoading = permLoading || empLoading;

  return (
    <ContentLayout title="My Attendance">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Attendance</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 space-y-5">
        <PageHeader
          title={viewingOther ? `Attendance — ${selectedStaff!.name}` : 'My Attendance'}
          description={
            viewingOther
              ? 'Viewing another staff member’s record. Self-service corrections are unavailable here.'
              : 'Your day-by-day attendance, reconciled from the biometric machines against your configured shift timings.'
          }
        />

        {gateLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !employee ? (
          <EmptyState
            icon={<UserX className="h-10 w-10 text-muted-foreground" />}
            title="No staff record linked"
            description="My Attendance reads the record attached to your staff profile. Contact HR if you believe this is an error."
          />
        ) : employee.hr_included === false ? (
          // A DIFFERENT state from "no staff record": the person exists, their
          // employment category simply takes no part in HR. Saying "no record"
          // here would send them chasing a data fix that is actually a policy.
          <EmptyState
            icon={<UserX className="h-10 w-10 text-muted-foreground" />}
            title="Not managed in HR"
            description="Your employment category is not included in the HR module, so no attendance is recorded for you here. Contact HR if you believe this is an error."
          />
        ) : (
          <>
            {canViewAll && (
              <AttendanceStaffFilter
                selected={selectedStaff}
                onSelect={setSelectedStaff}
                onReset={() => setSelectedStaff(null)}
                selfName={selfName}
              />
            )}

            <Tabs value={tab} onValueChange={(v) => setParam('tab', v)}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="log">
                    <ListChecks className="mr-2 h-4 w-4" />
                    Attendance Log
                  </TabsTrigger>
                  <TabsTrigger value="calendar">
                    <CalendarRange className="mr-2 h-4 w-4" />
                    Calendar
                  </TabsTrigger>
                </TabsList>

                <div className="flex flex-wrap items-center gap-2">
                  <PeriodStatusBadge
                    resolution={periodResolution}
                    month={month}
                    lockedAt={period?.locked_at ?? null}
                    canRead={canReadPeriod}
                    canManage={canManagePeriod}
                  />
                  <AttendanceMonthPicker
                    month={month}
                    onMonthChange={(m) => setParam('month', m)}
                    onRefresh={refresh}
                    isFetching={isFetching}
                  />
                </div>
              </div>

              <AttendanceSummaryCards
                summary={summary}
                closed={isPeriodClosed(period)}
                className="mt-4"
              />

              {!isLoading && isEmptyMonth && (
                <EmptyMonthNotice
                  month={month}
                  monthsWithData={monthsWithData ?? []}
                  onJump={(m) => setParam('month', m)}
                />
              )}

              <TabsContent value="log" className="mt-4">
                <AttendanceLogTab
                  days={logDays}
                  isLoading={isLoading}
                />
              </TabsContent>

              <TabsContent value="calendar" className="mt-4">
                <AttendanceCalendarTab
                  weeks={weeks}
                  isLoading={isLoading}
                  closed={isPeriodClosed(period)}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ContentLayout>
  );
}

/**
 * Whether HR has finished with this month.
 *
 * The page previously said nothing about it, so a staff member who watched HR
 * close the month saw an unchanged screen and could not tell a finalised month
 * from one still being imported — "Not processed: 0" reads the same either way,
 * because it counts days with no record, not whether the month is signed off.
 *
 * THE MISSING THIRD STATE (2026-09-05). This rendered Closed, Open, or nothing
 * at all, and "nothing at all" was doing the most work: on 2026-09-05
 * hr_attendance_periods held ONE row in the whole table (JKKN Main Office,
 * July 2026), so every other institution-month — including August, which has
 * 8,370 imported records — produced a silent badge. A month nobody has ever
 * closed looked exactly like a month whose badge had not loaded, which is why
 * blocked August payroll reads as a payroll fault rather than a missing input.
 * `not_created` now says so and points at the screen that fixes it.
 *
 * It is stated ONLY when the page is entitled to state it: `canRead` mirrors
 * hr_attendance_periods_select, because an RLS denial returns zero rows rather
 * than an error and would otherwise be reported as "never closed".
 */
function PeriodStatusBadge({
  resolution,
  month,
  lockedAt,
  canRead,
  canManage,
}: {
  resolution: AttendancePeriodResolution;
  month: MonthKey;
  lockedAt: string | null;
  canRead: boolean;
  canManage: boolean;
}) {
  // 'unresolved' = nothing imported for this month, so there is no institution
  // to ask about and the query never ran; 'unknown' = the read has not landed.
  // Both are silence, exactly as before — the empty-month notice below already
  // explains the first, and inventing a close state for either would be a
  // guess dressed as a fact.
  if (resolution === 'unresolved' || resolution === 'unknown') return null;

  if (resolution === 'closed') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        title={
          lockedAt
            ? `${monthLabel(month)} was finalised on ${new Date(lockedAt).toLocaleDateString('en-GB')}. Attendance for this month can no longer change.`
            : undefined
        }
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Closed
      </span>
    );
  }

  if (resolution === 'not_created') {
    if (!canRead) return null;

    const title =
      `${monthLabel(month)} has no attendance period yet — HR has never closed this month, ` +
      'so the day counts are still moving and payroll cannot read them. A period is created ' +
      'by closing the month in HR › Attendance › Month Close; ask HR if that is not you.';

    const body = (
      <>
        <CalendarX className="h-3.5 w-3.5" />
        No attendance period
      </>
    );

    const className =
      'inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300';

    // Only linked for someone who can actually open that screen; for everyone
    // else the title names who to ask instead of offering a dead end.
    return canManage ? (
      <Link href="/hr/attendance/close" className={cn(className, 'hover:underline')} title={title}>
        {body}
      </Link>
    ) : (
      <span className={className} title={title}>
        {body}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground"
      title={`${monthLabel(month)} has been opened but not closed. Attendance for this month can still change.`}
    >
      <Clock className="h-3.5 w-3.5" />
      Open
    </span>
  );
}

/**
 * An empty month is ambiguous — it can mean "you were never marked" or "no
 * import has covered this month yet". Naming the months that do hold data
 * turns a dead end into a next step.
 */
function EmptyMonthNotice({
  month,
  monthsWithData,
  onJump,
}: {
  month: MonthKey;
  monthsWithData: MonthKey[];
  onJump: (month: MonthKey) => void;
}) {
  const others = monthsWithData.filter((m) => m !== month).slice(0, 3);

  return (
    <div className="mt-4 rounded-md border border-dashed bg-muted/30 p-4 text-sm">
      <p className="font-medium">No attendance recorded for {monthLabel(month)}.</p>
      {others.length > 0 ? (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
          Records exist for:
          {others.map((m) => (
            <Button key={m} variant="outline" size="sm" className="h-7" onClick={() => onJump(m)}>
              {monthLabel(m)}
            </Button>
          ))}
        </p>
      ) : (
        <p className="mt-1 text-muted-foreground">
          Nothing has been imported for this staff member yet. Attendance appears once HR uploads
          the biometric export for a month in which this person has an enrolment code.
        </p>
      )}
    </div>
  );
}
