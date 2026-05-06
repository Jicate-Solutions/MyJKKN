'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, TrashIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { getColumns } from './columns';
import type { CompositionSearchParams } from './data-table-schema';
import { BosComposition } from '@/types/bos';
import { BosCompositionService } from '@/lib/services/bos/bos-composition-service';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

interface CompositionDataTableProps {
  search: CompositionSearchParams;
}

export function CompositionDataTable({ search }: CompositionDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin, userProfile, isLoading: permissionsLoading } =
    usePermissions();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    rows: BosComposition[];
    resetSelection: () => void;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isReady = !permissionsLoading && !!userProfile;

  const canCreate = useMemo(
    () => isSuperAdmin || canAccess('academic.bos-compositions', 'create'),
    [isSuperAdmin, canAccess]
  );
  const canEdit = useMemo(
    () => isSuperAdmin || canAccess('academic.bos-compositions', 'edit'),
    [isSuperAdmin, canAccess]
  );
  const canDelete = useMemo(
    () => isSuperAdmin || canAccess('academic.bos-compositions', 'delete'),
    [isSuperAdmin, canAccess]
  );

  const columns = useMemo(
    () => getColumns({ canEdit, canDelete }),
    [canEdit, canDelete]
  );

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      sort_by: string;
      sort_order: string;
    }) => {
      try {
        const { data, metadata } = await BosCompositionService.getCompositions({
          page: params.page,
          limit: params.limit,
          search: params.search || undefined,
          sortBy: params.sort_by || 'term_start_date',
          sortOrder: (params.sort_order as 'asc' | 'desc') || 'desc',
          boardId: search.board_id,
          academicYear: search.academic_year,
          isActive:
            search.is_active === 'true'
              ? true
              : search.is_active === 'false'
              ? false
              : undefined,
          institutionsId: search.institutionsId || (!isSuperAdmin ? userProfile?.institution_id : undefined),
        });

        return {
          success: true,
          data: data ?? [],
          pagination: {
            page: params.page,
            limit: params.limit,
            total_pages: metadata?.totalPages ?? 0,
            total_items: metadata?.total ?? 0,
          },
        };
      } catch (error) {
        logger.error('academic/bos', 'Error fetching compositions', error);
        throw error;
      }
    },
    [search, isSuperAdmin, userProfile?.institution_id]
  );

  const handleBulkDeleteClick = (
    selectedRows: BosComposition[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;
    setPendingDelete({ rows: selectedRows, resetSelection });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const count = pendingDelete.rows.length;
    setIsDeleting(true);
    try {
      await Promise.all(
        pendingDelete.rows.map((c) => BosCompositionService.deleteComposition(c.id))
      );
      toast.success(`${count} composition${count > 1 ? 's' : ''} deleted`);
      pendingDelete.resetSelection();
    } catch (error) {
      logger.error('academic/bos', 'Error deleting compositions', error);
      toast.error('Failed to delete some compositions');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setPendingDelete(null);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {canCreate && (
        <Button
          onClick={() => router.push('/bos/compositions/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          New Composition
        </Button>
      )}
      {canDelete && props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDeleteClick(
              props.selectedRows as BosComposition[],
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

  if (!isReady) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-36' />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className='h-12 w-full' />
        ))}
      </div>
    );
  }

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'bos-compositions',
          columnMapping: {},
          columnWidths: [],
          headers: [],
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
          columnResizingTableId: 'bos-compositions-table',
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Compositions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pendingDelete?.rows.length ?? 0}{' '}
              composition{(pendingDelete?.rows.length ?? 0) > 1 ? 's' : ''}? All
              associated members will also be removed. This cannot be undone.
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
