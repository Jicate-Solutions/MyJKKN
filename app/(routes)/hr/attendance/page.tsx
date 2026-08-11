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
import { CalendarRange, ListChecks, UserX } from 'lucide-react';

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
} from '@/hooks/hr/use-attendance-records';
import {
  currentMonthKey,
  formatDuration,
  monthLabel,
  type MonthKey,
} from '@/types/hr-attendance';

import { AttendanceCalendarTab } from './_components/attendance-calendar-tab';
import { AttendanceLogTab } from './_components/attendance-log-tab';
import { AttendanceMonthPicker } from './_components/attendance-month-picker';
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

  const { logDays, weeks, summary, isLoading, isFetching, isEmptyMonth, refresh } =
    useAttendanceMonthView(staffId, month);
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

                <AttendanceMonthPicker
                  month={month}
                  onMonthChange={(m) => setParam('month', m)}
                  onRefresh={refresh}
                  isFetching={isFetching}
                />
              </div>

              <MonthSummaryStrip summary={summary} className="mt-4" />

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
                  canRegularize={canRegularizeSelf && !viewingOther}
                />
              </TabsContent>

              <TabsContent value="calendar" className="mt-4">
                <AttendanceCalendarTab weeks={weeks} isLoading={isLoading} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ContentLayout>
  );
}

function MonthSummaryStrip({
  summary,
  className,
}: {
  summary: ReturnType<typeof useAttendanceMonthView>['summary'];
  className?: string;
}) {
  const stats: Array<[string, string | number]> = [
    ['Present', summary.present],
    ['Half day', summary.halfDay],
    ['Absent', summary.absent],
    ['Leave', summary.leave],
    ['Week off', summary.weeklyOff],
    ['Holiday', summary.holiday],
    ['Not processed', summary.pending],
    ['Effective', formatDuration(summary.effectiveMinutes)],
  ];

  return (
    <div className={className}>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4 lg:grid-cols-8">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-card px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-base font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
