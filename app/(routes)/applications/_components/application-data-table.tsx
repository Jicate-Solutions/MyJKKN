'use client';

import { DataTable } from '@/components/data-table/data-table';
import { getColumns } from './columns';
import type { ApplicationsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ApplicationService } from '@/lib/services/application/application-service';
import { Application } from '@/types/applications';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';

interface ApplicationsDataTableProps {
  search: ApplicationsSearchParams;
}

export function ApplicationsDataTable({ search }: ApplicationsDataTableProps) {
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
  const canCreateApplication =
    isSuperAdmin || canAccess('applications', 'create');
  const canEditApplication =
    isSuperAdmin || canAccess('applications', 'edit');
  const canDeleteApplication =
    isSuperAdmin || canAccess('applications', 'delete');

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
      // Map the DataTable parameters to our ApplicationService parameters
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        category: search.category || undefined,
        isActive:
          search.isActive === 'true'
            ? true
            : search.isActive === 'false'
            ? false
            : undefined
      };

      const response = await ApplicationService.getApplications(filters);

      return {
        success: true,
        data: response.data || [],
        pagination: {
          page: response.metadata.page,
          limit: response.metadata.limit,
          total_pages: response.metadata.totalPages,
          total_items: response.metadata.total
        }
      };
    } catch (error) {
      console.error('Error fetching applications:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: Application[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.length} application${
        selectedRows.length > 1 ? 's' : ''
      }? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      // Delete all selected applications
      await Promise.all(
        selectedRows.map((app: Application) =>
          ApplicationService.deleteApplication(app.id)
        )
      );

      // Reset selection and refresh data
      resetSelection();
      // The DataTable will automatically refetch data after this
    } catch (error) {
      console.error('Error deleting applications:', error);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {canCreateApplication && (
        <Button
          onClick={() => router.push('/applications/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Application
        </Button>
      )}

      {canDeleteApplication && props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Application[],
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
      getColumns={() => getColumns({ canEdit: canEditApplication, canDelete: canDeleteApplication }) as any}
      exportConfig={{
        entityName: 'applications',
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
        columnResizingTableId: 'applications-table'
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
