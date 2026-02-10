/**
 * LTI Analytics Dashboard
 * Comprehensive analytics for LTI tool usage
 *
 * Features:
 * - Launch statistics (total, unique users, success rate)
 * - Launches per day (line chart)
 * - Tool usage breakdown (bar chart)
 * - Student vs Faculty usage (pie chart)
 * - Top institutions (bar chart)
 * - Date range filtering
 * - Export to Excel
 *
 * Created: 2026-01-12
 */

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LaunchStatsCards } from './_components/launch-stats-cards';
import { LaunchesOverTimeChart } from './_components/launches-over-time-chart';
import { ToolUsageChart } from './_components/tool-usage-chart';
import { UserRoleDistribution } from './_components/user-role-distribution';
import { TopInstitutionsChart } from './_components/top-institutions-chart';
import { AnalyticsFilters } from './_components/analytics-filters';
import { subDays, startOfDay, endOfDay } from 'date-fns';

export const metadata = {
  title: 'LTI Analytics | MyJKKN',
  description: 'Analytics and monitoring for LTI tool integrations'
};

interface PageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    institutionId?: string;
    toolId?: string;
  }>;
}

async function getLaunchStats(
  startDate: Date,
  endDate: Date,
  institutionId?: string,
  toolId?: string
) {
  const supabase = await createClient();

  let query = supabase
    .from('lti_launches')
    .select('id, user_id, tool_id, myjkkn_role, launched_at, institution_id');

  query = query
    .gte('launched_at', startDate.toISOString())
    .lte('launched_at', endDate.toISOString());

  if (institutionId) {
    query = query.eq('institution_id', institutionId);
  }

  if (toolId) {
    query = query.eq('tool_id', toolId);
  }

  const { data: launches, error } = await query;

  if (error) {
    console.error('[LTI Analytics] Error fetching launches:', error);
    throw new Error('Failed to load analytics');
  }

  // Calculate statistics
  const totalLaunches = launches.length;
  const uniqueUsers = new Set(launches.map((l: any) => l.user_id)).size;
  const studentLaunches = launches.filter(
    (l: any) => l.myjkkn_role === 'student'
  ).length;
  const facultyLaunches = launches.filter((l: any) =>
    ['faculty', 'hod', 'principal'].includes(l.myjkkn_role)
  ).length;

  return {
    totalLaunches,
    uniqueUsers,
    studentLaunches,
    facultyLaunches,
    launches
  };
}

