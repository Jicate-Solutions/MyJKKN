'use client';

// Advanced DataTable wrapper for School Master — server-side pagination,
// sorting, search, export and cross-page selection via the shared
// components/data-table/ table. Filters (board/district/status) live in the
// parent; a new fetchData identity (or refetchKey bump) triggers a refetch,
// and the table self-clamps out-of-range pages back to 1.

import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, TrashIcon, Upload } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import type { DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
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

import { SchoolMasterService } from '@/lib/services/school-master-service';
import { BOARD_OF_STUDY_OPTIONS } from '@/lib/constants/learner-dropdown-values';
import { getErrorMessage } from '@/lib/utils';
import type { SchoolMaster } from '@/types/school-master';
import { getColumns } from './columns';

const BOARD_LABELS = Object.fromEntries(
  BOARD_OF_STUDY_OPTIONS.map((o) => [o.value, o.label]),
);

// Export keys are DISTINCT from table column ids on purpose: the shared
// exporter drops export headers that collide with HIDDEN column ids, so
// non-colliding keys keep the export complete regardless of column
// visibility (see project_datatable_export_empty_columnmapping_breaks).
const EXPORT_COLUMNS: { key: string; label: string; wch: number }[] = [
  { key: 'exp_district', label: 'District', wch: 18 },
  { key: 'exp_school_name', label: 'School Name', wch: 45 },
  { key: 'exp_pincode', label: 'Pincode', wch: 10 },
  { key: 'exp_udise', label: 'UDISE Code', wch: 14 },
  { key: 'exp_board', label: 'Board', wch: 14 },
  { key: 'exp_state', label: 'State', wch: 14 },
  { key: 'exp_active', label: 'Active', wch: 8 },
];

interface SchoolMasterDataTableProps {
  board: string;
  district?: string;
  isActive?: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onAdd: () => void;
  onImport: () => void;
  onEdit: (school: SchoolMaster) => void;
  /** Bumped by the parent after add/edit/import so the table refetches. */
  refetchKey: number;
}

export function SchoolMasterDataTable({
  board,
  district,
  isActive,
  canCreate,
  canEdit,
  canDelete,
  onAdd,
  onImport,
  onEdit,
  refetchKey,
}: SchoolMasterDataTableProps) {
  // Deletes are handled inside the wrapper; the internal counter composes
  // with the parent's refetchKey so either source forces a refetch.
  const [internalRefetch, setInternalRefetch] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<{
    rows: SchoolMaster[];
    resetSelection?: () => void;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const { schools, total } = await SchoolMasterService.getSchools({
        board,
        district,
        is_active: isActive,
        search: params.search || undefined,
        page: params.page,
        limit: params.limit,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
      });
      return {
        success: true,
        data: schools,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.max(1, Math.ceil(total / params.limit)),
          total_items: total,
        },
      };
    },
    [board, district, isActive],
  );

  const columns = useMemo(
    () =>
      getColumns({
        canEdit,
        canDelete,
        onEdit,
        onDelete: (school) => setPendingDelete({ rows: [school] }),
      }),
    [canEdit, canDelete, onEdit],
  );

  const exportConfig = useMemo(
    () => ({
      entityName: 'schools',
      headers: EXPORT_COLUMNS.map((c) => c.key),
      columnMapping: Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label])),
      columnWidths: EXPORT_COLUMNS.map((c) => ({ wch: c.wch })),
      transformFunction: (row: SchoolMaster) => ({
        exp_district: row.district,
        exp_school_name: row.school_name,
        exp_pincode: row.pincode ?? '',
        exp_udise: row.udise_code ?? '',
        exp_board: BOARD_LABELS[row.board] ?? row.board,
        exp_state: row.state,
        exp_active: row.is_active ? 'Yes' : 'No',
      }),
    }),
    [],
  );

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const count = pendingDelete.rows.length;
    setIsDeleting(true);
    try {
      for (const school of pendingDelete.rows) {
        await SchoolMasterService.delete(school.id);
      }
      toast.success(`${count} school${count > 1 ? 's' : ''} deleted`);
      pendingDelete.resetSelection?.();
      setInternalRefetch((k) => k + 1);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  };

  const renderToolbarContent = ({
    selectedRows,
    resetSelection,
  }: {
    selectedRows: SchoolMaster[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex flex-wrap items-center gap-2'>
      {canCreate && (
        <Button onClick={onAdd} size='sm' className='h-8'>
          <Plus className='mr-2 h-4 w-4' />
          Add School
        </Button>
      )}
      {canCreate && (
        <Button onClick={onImport} variant='outline' size='sm' className='h-8'>
          <Upload className='mr-2 h-4 w-4' />
          Import
        </Button>
      )}
      {canDelete && selectedRows.length > 0 && (
        <Button
          onClick={() => setPendingDelete({ rows: selectedRows, resetSelection })}
          variant='destructive'
          size='sm'
          className='h-8'
        >
          <TrashIcon className='mr-2 h-4 w-4' />
          Delete Selected ({selectedRows.length})
        </Button>
      )}
    </div>
  );

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={exportConfig}
        idField='id'
        pageSizeOptions={[10, 25, 50, 100]}
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: canDelete,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: 'school-master-table',
        }}
        renderToolbarContent={renderToolbarContent}
        refetchKey={refetchKey + internalRefetch}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && !isDeleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.rows.length === 1 ? 'school' : 'schools'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.rows.length === 1
                ? `This will permanently delete "${pendingDelete.rows[0].school_name}".`
                : `This will permanently delete ${pendingDelete?.rows.length ?? 0} schools.`}{' '}
              Learner profiles linked to deleted schools keep their school name
              text; only the master link is cleared. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
