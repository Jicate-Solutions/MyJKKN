/**
 * Maturity Assessment Module - Main Page
 *
 * Dashboard view showing institution maturity status, recent assessments,
 * and improvement progress.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { TableSkeleton } from '@/components/Loading';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { getAssessments } from './_data/get-assessments';
import { getDashboardData } from './_data/get-dashboard';
import { DashboardCards } from './_components/dashboard-cards';
import { AssessmentList } from './_components/assessment-list';
import { MaturityRadarChart } from './_components/maturity-radar-chart';
import type { MaturityDimensionName, MaturityStage } from '@/types/maturity-assessment';

interface SearchParams {
  tab?: string;
  status?: string;
  page?: string;
}

interface MaturityAssessmentPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MaturityAssessmentPage({
  searchParams
}: MaturityAssessmentPageProps) {
  const params = await searchParams;
  const { profile } = await getEnhancedUserProfile();

  // Get user's primary institution
  const institutionId = profile?.institution_id;

  if (!institutionId) {
    return (
      <ContentLayout title="Maturity Assessment">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                You need to be assigned to an institution to access maturity assessments.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const activeTab = params.tab || 'dashboard';

  // Fetch data with error handling
  let dashboardData: Awaited<ReturnType<typeof getDashboardData>> = {
    institution_overall: 1 as any,
    by_department: {},
    by_dimension: { Leadership: 0, Strategy: 0, People: 0, Processes: 0, Resources: 0, Results: 0 },
    trend: [],
    improvement_items: { total: 0, completed: 0, in_progress: 0, pending: 0, blocked: 0, overdue: 0 },
    latest_assessments: []
  };
  let assessmentsData: Awaited<ReturnType<typeof getAssessments>> = {
    data: [],
    metadata: { total: 0, page: 1, limit: 10, totalPages: 0 }
  };

  try {
    [dashboardData, assessmentsData] = await Promise.all([
      getDashboardData(institutionId),
      getAssessments({
        institution_id: institutionId,
        status: params.status as any,
        page: params.page ? parseInt(params.page) : 1,
        limit: 10
      })
    ]);
  } catch (error) {
    console.error('[maturity-assessment] Error fetching assessment data:', error);
  }

  const isAdmin = profile?.role
    ? ['super_admin', 'admin', 'principal', 'hod'].includes(profile.role)
    : false;

  return (
    <ContentLayout title="Maturity Assessment">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Maturity Assessment', href: '/maturity-assessment' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Maturity Assessment</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track organizational excellence journey using the 4-stage maturity model
            </p>
          </div>
          <Button asChild>
            <Link href="/maturity-assessment/new">
              <Plus className="mr-2 h-4 w-4" />
              New Assessment
            </Link>
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue={activeTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="assessments">Assessments</TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <Suspense
              fallback={
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="h-40 animate-pulse bg-muted" />
                  ))}
                </div>
              }
            >
              <DashboardCards data={dashboardData} />
            </Suspense>

            {/* Radar Chart for latest assessment */}
            {dashboardData.latest_assessments[0] && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MaturityRadarChart
                  dimensionScores={
                    dashboardData.latest_assessments[0].dimension_scores as Record<
                      MaturityDimensionName,
                      MaturityStage
                    >
                  }
                  targetStage={dashboardData.latest_assessments[0].target_stage}
                  title="Latest Assessment"
                />

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent Assessments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AssessmentList
                      assessments={dashboardData.latest_assessments.slice(0, 5)}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Assessments Tab */}
          <TabsContent value="assessments" className="space-y-6">
            <Suspense fallback={<TableSkeleton rows={10} columns={6} />}>
              <AssessmentList assessments={assessmentsData.data} />
            </Suspense>

            {/* Pagination info */}
            {assessmentsData.metadata.totalPages > 1 && (
              <div className="text-sm text-muted-foreground text-center">
                Page {assessmentsData.metadata.page} of{' '}
                {assessmentsData.metadata.totalPages} ({assessmentsData.metadata.total}{' '}
                total)
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
