'use client';

// Advanced DataTable wrapper for Postal Codes — server-side pagination,
// sorting, search, export and cross-page selection via the shared
// components/data-table/ table. Filters (district/status) live in the
// parent; a new fetchData identity (or refetchKey bump) triggers a refetch,
// and the table self-clamps out-of-range pages back to 1.

import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, TrashIcon } from 'lucide-react';

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

import { PostalCodeService } from '@/lib/services/postal-code-service';
import { getErrorMessage } from '@/lib/utils';
import type { PostalCode } from '@/types/postal-code';
import { getColumns } from './columns';

// Export keys are DISTINCT from table column ids on purpose: the shared
// exporter drops export headers that collide with HIDDEN column ids, so
// non-colliding keys keep the export complete regardless of column
// visibility (see project_datatable_export_empty_columnmapping_breaks).
const EXPORT_COLUMNS: { key: string; label: string; wch: number }[] = [
  { key: 'exp_pincode', label: 'Pincode', wch: 10 },
  { key: 'exp_office_name', label: 'Office Name', wch: 40 },
  { key: 'exp_division', label: 'Division', wch: 20 },
  { key: 'exp_district', label: 'District', wch: 18 },
  { key: 'exp_latitude', label: 'Latitude', wch: 12 },
  { key: 'exp_longitude', label: 'Longitude', wch: 12 },
  { key: 'exp_active', label: 'Active', wch: 8 },
];

interface PostalCodesDataTableProps {
  district?: string;
  isActive?: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onAdd: () => void;
  onEdit: (postalCode: PostalCode) => void;
  /** Bumped by the parent after add/edit so the table refetches. */
  refetchKey: number;
}

export function PostalCodesDataTable({
  district,
  isActive,
  canCreate,
  canEdit,
  canDelete,
  onAdd,
  onEdit,
  refetchKey,
}: PostalCodesDataTableProps) {
  // Deletes are handled inside the wrapper; the internal counter composes
  // with the parent's refetchKey so either source forces a refetch.
  const [internalRefetch, setInternalRefetch] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<{
    rows: PostalCode[];
    resetSelection?: () => void;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const { rows, total } = await PostalCodeService.list({
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
        data: rows,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.max(1, Math.ceil(total / params.limit)),
          total_items: total,
        },
      };
    },
    [district, isActive],
  );

  const columns = useMemo(
    () =>
      getColumns({
        canEdit,
        canDelete,
        onEdit,
        onDelete: (postalCode) => setPendingDelete({ rows: [postalCode] }),
      }),
    [canEdit, canDelete, onEdit],
  );

  const exportConfig = useMemo(
    () => ({
      entityName: 'postal-codes',
      headers: EXPORT_COLUMNS.map((c) => c.key),
      columnMapping: Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label])),
      columnWidths: EXPORT_COLUMNS.map((c) => ({ wch: c.wch })),
      transformFunction: (row: PostalCode) => ({
        exp_pincode: row.pincode,
        exp_office_name: row.office_name,
        exp_division: row.division ?? '',
        exp_district: row.district,
        exp_latitude: row.latitude ?? '',
        exp_longitude: row.longitude ?? '',
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
      for (const postalCode of pendingDelete.rows) {
        await PostalCodeService.delete(postalCode.id);
      }
      toast.success(`${count} postal code${count > 1 ? 's' : ''} deleted`);
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
    selectedRows: PostalCode[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex flex-wrap items-center gap-2'>
      {canCreate && (
        <Button onClick={onAdd} size='sm' className='h-8'>
          <Plus className='mr-2 h-4 w-4' />
          Add Postal Code
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
          columnResizingTableId: 'postal-codes-table',
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
              Delete {pendingDelete?.rows.length === 1 ? 'postal code' : 'postal codes'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.rows.length === 1
                ? `This will permanently delete "${pendingDelete.rows[0].office_name}".`
                : `This will permanently delete ${pendingDelete?.rows.length ?? 0} postal codes.`}{' '}
              This action cannot be undone.
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
