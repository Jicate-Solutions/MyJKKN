'use client';

import { useCallback, useMemo } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { getColumns } from './columns';
import type { RegulationsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { RegulationService } from '@/lib/services/academic/regulation-service';
import { Regulation } from '@/types/academics';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';

interface RegulationsDataTableProps {
  search: RegulationsSearchParams;
}

export function RegulationsDataTable({ search }: RegulationsDataTableProps) {
  const router = useRouter();
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();

  // Wait for permissions and profile to be loaded before rendering the table
  const isReady = !permissionsLoading && !!userProfile;

  // Permission checks - memoized to prevent re-renders
  const canCreateRegulation = useMemo(
    () => isSuperAdmin || canAccess('academic.regulations', 'create'),
    [isSuperAdmin, canAccess]
  );
  const canEditRegulation = useMemo(
    () => isSuperAdmin || canAccess('academic.regulations', 'edit'),
    [isSuperAdmin, canAccess]
  );
  const canDeleteRegulation = useMemo(
    () => isSuperAdmin || canAccess('academic.regulations', 'delete'),
    [isSuperAdmin, canAccess]
  );

  // Memoize columns to prevent re-renders
  const columns = useMemo(
    () => getColumns({ canEdit: canEditRegulation, canDelete: canDeleteRegulation }),
    [canEditRegulation, canDeleteRegulation]
  );

  // Memoize fetchData to prevent unnecessary re-fetches
  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      from_date: string;
      to_date: string;
      sort_by: string;
      sort_order: string;
    }) => {
      try {
        // Map the DataTable parameters to our RegulationService parameters
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
            search.is_active === 'true'
              ? true
              : search.is_active === 'false'
              ? false
              : undefined,
          regulation_year: search.regulation_year || undefined
        };

        const { data, metadata } =
          await RegulationService.getRegulationsWithAccess(
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
        console.error('Error fetching regulations:', error);
        throw error;
      }
    },
    [search, isSuperAdmin, userProfile?.institution_id]
  );

  const handleBulkDelete = async (
    selectedRows: Regulation[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.length} regulation${
        selectedRows.length > 1 ? 's' : ''
      }? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      // Delete all selected regulations
      await Promise.all(
        selectedRows.map((regulation: Regulation) =>
          RegulationService.deleteRegulation(regulation.id)
        )
      );

      // Reset selection and refresh data
      resetSelection();
      // The DataTable will automatically refetch data after this
    } catch (error) {
      console.error('Error deleting regulations:', error);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {canCreateRegulation && (
        <Button
          onClick={() => router.push('/academic/regulations/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Regulation
        </Button>
      )}

      {canDeleteRegulation && props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Regulation[],
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
        entityName: 'regulations',
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
        columnResizingTableId: 'regulations-table'
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
