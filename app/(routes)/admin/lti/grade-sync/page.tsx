/**
 * Grade Sync Monitoring Page
 * Monitor grade passback from LTI tools
 *
 * Features:
 * - View all grade sync records
 * - Filter by sync status (synced, pending, failed)
 * - Filter by tool, date range
 * - Manual retry for failed syncs
 * - Error log viewing
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
import { GradeSyncTable } from './_components/grade-sync-table';
import { GradeSyncStats } from './_components/grade-sync-stats';
import { GradeSyncFilters } from './_components/grade-sync-filters';
import { subDays, startOfDay, endOfDay } from 'date-fns';

export const metadata = {
  title: 'Grade Sync Monitoring | MyJKKN',
  description: 'Monitor grade passback from LTI tools'
};

interface PageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    toolId?: string;
    syncStatus?: 'all' | 'synced' | 'pending' | 'failed';
  }>;
}

// Type for the grade sync data returned from Supabase
type GradeSyncData = {
  id: string;
  resource_link_title: string;
  score: number;
  score_maximum: number;
  score_percentage: number;
  graded_at: string;
  received_at: string;
  synced_to_gradebook: boolean;
  sync_error: string | null;
  synced_at: string | null;
  user_id: string;
  lti_tools: {
    id: string;
    name: string;
    tool_type: string;
  };
  learners_profiles: {
    first_name: string;
    last_name: string;
    roll_number: string;
  };
};

async function getGradeSyncData(
  startDate: Date,
  endDate: Date,
  toolId?: string,
  syncStatus?: string
): Promise<GradeSyncData[]> {
  const supabase = await createClient();

  let query = supabase
    .from('lti_grades')
    .select(
      `
      id,
      resource_link_title,
      score,
      score_maximum,
      score_percentage,
      graded_at,
      received_at,
      synced_to_gradebook,
      sync_error,
      synced_at,
      user_id,
      lti_tools!inner (
        id,
        name,
        tool_type
      ),
      learners_profiles!inner (
        first_name,
        last_name,
        roll_number
      )
    `
    )
    .gte('received_at', startDate.toISOString())
    .lte('received_at', endDate.toISOString())
    .order('received_at', { ascending: false });

  if (toolId) {
    query = query.eq('tool_id', toolId);
  }

  if (syncStatus && syncStatus !== 'all') {
    if (syncStatus === 'synced') {
      query = query.eq('synced_to_gradebook', true);
    } else if (syncStatus === 'pending') {
      query = query.eq('synced_to_gradebook', false).is('sync_error', null);
    } else if (syncStatus === 'failed') {
      query = query.eq('synced_to_gradebook', false).not('sync_error', 'is', null);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Grade Sync] Error fetching data:', error);
    throw new Error('Failed to load grade sync data');
  }

  // Transform the data to match expected type (flatten the arrays from joins)
  const transformedData: GradeSyncData[] = (data || []).map((item: any) => ({
    id: item.id,
    resource_link_title: item.resource_link_title,
    score: item.score,
    score_maximum: item.score_maximum,
    score_percentage: item.score_percentage,
    graded_at: item.graded_at,
    received_at: item.received_at,
    synced_to_gradebook: item.synced_to_gradebook,
    sync_error: item.sync_error,
    synced_at: item.synced_at,
    user_id: item.user_id,
    lti_tools: Array.isArray(item.lti_tools) ? item.lti_tools[0] : item.lti_tools,
    learners_profiles: Array.isArray(item.learners_profiles)
      ? item.learners_profiles[0]
      : item.learners_profiles
  }));

  return transformedData;
}

async function getGradeSyncStats(startDate: Date, endDate: Date) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('lti_grades')
    .select('id, synced_to_gradebook, sync_error')
    .gte('received_at', startDate.toISOString())
    .lte('received_at', endDate.toISOString());

  if (error) {
    console.error('[Grade Sync] Error fetching stats:', error);
    return { total: 0, synced: 0, pending: 0, failed: 0 };
  }

  const total = data.length;
  const synced = data.filter((g: any) => g.synced_to_gradebook).length;
  const failed = data.filter(
    (g: any) => !g.synced_to_gradebook && g.sync_error
  ).length;
  const pending = total - synced - failed;

  return { total, synced, pending, failed };
}

async function getFilterOptions() {
  const supabase = await createClient();

  const { data: tools } = await supabase
    .from('lti_tools')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  return {
    tools: tools || []
  };
}

export default async function GradeSyncMonitoringPage({
  searchParams
}: PageProps) {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  // Check permission for grade sync monitoring
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
    if (!permissions['lti.grade_sync.view'] && !permissions['lti.monitor']) {
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
    : startOfDay(subDays(endDate, 7)); // Default: last 7 days

  // Fetch data
  const [grades, stats, filterOptions] = await Promise.all([
    getGradeSyncData(
      startDate,
      endDate,
      params.toolId,
      params.syncStatus
    ),
    getGradeSyncStats(startDate, endDate),
    getFilterOptions()
  ]);

  return (
    <ContentLayout title="Grade Sync Monitoring">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Administration' },
          { label: 'LTI Monitoring' },
          { label: 'Grade Sync' }
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Grade Sync Monitoring</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Monitor grade passback from LTI tools and troubleshoot sync issues
          </p>
        </div>

      {/* Statistics Cards */}
      <Suspense fallback={<div>Loading statistics...</div>}>
        <GradeSyncStats
          total={stats.total}
          synced={stats.synced}
          pending={stats.pending}
          failed={stats.failed}
        />
      </Suspense>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading filters...</div>}>
            <GradeSyncFilters
              tools={filterOptions.tools}
              currentFilters={params}
              exportData={grades}
            />
          </Suspense>
        </CardContent>
      </Card>

        {/* Grade Sync Table */}
        <Card>
          <CardHeader>
            <CardTitle>Grade Sync Records ({grades.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div>Loading grades...</div>}>
              <GradeSyncTable grades={grades} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
