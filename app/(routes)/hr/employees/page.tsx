'use client';

/**
 * HR Employee Directory — read-only view of ALL staff (staff table), enriched
 * with HR context where present. Fixes the prior !inner join that hid staff
 * without an hr_staff_details row. Gated by hr.employees.view.
 */

import Link from 'next/link';
import { useState, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BeatLoader } from 'react-spinners';
import { UsersRound, AlertCircle, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useHREmployees, fetchHREmployeesForExport } from '@/hooks/hr/use-employees';
import { ExportService } from '@/lib/services/export-service';
import { getErrorMessage } from '@/lib/utils';
import {
  HREmployeesFilters,
  type HREmployeeFilterState,
} from './_components/hr-employees-filters';
import { HREmployeesTable } from './_components/hr-employees-table';
import type { HRPersonView } from '@/types/hr';

const PAGE_SIZE = 25;

const EXPORT_HEADERS: Record<string, string> = {
  employee_code: 'Employee Code',
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  designation_name: 'Designation',
  cadre_name: 'Cadre',
  organization_name: 'Organization',
  institution_name: 'Institution',
  department_name: 'Department',
  is_active: 'Active',
};

export default function HREmployeeDirectoryPage() {
  const { isLoading: permsLoading, isSuperAdmin, canAccess } = usePermissions();
  const [filterState, setFilterState] = useState<HREmployeeFilterState>({ search: '', is_active: true });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const canView = isSuperAdmin || canAccess('hr.employees', 'view');
  const canExport = isSuperAdmin || canAccess('hr.employees', 'export');

  const apiFilters = {
    search: filterState.search || undefined,
    institution_id: filterState.institution_id,
    department_id: filterState.department_id,
    is_active: filterState.is_active,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, error } = useHREmployees(apiFilters, !permsLoading && canView);

  const handleFilterChange = useCallback((patch: Partial<HREmployeeFilterState>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const rows: HRPersonView[] = await fetchHREmployeesForExport({
        search: filterState.search || undefined,
        institution_id: filterState.institution_id,
        department_id: filterState.department_id,
        is_active: filterState.is_active,
      });
      const flat = rows.map((r) => ({
        employee_code: r.employee_code ?? '',
        first_name: r.first_name,
        last_name: r.last_name ?? '',
        email: r.email ?? '',
        phone: r.phone ?? '',
        designation_name: r.designation_name ?? '',
        cadre_name: r.cadre_name ?? '',
        organization_name: r.organization_name ?? '',
        institution_name: r.institution_name ?? '',
        department_name: r.department_name ?? '',
        is_active: r.is_active ? 'Yes' : 'No',
      }));
      ExportService.exportToExcel(flat, EXPORT_HEADERS as any, 'hr-employees', 'Employees');
      toast.success(`Exported ${flat.length} employees`);
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [filterState]);

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
              All staff across the HR module
              {data ? ` — ${data.metadata.total} total` : ' — loading...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? 'Exporting…' : 'Export'}
              </Button>
            )}
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

        <Card>
          <CardHeader><CardTitle>Employees</CardTitle></CardHeader>
          <CardContent>
            {isLoading && <div className="flex justify-center py-8"><BeatLoader color="#3b82f6" /></div>}
            {error && (
              <div className="flex items-center gap-2 text-red-600 py-4">
                <AlertCircle className="h-4 w-4" />
                <span>Failed to load: {getErrorMessage(error)}</span>
              </div>
            )}
            {data && data.data.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <UsersRound className="h-10 w-10 mx-auto opacity-40 mb-3" />
                <p className="font-medium">No employees match these filters.</p>
              </div>
            )}
            {data && data.data.length > 0 && <HREmployeesTable rows={data.data} />}

            {data && data.metadata.totalPages > 1 && (
              <div className="flex justify-between items-center pt-4">
                <span className="text-xs text-muted-foreground">
                  Page {data.metadata.page} of {data.metadata.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= data.metadata.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
