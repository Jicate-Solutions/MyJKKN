'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { PeriodsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PeriodService } from '@/lib/services/academic/period-service';
import { Period } from '@/types/academics';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';

interface PeriodsDataTableProps {
  search: PeriodsSearchParams;
}

export function PeriodsDataTable({ search }: PeriodsDataTableProps) {
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
  const canCreatePeriod =
    isSuperAdmin || canAccess('academic.periods', 'create');
  const canDeletePeriod =
    isSuperAdmin || canAccess('academic.periods', 'delete');

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
      // Map the DataTable parameters to our PeriodService parameters
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
        isBreak:
          search.is_break === 'true'
            ? true
            : search.is_break === 'false'
            ? false
            : undefined
      };

      const { data, metadata } = await PeriodService.getPeriodsWithAccess(
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
      console.error('Error fetching periods:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: Period[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.length} period${
        selectedRows.length > 1 ? 's' : ''
      }? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      // Delete all selected periods
      await Promise.all(
        selectedRows.map((period: Period) =>
          PeriodService.deletePeriod(period.id)
        )
      );

      // Reset selection and refresh data
      resetSelection();
      // The DataTable will automatically refetch data after this
    } catch (error) {
      console.error('Error deleting periods:', error);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {canCreatePeriod && (
        <Button
          onClick={() => router.push('/academic/periods/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Period
        </Button>
      )}

      {canDeletePeriod && props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Period[],
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
        entityName: 'periods',
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
        columnResizingTableId: 'periods-table'
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
