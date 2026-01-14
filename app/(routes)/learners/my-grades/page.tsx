/**
 * My Grades Page
 * Displays LTI grades from external tools (MATLAB, etc.)
 *
 * Shows:
 * - Assignment name
 * - Score (x/y and percentage)
 * - Date graded
 * - Status (activity progress, grading progress)
 * - Tool name
 *
 * Created: 2026-01-12
 */

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GradesTable } from './_components/grades-table';
import { GradeStats } from './_components/grade-stats';

export const metadata = {
  title: 'My Grades | MyJKKN',
  description: 'View your grades from external learning tools'
};

// Type for grade data with flattened joins
type GradeData = {
  id: string;
  resource_link_title: string | null;
  score: number;
  score_maximum: number;
  score_percentage: number;
  activity_progress: string | null;
  grading_progress: string | null;
  graded_at: string | null;
  received_at: string;
  lti_tools: {
    name: string;
    tool_type: string;
  };
};

async function getGrades(userId: string): Promise<GradeData[]> {
  const supabase = await createClient();

  const { data: grades, error } = await supabase
    .from('lti_grades')
    .select(
      `
      id,
      resource_link_title,
      score,
      score_maximum,
      score_percentage,
      activity_progress,
      grading_progress,
      graded_at,
      received_at,
      lti_tools!inner (
        name,
        tool_type
      )
    `
    )
    .eq('user_id', userId)
    .order('graded_at', { ascending: false });

  if (error) {
    console.error('[My Grades] Error fetching grades:', error);
    throw new Error('Failed to load grades');
  }

  // Transform the data to flatten arrays from joins
  const transformedGrades: GradeData[] = (grades || []).map((item: any) => ({
    id: item.id,
    resource_link_title: item.resource_link_title,
    score: item.score,
    score_maximum: item.score_maximum,
    score_percentage: item.score_percentage,
    activity_progress: item.activity_progress,
    grading_progress: item.grading_progress,
    graded_at: item.graded_at,
    received_at: item.received_at,
    lti_tools: Array.isArray(item.lti_tools)
      ? item.lti_tools[0]
      : item.lti_tools
  }));

  return transformedGrades;
}

// Type for user profile with flattened joins
type UserProfile = {
  id: string;
  first_name: string;
  last_name: string;
  programs: { name: string } | null;
  semesters: { name: string } | null;
  sections: { name: string } | null;
};

async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('learners_profiles')
    .select(
      `
      id,
      first_name,
      last_name,
      programs (name),
      semesters (name),
      sections (name)
    `
    )
    .eq('user_id', userId)
    .single();

  if (!profile) return null;

  // Transform the data to flatten arrays from joins
  return {
    id: profile.id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    programs: Array.isArray(profile.programs)
      ? profile.programs[0]
      : profile.programs,
    semesters: Array.isArray(profile.semesters)
      ? profile.semesters[0]
      : profile.semesters,
    sections: Array.isArray(profile.sections)
      ? profile.sections[0]
      : profile.sections
  };
}

export default async function MyGradesPage() {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  // Check user role (only students/learners)
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!userProfile || userProfile.role !== 'student') {
    redirect('/dashboard');
  }

  // Fetch data
  const [grades, profile] = await Promise.all([
    getGrades(user.id),
    getUserProfile(user.id)
  ]);

  const studentName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : 'Student';

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Grades</h1>
        <p className="text-muted-foreground mt-1">
          View your grades from external learning tools
        </p>
      </div>

      {/* Student Info */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{studentName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Program</p>
              <p className="font-medium">{profile.programs?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Semester</p>
              <p className="font-medium">{profile.semesters?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Section</p>
              <p className="font-medium">{profile.sections?.name || 'N/A'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grade Statistics */}
      <Suspense fallback={<div>Loading statistics...</div>}>
        <GradeStats grades={grades} />
      </Suspense>

      {/* Grades Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Grades</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading grades...</div>}>
            <GradesTable grades={grades} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
