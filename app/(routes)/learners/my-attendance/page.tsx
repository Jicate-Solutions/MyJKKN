/**
 * Student Attendance Page
 * Created: 2025-12-29
 * Description: Student self-service attendance view with analytics
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
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
import { loadAttendanceOverview, resolveAttendanceViewState } from './_lib/load-attendance-overview';

interface PageProps {
  searchParams: Promise<{ semester?: string }>;
}

export default async function StudentAttendancePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

  // Get profile and validate student
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/');
  }

  // Validate student access (lifecycle status check)
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  // Get learner's current semester and program
  const { data: learner } = await supabase
    .from('learners_profiles')
    .select('semester_id, program_id, institution_id')
    .eq('id', profile.learner_id)
    .single();

  const currentSemesterId = learner?.semester_id || '';
  const selectedSemester = params.semester || currentSemesterId;

  // Get all semesters for dropdown (from same program)
  // Fetch semester_code to filter out future semesters
  const { data: allSemesters } = await supabase
    .from('semesters')
    .select('id, semester_name, semester_code')
    .eq('program_id', learner?.program_id)
    .eq('institution_id', learner?.institution_id)
    .eq('is_active', true)
    .order('semester_name');

  // Extract semester number from semester_code (e.g., "BPHARM-SEM-5" → 5)
  const extractSemesterNumber = (code: string | null): number => {
    if (!code) return 0;
    const match = code.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  };

  // Find current semester's number to filter out future semesters
  const currentSem = (allSemesters || []).find(s => s.id === currentSemesterId);
  const currentSemNumber = extractSemesterNumber(currentSem?.semester_code || null);

  // Only show current and past semesters (not future ones)
  const semesters = (allSemesters || [])
    .filter(s => extractSemesterNumber(s.semester_code) <= currentSemNumber)
    .map(({ id, semester_name }) => ({ id, semester_name }));

  // Fetch the attendance records ONCE; statistics, course-wise and trend are
  // derived from that single result. Asking for them separately made the same
  // heavy JSONB fetch run four times per page view. The load carries its own
  // deadline, so a read that never comes back ends as a retryable error rather
  // than a skeleton the learner is stuck on.
  const outcome = await loadAttendanceOverview(profile.learner_id, selectedSemester);
  const viewState = resolveAttendanceViewState(outcome);
  const overview = outcome.status === 'ok' ? outcome.overview : null;

  const retryHref = selectedSemester
    ? `/learners/my-attendance?semester=${encodeURIComponent(selectedSemester)}`
    : '/learners/my-attendance';

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
          semesters={semesters || []}
          selected={selectedSemester}
          currentSemester={currentSemesterId}
        />

        {/* Load failed or ran out of time — say so and offer a retry, never an
            endless skeleton */}
        {viewState === 'error' || !overview ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Attendance could not be loaded
              </CardTitle>
              <CardDescription>
                Something went wrong while loading your attendance for this semester. Your records are safe — this is a display problem. Please try again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={retryHref} className={buttonVariants({ variant: 'outline' })}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </a>
            </CardContent>
          </Card>
        ) : (
          <>
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
                    No attendance records found for the selected semester. Attendance will appear here once your Senior Learners start marking attendance.
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
                <ExportActions
                  learnerId={profile.learner_id}
                  semesterId={selectedSemester}
                />

                {/* Period-wise Table */}
                <Suspense fallback={<TableSkeleton />}>
                  <PeriodWiseAttendanceTable data={overview.records} />
                </Suspense>
              </>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
