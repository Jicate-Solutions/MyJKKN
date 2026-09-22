/**
 * Student Attendance Page
 * Created: 2025-12-29
 * Description: Student self-service attendance view with analytics
 *
 * Every read this page needs happens in _lib/load-attendance-page.ts, under one
 * deadline, so a stalled or refused read ends as a retry the learner can act on
 * rather than a skeleton that never resolves (BUG-004853, BUG-004856).
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SemesterFilter } from './_components/semester-filter';
import { AttendanceStatisticsCards } from './_components/statistics-cards';
import { AttendanceTrendChart } from './_components/trend-chart';
import { CourseWiseTable } from './_components/course-wise-table';
import { ExportActions } from './_components/export-actions';
import { PeriodWiseAttendanceTable } from './_components/period-wise-table';
import { PendingFeedbackBanner } from './_components/pending-feedback-banner';
import { MyConfirmedAttendanceCard } from '@/components/session-feedback/my-confirmed-attendance-card';
import { MyRunningScoreCard } from '@/components/session-feedback/my-running-score-card';
import { TableSkeleton } from '@/components/Loading';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  loadAttendancePage,
  resolveAttendanceViewState,
  STAGE_LABEL
} from './_lib/load-attendance-page';

interface PageProps {
  searchParams: Promise<{ semester?: string }>;
}

export default async function StudentAttendancePage({ searchParams }: PageProps) {
  const params = await searchParams;

  // One bounded load covering sign-in, profile, lifecycle, learner record,
  // semester list and attendance. It returns a decision; it never redirects.
  const load = await loadAttendancePage(params.semester);

  if (load.status === 'redirect') {
    redirect(load.to);
  }

  const viewState = resolveAttendanceViewState(load);
  const semesterForRetry = load.status === 'ok' ? load.selectedSemester : params.semester;
  const retryHref = semesterForRetry
    ? `/learners/my-attendance?semester=${encodeURIComponent(semesterForRetry)}`
    : '/learners/my-attendance';

  // A failed load cannot say which semester is current or list the others, so
  // the retry card stands alone rather than beside a half-built filter.
  if (load.status === 'failed') {
    return (
      <ContentLayout title="My Attendance">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learners' },
            { label: 'Attendance' }
          ]}
        />

        <div className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Attendance could not be loaded
              </CardTitle>
              <CardDescription>
                We couldn&apos;t load {STAGE_LABEL[load.stage]} just now. This is a problem on our
                side, not with your account, and none of your attendance has changed. Please try
                again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={retryHref} className={buttonVariants({ variant: 'outline' })}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </a>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const { overview, semesters, selectedSemester, currentSemesterId, learnerId } = load;

  return (
    <ContentLayout title="My Attendance">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Attendance' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Present-pending nudge — self-hides when nothing is pending */}
        <PendingFeedbackBanner />

        {/* Confirmed-attendance % + early warning (advisory; hidden when enforcement is off) */}
        <MyConfirmedAttendanceCard />

        {/* Per-course exam-eligibility transparency: starts at 100, comes down
            with each absence — the same day-one record the exam audit holds
            departments to. Self-scoped + self-hides when empty. */}
        <MyRunningScoreCard />

        {/* Semester Filter */}
        <SemesterFilter
          semesters={semesters}
          selected={selectedSemester}
          currentSemester={currentSemesterId}
        />

        {/* Statistics Cards — always shown so attendance % is visible even with no records */}
        <AttendanceStatisticsCards stats={overview.statistics} />

        {/* Show message if no attendance data, otherwise show full breakdown */}
        {viewState === 'empty' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                No Attendance Records
              </CardTitle>
              <CardDescription>
                No attendance records found for the selected semester. Attendance will appear here
                once your Senior Learners start marking attendance.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            {/* Trend Chart */}
            {overview.trend.length > 0 && <AttendanceTrendChart data={overview.trend} />}

            {/* Course-wise Table */}
            <CourseWiseTable data={overview.courseWise} />

            {/* Export Actions */}
            <ExportActions learnerId={learnerId} semesterId={selectedSemester} />

            {/* Period-wise Table */}
            <Suspense fallback={<TableSkeleton />}>
              <PeriodWiseAttendanceTable data={overview.records} />
            </Suspense>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
