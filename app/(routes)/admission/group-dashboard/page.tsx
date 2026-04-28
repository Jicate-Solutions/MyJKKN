'use client';

import { AlertCircle, Building2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { useGroupDashboard, groupDashboardKeys } from '@/hooks/admission/use-group-dashboard';
import { admissionAccreditationKeys } from '@/hooks/admission/use-admission-accreditation-report';
import { InstitutionComparisonTable } from './_components/institution-comparison-table';
import { GroupFunnelChart, InstitutionPerformanceChart } from './_components/overview-charts';
import { SeatAnalyticsDashboard } from './_components/seat-analytics-dashboard';
import { SourceAnalyticsTab } from './_components/source-analytics-tab';
import { GeographyAnalyticsTab } from './_components/geography-analytics-tab';
import { InstitutionComparisonAdvanced } from './_components/institution-comparison-advanced';
import { NAACReportGenerator } from './_components/naac-report-generator';
import { GroupAdmissionYearSelect } from './_components/group-admission-year-select';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useMemo, useState } from 'react';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/admission/analytics',
} as const;

export default function GroupDashboardPage() {
  const queryClient = useQueryClient();
  const { institutions: accessibleInstitutions, canAccessAllInstitutions } =
    useUserInstitutionAccess();

  const scopedInstitutionIds = useMemo(() => {
    if (canAccessAllInstitutions) return undefined;
    return accessibleInstitutions.map((i) => i.institution_id);
  }, [canAccessAllInstitutions, accessibleInstitutions]);

  // Selected admission year cohort (program_start_year). Null until the
  // GroupAdmissionYearSelect resolves the latest active cohort, then it
  // auto-selects and the dashboard query unblocks.
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const { data, isLoading, isFetching, isError, error } = useGroupDashboard(
    scopedInstitutionIds,
    null,
    selectedYear
  );

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: groupDashboardKeys.all });
    queryClient.invalidateQueries({ queryKey: admissionAccreditationKeys.all });
  };

  if (isError) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Group Dashboard">
          <div className="p-6 mx-auto mt-12">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {(error as Error)?.message || 'Failed to load group dashboard.'}
              </AlertDescription>
            </Alert>
            <Button className="mt-4" onClick={handleRefresh}>Try Again</Button>
          </div>
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Group Dashboard">
        <div className="p-4 sm:p-6 mx-auto space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Group Dashboard</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <div>
                <h1 className="text-xl font-bold">Group Dashboard</h1>
                <p className="text-xs text-muted-foreground">Cross-institution admission & seat analytics</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GroupAdmissionYearSelect
                institutionIds={scopedInstitutionIds}
                value={selectedYear}
                onChange={setSelectedYear}
              />
              <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Admission funnel summary — always visible, scoped to selected admission year */}
          {!isLoading && data?.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Leads', value: data.totals.total_leads },
                { label: 'Applied', value: data.totals.total_applied },
                { label: 'Enrolled', value: data.totals.total_enrolled },
                { label: 'Rejected', value: data.totals.total_rejected },
                { label: 'Total Seats', value: data.totals.total_seats || '—' },
                {
                  label: 'Fill Rate',
                  value: data.totals.total_seats > 0 ? `${data.totals.overall_fill_percentage}%` : '—',
                },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-lg font-bold">{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Main tabs */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="h-9 flex-wrap">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="seats" className="text-xs">Seat Analytics</TabsTrigger>
              <TabsTrigger value="sources" className="text-xs">Source Analytics</TabsTrigger>
              <TabsTrigger value="geography" className="text-xs">Geography</TabsTrigger>
              <TabsTrigger value="comparison" className="text-xs">Comparison</TabsTrigger>
            </TabsList>

            {/* Tab: Overview */}
            <TabsContent value="overview" className="space-y-4">
              {data && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <GroupFunnelChart data={data} />
                  <InstitutionPerformanceChart data={data} />
                </div>
              )}
              <InstitutionComparisonTable institutions={data?.institutions || []} />
              <NAACReportGenerator />
            </TabsContent>

            {/* Tab: Seat Analytics */}
            <TabsContent value="seats">
              <SeatAnalyticsDashboard
                institutionIds={scopedInstitutionIds}
                programStartYear={selectedYear}
              />
            </TabsContent>

            {/* Tab: Source Analytics */}
            <TabsContent value="sources">
              <SourceAnalyticsTab
                institutionIds={scopedInstitutionIds}
                programStartYear={selectedYear}
              />
            </TabsContent>

            {/* Tab: Geography */}
            <TabsContent value="geography">
              <GeographyAnalyticsTab
                institutionIds={scopedInstitutionIds}
                programStartYear={selectedYear}
              />
            </TabsContent>

            {/* Tab: Advanced Comparison */}
            <TabsContent value="comparison">
              <InstitutionComparisonAdvanced
                institutionIds={scopedInstitutionIds}
                programStartYear={selectedYear}
              />
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
