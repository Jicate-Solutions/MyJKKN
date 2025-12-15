'use client';

import { useCallback, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { getColumns } from './columns';
import { logger } from '@/lib/utils/enhanced-logger';
import type { BatchesSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BatchService } from '@/lib/services/academic/batch-service';
import { Batch } from '@/types/academics';
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

interface BatchesDataTableProps {
  search: BatchesSearchParams;
}

export function BatchesDataTable({ search }: BatchesDataTableProps) {
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
    rows: Batch[];
    resetSelection: () => void;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Wait for permissions and profile to be loaded before rendering the table
  const isReady = !permissionsLoading && !!userProfile;

  // Permission checks - memoized to prevent re-renders
  const canCreateBatch = useMemo(
    () => isSuperAdmin || canAccess('academic.batches', 'create'),
    [isSuperAdmin, canAccess]
  );
  const canEditBatch = useMemo(
    () => isSuperAdmin || canAccess('academic.batches', 'edit'),
    [isSuperAdmin, canAccess]
  );
  const canDeleteBatch = useMemo(
    () => isSuperAdmin || canAccess('academic.batches', 'delete'),
    [isSuperAdmin, canAccess]
  );

  // Memoize columns to prevent re-renders
  const columns = useMemo(
    () => getColumns({ canEdit: canEditBatch, canDelete: canDeleteBatch }),
    [canEditBatch, canDeleteBatch]
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
        // Map the DataTable parameters to our BatchService parameters
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
          batch_year: search.batch_year || undefined
        };

        const { data, metadata } = await BatchService.getBatchesWithAccess(
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
        logger.error('academic/batches', 'Error fetching batches', error);
        throw error;
      }
    },
    [search, isSuperAdmin, userProfile?.institution_id]
  );

  // Open delete confirmation dialog
  const handleBulkDeleteClick = (
    selectedRows: Batch[],
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
      // Delete all selected batches without showing individual toasts
      await Promise.all(
        pendingDelete.rows.map((batch: Batch) =>
          BatchService.deleteBatch(batch.id, { showToast: false })
        )
      );

      // Show a single toast for the bulk delete
      toast.success(
        `${count} batch${count > 1 ? 'es' : ''} deleted successfully`
      );

      // Reset selection and refresh data
      pendingDelete.resetSelection();
      // The DataTable will automatically refetch data after this
    } catch (error) {
      logger.error('academic/batches', 'Error deleting batches', error);
      toast.error('Failed to delete some batches');
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
      {canCreateBatch && (
        <Button
          onClick={() => router.push('/academic/batches/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Batch
        </Button>
      )}

      {canDeleteBatch && props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDeleteClick(
              props.selectedRows as Batch[],
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
          entityName: 'batches',
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
          columnResizingTableId: 'batches-table'
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batches</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pendingDelete?.rows.length || 0}{' '}
              batch{(pendingDelete?.rows.length || 0) > 1 ? 'es' : ''}? This
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
