'use client';

import { useState } from 'react';
import { AlertCircle, Building2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { useGroupDashboard, groupDashboardKeys } from '@/hooks/admission/use-group-dashboard';
import { admissionAccreditationKeys } from '@/hooks/admission/use-admission-accreditation-report';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { InstitutionComparisonTable } from './_components/institution-comparison-table';
import { CrossCampusDedup } from './_components/cross-campus-dedup';
import { SeatAnalyticsDashboard } from './_components/seat-analytics-dashboard';
import { SourceAnalyticsTab } from './_components/source-analytics-tab';
import { GeographyAnalyticsTab } from './_components/geography-analytics-tab';
import { InstitutionComparisonAdvanced } from './_components/institution-comparison-advanced';
import { NAACReportGenerator } from './_components/naac-report-generator';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useMemo } from 'react';

export default function GroupDashboardPage() {
  const queryClient = useQueryClient();
  const { institutions: accessibleInstitutions, canAccessAllInstitutions } =
    useUserInstitutionAccess();

  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>(undefined);

  const scopedInstitutionIds = useMemo(() => {
    if (canAccessAllInstitutions) return undefined;
    return accessibleInstitutions.map((i) => i.institution_id);
  }, [canAccessAllInstitutions, accessibleInstitutions]);

  const { data, isLoading, isFetching, isError, error } = useGroupDashboard(scopedInstitutionIds);
  const { data: academicYears = [] } = useAcademicYears();

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
              {/* Academic year filter — applies to analytics tabs */}
              <Select
                value={selectedAcademicYearId ?? 'all'}
                onValueChange={(v) => setSelectedAcademicYearId(v === 'all' ? undefined : v)}
              >
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="All Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {academicYears.map((ay: any) => (
                    <SelectItem key={ay.id} value={ay.id}>{ay.academic_year_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Admission funnel summary — always visible */}
          {!isLoading && data?.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total Leads', value: data.totals.total_leads },
                { label: 'Applied', value: data.totals.total_applied },
                { label: 'Enrolled', value: data.totals.total_enrolled },
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

            {/* Tab: Overview (existing) */}
            <TabsContent value="overview" className="space-y-4">
              <InstitutionComparisonTable institutions={data?.institutions || []} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <CrossCampusDedup />
                <NAACReportGenerator />
              </div>
            </TabsContent>

            {/* Tab: Seat Analytics */}
            <TabsContent value="seats">
              <SeatAnalyticsDashboard academicYearId={selectedAcademicYearId} />
            </TabsContent>

            {/* Tab: Source Analytics */}
            <TabsContent value="sources">
              <SourceAnalyticsTab academicYearId={selectedAcademicYearId} />
            </TabsContent>

            {/* Tab: Geography */}
            <TabsContent value="geography">
              <GeographyAnalyticsTab academicYearId={selectedAcademicYearId} />
            </TabsContent>

            {/* Tab: Advanced Comparison */}
            <TabsContent value="comparison">
              <InstitutionComparisonAdvanced academicYearId={selectedAcademicYearId} />
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
