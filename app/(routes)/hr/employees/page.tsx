'use client';

/**
 * HR Employee Directory — read-only view of ALL staff (staff table), enriched
 * with HR context where present. Fixes the prior !inner join that hid staff
 * without an hr_staff_details row. Gated by hr.employees.view.
 */

import Link from 'next/link';
import { useState, useCallback, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BeatLoader } from 'react-spinners';
import { UsersRound, AlertCircle } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  HREmployeesFilters,
  type HREmployeeFilterState,
} from './_components/hr-employees-filters';
import { HREmployeesDataTable } from './_components/hr-employees-data-table';

export default function HREmployeeDirectoryPage() {
  const { isLoading: permsLoading, isSuperAdmin, canAccess } = usePermissions();
  const [filterState, setFilterState] = useState<HREmployeeFilterState>({ is_active: true });

  const canView = isSuperAdmin || canAccess('hr.employees', 'view');

  /**
   * Only the filters the DataTable's own toolbar does NOT own. Search lives in
   * the toolbar now; keeping a second box here would have meant two inputs
   * over one list, each ignorant of the other.
   */
  const tableFilters = useMemo(
    () => ({
      institution_id: filterState.institution_id,
      department_id: filterState.department_id,
      is_active: filterState.is_active,
    }),
    [filterState.institution_id, filterState.department_id, filterState.is_active]
  );

  // The table holds its own page/search state and re-runs fetchDataFn when
  // refetchKey changes — that is how an external filter reaches it.
  const [refetchKey, setRefetchKey] = useState(0);

  const handleFilterChange = useCallback((patch: Partial<HREmployeeFilterState>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
    setRefetchKey((k) => k + 1);
  }, []);

  if (permsLoading) {
    return (
      <ContentLayout title="HR Directory">
        <div className="flex justify-center py-16"><BeatLoader color="#3b82f6" /></div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="HR Directory">
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You don&apos;t have permission to view the employee directory.</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="HR Directory">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Employees</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <UsersRound className="h-6 w-6" />
              Employee Directory
            </h1>
            <p className="text-sm text-muted-foreground">
              Staff in HR-managed employment categories
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export moved INTO the table toolbar, which exports every row
                matching the current search and filters rather than the page. */}
            <Button asChild variant="outline" size="sm">
              <Link href="/staff/list">Full Staff Management</Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <HREmployeesFilters value={filterState} onChange={handleFilterChange} />
          </CardContent>
        </Card>

        {/* The table owns its own search, sorting, paging, column visibility
            and export — see hr-employees-data-table.tsx. */}
        <HREmployeesDataTable filters={tableFilters} refetchKey={refetchKey} />
      </div>
    </ContentLayout>
  );
}