async function getToolStats(
  startDate: Date,
  endDate: Date,
  institutionId?: string
) {
  const supabase = await createClient();

  let query = supabase
    .from('lti_launches')
    .select(
      `
      tool_id,
      lti_tools!inner (
        id,
        name,
        tool_type
      )
    `
    )
    .gte('launched_at', startDate.toISOString())
    .lte('launched_at', endDate.toISOString());

  if (institutionId) {
    query = query.eq('institution_id', institutionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[LTI Analytics] Error fetching tool stats:', error);
    return [];
  }

  // Group by tool
  const toolMap = new Map<string, { name: string; count: number }>();

  data.forEach((launch: any) => {
    const toolId = launch.tool_id;
    // Handle both array and object responses from Supabase
    const toolData = Array.isArray(launch.lti_tools)
      ? launch.lti_tools[0]
      : launch.lti_tools;
    const toolName = toolData?.name || 'Unknown Tool';

    if (toolMap.has(toolId)) {
      toolMap.get(toolId)!.count++;
    } else {
      toolMap.set(toolId, { name: toolName, count: 1 });
    }
  });

  return Array.from(toolMap.values()).sort((a, b) => b.count - a.count);
}

async function getInstitutionStats(startDate: Date, endDate: Date) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('lti_launches')
    .select(
      `
      institution_id,
      institutions!inner (
        id,
        name
      )
    `
    )
    .gte('launched_at', startDate.toISOString())
    .lte('launched_at', endDate.toISOString());

  if (error) {
    console.error('[LTI Analytics] Error fetching institution stats:', error);
    return [];
  }

  // Group by institution
  const instMap = new Map<string, { name: string; count: number }>();

  data.forEach((launch: any) => {
    const instId = launch.institution_id;
    // Handle both array and object responses from Supabase
    const instData = Array.isArray(launch.institutions)
      ? launch.institutions[0]
      : launch.institutions;
    const instName = instData?.name || 'Unknown Institution';

    if (instMap.has(instId)) {
      instMap.get(instId)!.count++;
    } else {
      instMap.set(instId, { name: instName, count: 1 });
    }
  });

  return Array.from(instMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 institutions
}

async function getFilterOptions() {
  const supabase = await createClient();

  // Get institutions
  const { data: institutions } = await supabase
    .from('institutions')
    .select('id, name')
    .order('name');

  // Get tools
  const { data: tools } = await supabase
    .from('lti_tools')
    .select('id, name, tool_type')
    .eq('is_active', true)
    .order('name');

  return {
    institutions: institutions || [],
    tools: tools || []
  };
}

export default async function LtiAnalyticsPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  // Check permission for LTI analytics
  const { data: userRole, error: roleError } = await supabase
    .from('user_roles')
    .select('custom_roles(role_key, permissions)')
    .eq('user_id', user.id)
    .single();

  // Extract custom_roles from array (Supabase joins return arrays)
  const customRole = Array.isArray(userRole?.custom_roles)
    ? userRole?.custom_roles[0]
    : userRole?.custom_roles;

  const roleKey = customRole?.role_key;
  const permissions = customRole?.permissions || {};

  // Super admin has full access, otherwise check specific permissions
  if (roleKey !== 'super_admin') {
    if (!permissions['lti.analytics.view'] && !permissions['lti.monitor']) {
      redirect('/dashboard');
    }
  }

  // Await searchParams (Next.js 16 requirement)
  const params = await searchParams;

  // Parse date range
  const endDate = params.endDate
    ? new Date(params.endDate)
    : endOfDay(new Date());

  const startDate = params.startDate
    ? new Date(params.startDate)
    : startOfDay(subDays(endDate, 30)); // Default: last 30 days

  // Fetch analytics data
  const [launchStats, toolStats, institutionStats, filterOptions] =
    await Promise.all([
      getLaunchStats(
        startDate,
        endDate,
        params.institutionId,
        params.toolId
      ),
      getToolStats(startDate, endDate, params.institutionId),
      getInstitutionStats(startDate, endDate),
      getFilterOptions()
    ]);

  return (
    <ContentLayout title="LTI Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Administration' },
          { label: 'LTI Monitoring' },
          { label: 'Analytics' }
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">LTI Analytics</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Monitor and analyze LTI tool usage across your institution
          </p>
        </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading filters...</div>}>
            <AnalyticsFilters
              institutions={filterOptions.institutions}
              tools={filterOptions.tools}
              currentFilters={params}
              exportData={launchStats.launches}
            />
          </Suspense>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <Suspense fallback={<div>Loading statistics...</div>}>
        <LaunchStatsCards
          totalLaunches={launchStats.totalLaunches}
          uniqueUsers={launchStats.uniqueUsers}
          studentLaunches={launchStats.studentLaunches}
          facultyLaunches={launchStats.facultyLaunches}
        />
      </Suspense>

      {/* Launches Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Launches Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading chart...</div>}>
            <LaunchesOverTimeChart
              launches={launchStats.launches}
              startDate={startDate}
              endDate={endDate}
            />
          </Suspense>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Tool Usage */}
        <Card>
          <CardHeader>
            <CardTitle>Tool Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div>Loading chart...</div>}>
              <ToolUsageChart tools={toolStats} />
            </Suspense>
          </CardContent>
        </Card>

        {/* User Role Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>User Role Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div>Loading chart...</div>}>
              <UserRoleDistribution
                studentLaunches={launchStats.studentLaunches}
                facultyLaunches={launchStats.facultyLaunches}
              />
            </Suspense>
          </CardContent>
        </Card>
      </div>

        {/* Top Institutions */}
        <Card>
          <CardHeader>
            <CardTitle>Top Institutions</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div>Loading chart...</div>}>
              <TopInstitutionsChart institutions={institutionStats} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
