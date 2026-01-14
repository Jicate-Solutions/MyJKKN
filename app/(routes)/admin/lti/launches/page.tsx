/**
 * LTI Launch Debug View
 * Detailed view of all LTI launches for debugging and monitoring
 *
 * Features:
 * - View all launch records with full details
 * - Filter by user, institution, tool, date range
 * - See JWT nonce, expiration, and claims
 * - Link to related grades
 * - Session tracking
 *
 * Created: 2026-01-12
 */

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LaunchDebugTable } from './_components/launch-debug-table';
import { LaunchDebugFilters } from './_components/launch-debug-filters';
import { LaunchDebugStats } from './_components/launch-debug-stats';
import { subDays, startOfDay, endOfDay } from 'date-fns';

export const metadata = {
  title: 'LTI Launch Debug View | MyJKKN',
  description: 'Debug and monitor LTI tool launches'
};

interface PageProps {
  searchParams: {
    startDate?: string;
    endDate?: string;
    toolId?: string;
    institutionId?: string;
    userId?: string;
    launchType?: string;
  };
}

// Type for the launch data returned from Supabase
type LaunchData = {
  id: string;
  launched_at: string;
  launch_type: string;
  lti_message_type: string;
  user_role_sent: string;
  myjkkn_role: string;
  context_id: string;
  context_label: string;
  context_title: string;
  resource_link_id: string | null;
  resource_link_title: string | null;
  jwt_nonce: string;
  jwt_expires_at: string;
  session_duration_seconds: number | null;
  ip_address: string;
  user_id: string;
  lti_tools: {
    id: string;
    name: string;
    tool_type: string;
  };
  institutions: {
    id: string;
    name: string;
    short_name: string;
  };
  learners_profiles: {
    first_name: string;
    last_name: string;
    roll_number: string;
  } | null;
};

