/**
 * Course Grades Page (Faculty View)
 * Displays LTI grades for all students in faculty's sections
 *
 * Features:
 * - Filter by program, semester, section
 * - Filter by tool (MATLAB Grader, etc.)
 * - Filter by assignment/resource
 * - View grade distribution
 * - Export to Excel
 *
 * Created: 2026-01-12
 * Updated: 2026-02-28 - Migrated to CourseGradesService (Task 3.3)
 */

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CourseGradesTable } from './_components/course-grades-table';
import { GradeDistributionChart } from './_components/grade-distribution-chart';
import { CourseGradesFilters } from './_components/course-grades-filters';
import { CourseGradesService } from '@/lib/services/academic/course-grades-service';
import type { CourseGrade } from '@/lib/services/academic/course-grades-service';

/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 *
 * /academic/course-grades shares the Assessment tier-2 bucket with
 * /academic/internal-marks (Assessment chip points there).
 */
export const navMeta = {
  invokedFrom: '/academic/internal-marks',
} as const;

export const metadata = {
  title: 'Course Grades',
  description: 'View and manage student grades from external learning tools'
};

interface PageProps {
  searchParams: {
    programId?: string;
    semesterId?: string;
    sectionId?: string;
    toolId?: string;
    resourceLinkId?: string;
  };
}

export default async function CourseGradesPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  // Check user role (faculty, hod, principal, admin)
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const allowedRoles = ['faculty', 'hod', 'principal', 'administrator', 'super_admin'];
  if (!userProfile || !allowedRoles.includes(userProfile.role)) {
    redirect('/dashboard');
  }

  // Get user's institution
  const { data: institutionAccess } = await supabase
    .from('user_institution_access')
    .select('institution_id')
    .eq('user_id', user.id)
    .single();

  if (!institutionAccess) {
    redirect('/dashboard');
  }

  // Fetch data via service
  const [{ data: grades }, filterOptions] = await Promise.all([
    CourseGradesService.getGradesWithClient(supabase, {
      institutionId: institutionAccess.institution_id,
      programId: searchParams.programId,
      semesterId: searchParams.semesterId,
      sectionId: searchParams.sectionId,
      toolId: searchParams.toolId,
      resourceLinkId: searchParams.resourceLinkId
    }),
    CourseGradesService.getFilterOptions(supabase, institutionAccess.institution_id)
  ]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Course Grades</h1>
        <p className="text-muted-foreground mt-1">
          View and manage student grades from external learning tools
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading filters...</div>}>
            <CourseGradesFilters
              programs={filterOptions.programs}
              semesters={filterOptions.semesters}
              sections={filterOptions.sections}
              tools={filterOptions.tools}
              currentFilters={searchParams}
            />
          </Suspense>
        </CardContent>
      </Card>

      {/* Grade Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Grade Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading chart...</div>}>
            <GradeDistributionChart grades={grades} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Grades Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Grades ({grades.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading grades...</div>}>
            <CourseGradesTable grades={grades} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
