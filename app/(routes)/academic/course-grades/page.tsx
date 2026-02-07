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
 */

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CourseGradesTable } from './_components/course-grades-table';
import { GradeDistributionChart } from './_components/grade-distribution-chart';
import { CourseGradesFilters } from './_components/course-grades-filters';

export const metadata = {
  title: 'Course Grades | MyJKKN',
  description: 'View and manage student grades from external learning tools'
};

interface PageProps {
  searchParams: Promise<{
    programId?: string;
    semesterId?: string;
    sectionId?: string;
    toolId?: string;
    resourceLinkId?: string;
  }>;
}

// Type for the grade data returned from Supabase (with arrays from joins)
type GradeData = {
  id: string;
  resource_link_id: string;
  resource_link_title: string | null;
  score: number;
  score_maximum: number;
  score_percentage: number;
  activity_progress: string | null;
  grading_progress: string | null;
  graded_at: string | null;
  received_at: string;
  lti_tools: {
    id: string;
    name: string;
    tool_type: string;
  };
  learners_profiles: {
    id: string;
    first_name: string;
    last_name: string;
    roll_number: string | null;
    program_id: string;
    semester_id: string;
    section_id: string;
    programs: { name: string } | null;
    semesters: { name: string } | null;
    sections: { name: string } | null;
  };
};

async function getGrades(
  institutionId: string,
  filters: {
    programId?: string;
    semesterId?: string;
    sectionId?: string;
    toolId?: string;
    resourceLinkId?: string;
  }
): Promise<GradeData[]> {
  const supabase = await createClient();

  let query = supabase
    .from('lti_grades')
    .select(
      `
      id,
      resource_link_id,
      resource_link_title,
      score,
      score_maximum,
      score_percentage,
      activity_progress,
      grading_progress,
      graded_at,
      received_at,
      lti_tools!inner (
        id,
        name,
        tool_type
      ),
      learners_profiles!inner (
        id,
        first_name,
        last_name,
        roll_number,
        program_id,
        semester_id,
        section_id,
        programs (name),
        semesters (name),
        sections (name)
      )
    `
    )
    .eq('institution_id', institutionId)
    .order('graded_at', { ascending: false });

  if (filters.programId) {
    query = query.eq('learners_profiles.program_id', filters.programId);
  }

  if (filters.semesterId) {
    query = query.eq('learners_profiles.semester_id', filters.semesterId);
  }

  if (filters.sectionId) {
    query = query.eq('learners_profiles.section_id', filters.sectionId);
  }

  if (filters.toolId) {
    query = query.eq('tool_id', filters.toolId);
  }

  if (filters.resourceLinkId) {
    query = query.eq('resource_link_id', filters.resourceLinkId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Course Grades] Error fetching grades:', error);
    throw new Error('Failed to load grades');
  }

  // Transform the data to match expected type (flatten the arrays from joins)
  const transformedData: GradeData[] = (data || []).map((item: any) => ({
    id: item.id,
    resource_link_id: item.resource_link_id,
    resource_link_title: item.resource_link_title,
    score: item.score,
    score_maximum: item.score_maximum,
    score_percentage: item.score_percentage,
    activity_progress: item.activity_progress,
    grading_progress: item.grading_progress,
    graded_at: item.graded_at,
    received_at: item.received_at,
    lti_tools: Array.isArray(item.lti_tools) ? item.lti_tools[0] : item.lti_tools,
    learners_profiles: Array.isArray(item.learners_profiles)
      ? item.learners_profiles[0]
      : item.learners_profiles
  }));

  return transformedData;
}

async function getFilterOptions(institutionId: string) {
  const supabase = await createClient();

  // Get programs
  const { data: programs } = await supabase
    .from('programs')
    .select('id, name')
    .eq('institution_id', institutionId)
    .order('name');

  // Get semesters
  const { data: semesters } = await supabase
    .from('semesters')
    .select('id, name')
    .order('name');

  // Get sections
  const { data: sections } = await supabase
    .from('sections')
    .select('id, name')
    .order('name');

  // Get tools
  const { data: tools } = await supabase
    .from('lti_tools')
    .select('id, name, tool_type')
    .eq('is_active', true)
    .order('name');

  return {
    programs: programs || [],
    semesters: semesters || [],
    sections: sections || [],
    tools: tools || []
  };
}

export default async function CourseGradesPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
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

  // Fetch data
  const [grades, filterOptions] = await Promise.all([
    getGrades(institutionAccess.institution_id, resolvedSearchParams),
    getFilterOptions(institutionAccess.institution_id)
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
              currentFilters={resolvedSearchParams}
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
