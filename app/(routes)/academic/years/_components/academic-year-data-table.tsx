'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { AcademicYearsSearchParams } from './data-table-schema';
import { logger } from '@/lib/utils/enhanced-logger';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { AcademicYear } from '@/types/academics';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';

interface AcademicYearsDataTableProps {
  search: AcademicYearsSearchParams;
}

export function AcademicYearsDataTable({
  search
}: AcademicYearsDataTableProps) {
  const router = useRouter();
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();

  // Wait for permissions and profile to be loaded before rendering the table
  const isReady = !permissionsLoading && !!userProfile;

  // Permission checks
  const canCreateAcademicYear =
    isSuperAdmin || canAccess('academic.years', 'create');
  const canDeleteAcademicYear =
    isSuperAdmin || canAccess('academic.years', 'delete');

  const fetchData = async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {
      // Map the DataTable parameters to our AcademicYearService parameters
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id:
          search.institution_id ||
          (!isSuperAdmin && userProfile?.institution_id
            ? userProfile.institution_id
            : undefined),
        isActive:
          search.status === 'active'
            ? true
            : search.status === 'inactive'
            ? false
            : undefined
      };

      const { data, metadata } =
        await AcademicYearService.getAcademicYearsWithAccess(
          filters,
          userProfile?.institution_id,
          isSuperAdmin
        );

      return {
        success: true,
        data: data || [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: metadata?.totalPages ?? 0,
          total_items: metadata?.total ?? 0
        }
      };
    } catch (error) {
      logger.error('academic/academic-years', 'Error fetching academic years', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: AcademicYear[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.length} academic year${
        selectedRows.length > 1 ? 's' : ''
      }? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      // Delete all selected academic years
      await Promise.all(
        selectedRows.map((academicYear: AcademicYear) =>
          AcademicYearService.deleteAcademicYear(academicYear.id)
        )
      );

      // Reset selection and refresh data
      resetSelection();
      // The DataTable will automatically refetch data after this
    } catch (error) {
      logger.error('academic/academic-years', 'Error deleting academic years', error);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {canCreateAcademicYear && (
        <Button
          onClick={() => router.push('/academic/years/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Academic Year
        </Button>
      )}

      {canDeleteAcademicYear && props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as AcademicYear[],
              props.resetSelection
            )
          }
          variant='destructive'
          size='sm'
          className='h-8'
        >
          <TrashIcon className='mr-2 h-4 w-4' />
          Delete Selected ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  // Show loading state while waiting for permissions and profile
  if (!isReady) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-32' />
        </div>
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{
        entityName: 'academic-years',
        columnMapping: {},
        columnWidths: [],
        headers: []
      }}
      idField='id'
      config={{
        enableUrlState: true,
        enableDateFilter: false,
        enableExport: false,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'academic-years-table'
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
