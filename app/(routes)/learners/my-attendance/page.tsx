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
import { StudentAttendanceService } from '@/lib/services/learners/student-attendance-service';
import { SemesterFilter } from './_components/semester-filter';
import { AttendanceStatisticsCards } from './_components/statistics-cards';
import { AttendanceTrendChart } from './_components/trend-chart';
import { CourseWiseTable } from './_components/course-wise-table';
import { ExportActions } from './_components/export-actions';
import { PeriodWiseAttendanceTable } from './_components/period-wise-table';
import { TableSkeleton } from '@/components/Loading';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

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

  // Get all semesters for dropdown (from same program - shows historical semesters)
  const { data: semesters } = await supabase
    .from('semesters')
    .select('id, semester_name')
    .eq('program_id', learner?.program_id)
    .eq('institution_id', learner?.institution_id)
    .eq('is_active', true)
    .order('semester_name');

  // Fetch attendance data in parallel
  let statistics: Awaited<ReturnType<typeof StudentAttendanceService.getAttendanceStatistics>> = {
    totalClasses: 0,
    presentCount: 0,
    absentCount: 0,
    percentage: 0,
    threshold: 75,
    isAboveThreshold: false
  };
  let courseWise: Awaited<ReturnType<typeof StudentAttendanceService.getCourseWiseAttendance>> = [];
  let trendData: Awaited<ReturnType<typeof StudentAttendanceService.getAttendanceTrend>> = [];
  let attendanceRecords: Awaited<ReturnType<typeof StudentAttendanceService.getStudentAttendanceBySemester>> = [];

  try {
    [statistics, courseWise, trendData, attendanceRecords] = await Promise.all([
      StudentAttendanceService.getAttendanceStatistics(profile.learner_id, selectedSemester),
      StudentAttendanceService.getCourseWiseAttendance(profile.learner_id, selectedSemester),
      StudentAttendanceService.getAttendanceTrend(profile.learner_id, selectedSemester),
      StudentAttendanceService.getStudentAttendanceBySemester(profile.learner_id, selectedSemester)
    ]);
  } catch (error) {
    console.error('[learners/my-attendance] Error fetching attendance data:', error);
  }

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
        {/* Semester Filter */}
        <SemesterFilter
          semesters={semesters || []}
          selected={selectedSemester}
          currentSemester={currentSemesterId}
        />

        {/* Show message if no attendance data */}
        {attendanceRecords.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                No Attendance Records
              </CardTitle>
              <CardDescription>
                No attendance records found for the selected semester. Attendance will appear here once your faculty starts marking attendance.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            {/* Statistics Cards */}
            <AttendanceStatisticsCards stats={statistics} />

            {/* Trend Chart */}
            {trendData.length > 0 && <AttendanceTrendChart data={trendData} />}

            {/* Course-wise Table */}
            <CourseWiseTable data={courseWise} />

            {/* Export Actions */}
            <ExportActions
              learnerId={profile.learner_id}
              semesterId={selectedSemester}
            />

            {/* Period-wise Table */}
            <Suspense fallback={<TableSkeleton />}>
              <PeriodWiseAttendanceTable data={attendanceRecords} />
            </Suspense>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