async function getLaunchData(
  startDate: Date,
  endDate: Date,
  toolId?: string,
  institutionId?: string,
  userId?: string,
  launchType?: string
): Promise<LaunchData[]> {
  const supabase = await createClient();

  let query = supabase
    .from('lti_launches')
    .select(
      `
      id,
      launched_at,
      launch_type,
      lti_message_type,
      user_role_sent,
      myjkkn_role,
      context_id,
      context_label,
      context_title,
      resource_link_id,
      resource_link_title,
      jwt_nonce,
      jwt_expires_at,
      session_duration_seconds,
      ip_address,
      user_id,
      lti_tools!inner (
        id,
        name,
        tool_type
      ),
      institutions!inner (
        id,
        name,
        short_name
      ),
      learners_profiles (
        first_name,
        last_name,
        roll_number
      )
    `
    )
    .gte('launched_at', startDate.toISOString())
    .lte('launched_at', endDate.toISOString())
    .order('launched_at', { ascending: false })
    .limit(100); // Limit to most recent 100 launches

  if (toolId) {
    query = query.eq('tool_id', toolId);
  }

  if (institutionId) {
    query = query.eq('institution_id', institutionId);
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (launchType && launchType !== 'all') {
    query = query.eq('launch_type', launchType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[LTI Launch Debug] Error fetching data:', error);
    throw new Error('Failed to load launch data');
  }

  // Transform the data to match expected type (flatten the arrays from joins)
  const transformedData: LaunchData[] = (data || []).map((item: any) => ({
    id: item.id,
    launched_at: item.launched_at,
    launch_type: item.launch_type,
    lti_message_type: item.lti_message_type,
    user_role_sent: item.user_role_sent,
    myjkkn_role: item.myjkkn_role,
    context_id: item.context_id,
    context_label: item.context_label,
    context_title: item.context_title,
    resource_link_id: item.resource_link_id,
    resource_link_title: item.resource_link_title,
    jwt_nonce: item.jwt_nonce,
    jwt_expires_at: item.jwt_expires_at,
    session_duration_seconds: item.session_duration_seconds,
    ip_address: item.ip_address,
    user_id: item.user_id,
    lti_tools: Array.isArray(item.lti_tools) ? item.lti_tools[0] : item.lti_tools,
    institutions: Array.isArray(item.institutions)
      ? item.institutions[0]
      : item.institutions,
    learners_profiles: item.learners_profiles
      ? Array.isArray(item.learners_profiles)
        ? item.learners_profiles[0]
        : item.learners_profiles
      : null
  }));

  return transformedData;
}

async function getLaunchStats(startDate: Date, endDate: Date) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('lti_launches')
    .select('id, launch_type, user_role_sent, session_duration_seconds')
    .gte('launched_at', startDate.toISOString())
    .lte('launched_at', endDate.toISOString());

  if (error) {
    console.error('[LTI Launch Debug] Error fetching stats:', error);
    return {
      totalLaunches: 0,
      avgSessionDuration: 0,
      studentLaunches: 0,
      facultyLaunches: 0
    };
  }

  const totalLaunches = data.length;
  const studentLaunches = data.filter((l: any) =>
    l.user_role_sent?.includes('Learner')
  ).length;
  const facultyLaunches = data.filter((l: any) =>
    l.user_role_sent?.includes('Instructor')
  ).length;

  const sessionsWithDuration = data.filter(
    (l: any) => l.session_duration_seconds && l.session_duration_seconds > 0
  );
  const avgSessionDuration =
    sessionsWithDuration.length > 0
      ? sessionsWithDuration.reduce(
          (sum: number, l: any) => sum + l.session_duration_seconds,
          0
        ) / sessionsWithDuration.length
      : 0;

  return {
    totalLaunches,
    avgSessionDuration: Math.round(avgSessionDuration),
    studentLaunches,
    facultyLaunches
  };
}

async function getFilterOptions() {
  const supabase = await createClient();

  const [toolsResult, institutionsResult] = await Promise.all([
    supabase
      .from('lti_tools')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
    supabase.from('institutions').select('id, name, short_name').order('name')
  ]);

  return {
    tools: toolsResult.data || [],
    institutions: institutionsResult.data || []
  };
}

export default async function LaunchDebugPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  // Check admin role
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const allowedRoles = ['administrator', 'super_admin'];
  if (!userProfile || !allowedRoles.includes(userProfile.role)) {
    redirect('/dashboard');
  }

  // Parse date range
  const endDate = searchParams.endDate
    ? new Date(searchParams.endDate)
    : endOfDay(new Date());

  const startDate = searchParams.startDate
    ? new Date(searchParams.startDate)
    : startOfDay(subDays(endDate, 7)); // Default: last 7 days

  // Fetch data
  const [launches, stats, filterOptions] = await Promise.all([
    getLaunchData(
      startDate,
      endDate,
      searchParams.toolId,
      searchParams.institutionId,
      searchParams.userId,
      searchParams.launchType
    ),
    getLaunchStats(startDate, endDate),
    getFilterOptions()
  ]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          LTI Launch Debug View
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor and debug LTI tool launches with detailed session information
        </p>
      </div>

      {/* Statistics Cards */}
      <Suspense fallback={<div>Loading statistics...</div>}>
        <LaunchDebugStats
          totalLaunches={stats.totalLaunches}
          avgSessionDuration={stats.avgSessionDuration}
          studentLaunches={stats.studentLaunches}
          facultyLaunches={stats.facultyLaunches}
        />
      </Suspense>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading filters...</div>}>
            <LaunchDebugFilters
              tools={filterOptions.tools}
              institutions={filterOptions.institutions}
              currentFilters={searchParams}
            />
          </Suspense>
        </CardContent>
      </Card>

      {/* Launch Table */}
      <Card>
        <CardHeader>
          <CardTitle>Launch Records ({launches.length})</CardTitle>
          <p className="text-sm text-muted-foreground">
            Showing most recent 100 launches in selected date range
          </p>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading launches...</div>}>
            <LaunchDebugTable launches={launches} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
