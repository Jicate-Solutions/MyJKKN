'use client';

import { useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useFacilitatorAttendanceReport } from '@/hooks/academic/use-facilitator-attendance';
import type { FacilitatorReportFilters } from '@/types/attendance';

import { FacilitatorFilters } from './_components/facilitator-filters';
import { FacilitatorSummaryCards } from './_components/facilitator-summary-cards';
import { FacilitatorBarChart } from './_components/facilitator-bar-chart';
import { FacilitatorPieChart } from './_components/facilitator-pie-chart';
import { FacilitatorTrendChart } from './_components/facilitator-trend-chart';
import { FacilitatorHeatmap } from './_components/facilitator-heatmap';
import { FacilitatorDataTable } from './_components/facilitator-data-table';
import { DepartmentBreakdown } from './_components/department-breakdown';

export default function FacilitatorAttendancePage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const [filters, setFilters] = useState<FacilitatorReportFilters>({
    dateFrom: monthStart,
    dateTo: today,
  });
  const [facilitatorSearch, setFacilitatorSearch] = useState('');

  const { data, isLoading, error } = useFacilitatorAttendanceReport(
    institutionId,
    filters
  );

  const { data: departmentsData } = useDepartments({
    institution_id: institutionId ?? undefined,
    isActive: true,
  });
  const departments = (departmentsData?.data ?? []).map((d) => ({
    id: d.id,
    name: d.department_name,
  }));

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">Home</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/academic/attendance">Attendance</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/academic/attendance/consolidation">Consolidation</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Facilitator Report</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );

  if (isLoading) {
    return (
      <ContentLayout title="Facilitator Attendance Report">
        {breadcrumb}
        <div className="mt-6">
          <LoadingSkeleton />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Facilitator Attendance Report">
        {breadcrumb}
        <div className="mt-6 text-center text-destructive text-sm">
          Failed to load report. Please try again.
        </div>
      </ContentLayout>
    );
  }

  const summary = data?.summary ?? {
    totalFacilitators: 0,
    totalPeriodsMarked: 0,
    avgPeriodsPerFacilitator: 0,
  };
  const facilitators = data?.facilitators ?? [];
  const departmentBreakdown = data?.departmentBreakdown ?? [];

  return (
    <PermissionGuard module="academic.attendance.facilitator-report" action="view">
      <ContentLayout title="Facilitator Attendance Report">
        {breadcrumb}

        <div className="mt-6 flex flex-col lg:flex-row gap-6">
          {/* Left: Sticky Filters + Department Breakdown */}
          <aside className="lg:w-64 shrink-0">
            <div className="lg:sticky lg:top-6 space-y-6">
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold mb-4">Filters</h3>
                <FacilitatorFilters
                  filters={filters}
                  departments={departments}
                  onFiltersChange={setFilters}
                  onFacilitatorSearch={setFacilitatorSearch}
                  facilitatorSearchQuery={facilitatorSearch}
                />
              </div>
              <DepartmentBreakdown breakdown={departmentBreakdown} />
            </div>
          </aside>

          {/* Right: Main content */}
          <div className="flex-1 space-y-6 min-w-0">
            <div>
              <h1 className="text-2xl font-bold">Facilitator Attendance Report</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Periods marked by each facilitator within the selected date range
              </p>
            </div>

            <FacilitatorSummaryCards
              summary={summary}
              departmentCount={departmentBreakdown.length}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FacilitatorBarChart facilitators={facilitators} />
              <FacilitatorPieChart departmentBreakdown={departmentBreakdown} />
            </div>

            <FacilitatorTrendChart facilitators={facilitators} />

            <FacilitatorHeatmap
              facilitators={facilitators}
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
            />

            <FacilitatorDataTable
              facilitators={facilitators}
              globalFilter={facilitatorSearch}
            />
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
