'use client';

import { AlertCircle, Building2, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useQueryClient } from '@tanstack/react-query';
import { useGroupDashboard, groupDashboardKeys } from '@/hooks/admission/use-group-dashboard';
import { naacKeys } from '@/hooks/admission/use-naac-report';
import { InstitutionComparisonTable } from './_components/institution-comparison-table';
import { CrossCampusDedup } from './_components/cross-campus-dedup';
import { SeatFillTracker } from './_components/seat-fill-tracker';
import { NAACReportGenerator } from './_components/naac-report-generator';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export default function GroupDashboardPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, isError, error } = useGroupDashboard();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: groupDashboardKeys.all });
    queryClient.invalidateQueries({ queryKey: naacKeys.all });
  };

  if (isError) {
    return (
      <ContentLayout title="Group Dashboard">
        <div className="p-6 mx-auto mt-12">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {(error as Error)?.message || 'Failed to load group dashboard.'}
            </AlertDescription>
          </Alert>
          <Button className="mt-4" onClick={handleRefresh}>
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Group Dashboard">
      <div className="p-4 sm:p-6 mx-auto space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Group Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <div>
              <h1 className="text-xl font-bold">Group Dashboard</h1>
              <p className="text-xs text-muted-foreground">
                Cross-institution admission overview
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Totals Summary */}
            {data?.totals && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Total Leads', value: data.totals.total_leads },
                  { label: 'Applied', value: data.totals.total_applied },
                  { label: 'Enrolled', value: data.totals.total_enrolled },
                  { label: 'Total Seats', value: data.totals.total_seats || '—' },
                  {
                    label: 'Fill Rate',
                    value:
                      data.totals.total_seats > 0
                        ? `${data.totals.overall_fill_percentage}%`
                        : '—',
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

            {/* Comparison Table */}
            <InstitutionComparisonTable institutions={data?.institutions || []} />

            {/* Two-column for Seat Fill + Dedup */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SeatFillTracker institutions={data?.institutions || []} />
              <CrossCampusDedup />
            </div>

            {/* NAAC Report */}
            <NAACReportGenerator />
          </>
        )}
      </div>
    </ContentLayout>
  );
}
