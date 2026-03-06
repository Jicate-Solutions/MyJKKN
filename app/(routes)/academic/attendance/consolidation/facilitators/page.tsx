'use client';

import { useState, useEffect } from 'react';
import { format, startOfMonth } from 'date-fns';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
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
  const { isSuperAdmin } = usePermissions([], { waitForLoad: false });
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    isActive: true,
    autoFetch: !!profile,
  });

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | undefined>(undefined);

  // Auto-select institution once loaded
  useEffect(() => {
    if (institutionsLoading || selectedInstitutionId) return;
    if (!isSuperAdmin && profile?.institution_id) {
      setSelectedInstitutionId(profile.institution_id);
    } else if (isSuperAdmin && institutions.length > 0) {
      setSelectedInstitutionId(institutions[0].id);
    }
  }, [profile, institutions, institutionsLoading, isSuperAdmin, selectedInstitutionId]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const [filters, setFilters] = useState<FacilitatorReportFilters>({
    dateFrom: monthStart,
    dateTo: today,
  });
  const [facilitatorSearch, setFacilitatorSearch] = useState('');

  const { data, isLoading, error } = useFacilitatorAttendanceReport(
    selectedInstitutionId,
    filters
  );

  const { data: departmentsData } = useDepartments({
    institution_id: selectedInstitutionId,
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

  const summary = data?.summary ?? {
    totalFacilitators: 0,
    totalPeriodsMarked: 0,
    avgPeriodsPerFacilitator: 0,
    totalPeriodsAssigned: 0,
    totalPeriodsPending: 0,
    overallMarkingRate: 0,
  };
  const facilitators = data?.facilitators ?? [];
  const departmentBreakdown = data?.departmentBreakdown ?? [];

  return (
    <PermissionGuard module="academic.attendance.facilitator-report" action="view">
      <ContentLayout title="Facilitator Attendance Report">
        {breadcrumb}

        {/* Loading state */}
        {(isLoading || institutionsLoading) && (
          <div className="mt-6">
            <LoadingSkeleton />
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && !institutionsLoading && (
          <div className="mt-6 text-center text-destructive text-sm">
            Failed to load report. Please try again.
          </div>
        )}

        {/* Main content — only when data is ready */}
        {!isLoading && !institutionsLoading && !error && (
          <div className="mt-4 space-y-6">

            {/* Page header row */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-xl font-bold sm:text-2xl">Facilitator Attendance Report</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Periods marked by each facilitator within the selected date range
                </p>
              </div>
              {isSuperAdmin && institutions.length > 0 && (
                <Select
                  value={selectedInstitutionId ?? ''}
                  onValueChange={(val) => setSelectedInstitutionId(val)}
                >
                  <SelectTrigger className="w-full sm:w-[240px] shrink-0">
                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Select institution..." />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* KPI Cards — full width, always */}
            <FacilitatorSummaryCards
              summary={summary}
              departmentCount={departmentBreakdown.length}
            />

            {/* Filters bar (horizontal on md+, stacked on mobile) */}
            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:flex-wrap">
                <div className="shrink-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Filters
                  </p>
                  <FacilitatorFilters
                    filters={filters}
                    departments={departments}
                    onFiltersChange={setFilters}
                    onFacilitatorSearch={setFacilitatorSearch}
                    facilitatorSearchQuery={facilitatorSearch}
                  />
                </div>
              </div>
            </div>

            {/* Charts + Department Breakdown side-by-side on lg */}
            <div className="flex flex-col xl:flex-row gap-6">
              {/* Charts column */}
              <div className="flex-1 min-w-0 space-y-6">
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

              {/* Department Breakdown sidebar — sticks to right on xl */}
              <aside className="xl:w-72 shrink-0">
                <div className="xl:sticky xl:top-6">
                  <DepartmentBreakdown breakdown={departmentBreakdown} />
                </div>
              </aside>
            </div>
          </div>
        )}
      </ContentLayout>
    </PermissionGuard>
  );
}
