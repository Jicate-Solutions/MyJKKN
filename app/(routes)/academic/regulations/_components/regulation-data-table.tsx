'use client';

import { useCallback, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { getColumns } from './columns';
import { logger } from '@/lib/utils/enhanced-logger';
import type { RegulationsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { RegulationService } from '@/lib/services/academic/regulation-service';
import { Regulation } from '@/types/academics';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'react-hot-toast';

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

  // State for delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    rows: Regulation[];
    resetSelection: () => void;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
        logger.error('academic/regulations', 'Error fetching regulations', error);
        throw error;
      }
    },
    [search, isSuperAdmin, userProfile?.institution_id]
  );

  // Open delete confirmation dialog
  const handleBulkDeleteClick = (
    selectedRows: Regulation[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;
    setPendingDelete({ rows: selectedRows, resetSelection });
    setDeleteDialogOpen(true);
  };

  // Execute the actual deletion
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;

    const count = pendingDelete.rows.length;
    setIsDeleting(true);
    try {
      // Delete all selected regulations without showing individual toasts
      await Promise.all(
        pendingDelete.rows.map((regulation: Regulation) =>
          RegulationService.deleteRegulation(regulation.id, { showToast: false })
        )
      );

      // Show a single toast for the bulk delete
      toast.success(
        `${count} regulation${count > 1 ? 's' : ''} deleted successfully`
      );

      // Reset selection and refresh data
      pendingDelete.resetSelection();
      // The DataTable will automatically refetch data after this
    } catch (error) {
      logger.error('academic/regulations', 'Error deleting regulations', error);
      toast.error('Failed to delete some regulations');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setPendingDelete(null);
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
            handleBulkDeleteClick(
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
    <>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Regulations</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pendingDelete?.rows.length || 0}{' '}
              regulation{(pendingDelete?.rows.length || 0) > 1 ? 's' : ''}? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
