'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table/data-table';
import { BosCourseSyllabus } from '@/types/bos';
import { BosSyllabusService } from '@/lib/services/bos/bos-syllabus-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteBosSyllabus } from '@/hooks/bos/use-bos-syllabi';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { columns } from './columns';
import { SyllabusSearchParams } from './data-table-schema';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface SyllabusDataTableProps {
  search: SyllabusSearchParams;
}

export function SyllabusDataTable({ search }: SyllabusDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin, userProfile, isLoading: permissionsLoading } = usePermissions();
  const deleteBosSyllabus = useDeleteBosSyllabus();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isReady = !permissionsLoading && !!userProfile;

  const canCreate = useMemo(
    () => isSuperAdmin || canAccess('academic.bos-syllabi', 'create'),
    [isSuperAdmin, canAccess]
  );
  const canDelete = useMemo(
    () => isSuperAdmin || canAccess('academic.bos-syllabi', 'delete'),
    [isSuperAdmin, canAccess]
  );

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search?: string;
      from_date?: string;
      to_date?: string;
      sort_by?: string;
      sort_order?: string;
    }) => {
      try {
        // Determine institution scope
        const scopedInstitutionsId = search.institutionsId || (!isSuperAdmin ? userProfile?.institution_id : undefined);

        // Return empty state if no institution yet (permissions still loading)
        if (!scopedInstitutionsId) {
          return {
            success: true,
            data: [],
            pagination: { page: 1, limit: 20, total_pages: 0, total_items: 0 },
          };
        }

        const { data, metadata } = await BosSyllabusService.getSyllabi({
          page: params.page,
          limit: params.limit,
          search: params.search,
          boardId: search.boardId,
          regulationId: search.regulationId,
          stream: search.stream,
          isLatest: search.is_latest === 'true' ? true : search.is_latest === 'false' ? false : undefined,
          institutionsId: scopedInstitutionsId,
        });

        return {
          success: true,
          data: data || [],
          pagination: {
            page: params.page,
            limit: params.limit,
            total_pages: Math.ceil((metadata?.total || 0) / params.limit),
            total_items: metadata?.total || 0,
          },
        };
      } catch (error) {
        console.error('Failed to fetch syllabi:', error);
        return {
          success: false,
          data: [],
          pagination: { page: 1, limit: 20, total_pages: 0, total_items: 0 },
        };
      }
    },
    [search.boardId, search.regulationId, search.stream, search.is_latest, search.institutionsId, isSuperAdmin, userProfile?.institution_id]
  );

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(selectedIds.map((id) => deleteBosSyllabus.mutateAsync(id)));
      setDeleteDialogOpen(false);
      setSelectedIds([]);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isReady) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-32' />
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
        getColumns={() => columns}
        exportConfig={{
          entityName: 'syllabi',
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
          columnResizingTableId: 'bos-syllabi-table',
        }}
        renderToolbarContent={({ selectedRows, allSelectedIds, totalSelectedCount }) => (
          <div className='flex gap-2'>
            {canCreate && (
              <Button
                size='sm'
                onClick={() => router.push('/bos/syllabi/new')}
              >
                <Plus className='h-4 w-4 mr-2' />
                New Syllabus
              </Button>
            )}
            {canDelete && totalSelectedCount > 0 && (
              <Button
                size='sm'
                variant='destructive'
                onClick={() => {
                  setSelectedIds(allSelectedIds);
                  setDeleteDialogOpen(true);
                }}
              >
                Delete ({totalSelectedCount})
              </Button>
            )}
          </div>
        )}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Syllabi</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.length} syllabus/syllabi? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex justify-end gap-3'>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className='bg-red-600 hover:bg-red-700'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
