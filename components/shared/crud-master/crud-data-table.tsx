'use client';

// Generic data-table for the Settings-CRUD pattern.
//
// Renders: toolbar (bulk-delete count + button, refresh), table with loading
// skeleton + empty state, footer with row counts, bulk-delete confirm dialog.
//
// Extracted 2026-04-21 from app/(routes)/academic/leaves/settings/types/
// _components/leave-types-data-table.tsx (245 LOC) — see chain Q2 principle.
// Consumers: academic/leaves/settings/types, campus-living/settings/leave-types
// (PR-3b). Next extraction candidates when 3rd consumer appears: admission/
// settings/sources, solutions/settings/types.

import { useState, useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  RowSelectionState
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
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
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { CrudEntity, CrudDataTableProps } from './types';

export function CrudDataTable<T extends CrudEntity>({
  items,
  loading,
  error,
  onRefresh,
  onBulkDelete,
  columns,
  entityLabel,
  entityLabelPlural,
  emptyMessage,
  getRowId
}: CrudDataTableProps<T>) {
  const plural = entityLabelPlural ?? `${entityLabel}s`;
  const effectiveEmpty =
    emptyMessage ?? `No ${plural} found. Create your first ${entityLabel} to get started.`;

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const selectedRowIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );
  const selectedCount = selectedRowIds.length;

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
    getRowId: getRowId ?? ((row) => row.id)
  });

  const handleBulkDelete = async () => {
    if (selectedRowIds.length === 0) return;
    try {
      setIsBulkDeleting(true);
      const result = await onBulkDelete(selectedRowIds);
      if (result.success.length > 0) {
        toast.success(`Successfully deleted ${result.success.length} ${plural}`);
      }
      if (result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} ${plural}`);
      }
      setRowSelection({});
      setShowBulkDeleteDialog(false);
    } catch {
      toast.error(`Failed to delete ${plural}`);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-destructive'>{error}</p>
        <Button variant='outline' onClick={() => onRefresh()} className='mt-4'>
          <RefreshCw className='h-4 w-4 mr-2' />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2 flex-wrap'>
        <div className='flex items-center gap-2'>
          {selectedCount > 0 && (
            <>
              <span className='text-sm text-muted-foreground'>
                {selectedCount} row(s) selected
              </span>
              <Button
                variant='destructive'
                size='sm'
                onClick={() => setShowBulkDeleteDialog(true)}
              >
                <Trash2 className='h-4 w-4 mr-2' />
                Delete Selected
              </Button>
            </>
          )}
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => onRefresh()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border overflow-x-auto'>
        <Table className='min-w-[600px]'>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className='h-8 w-full' />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center'>
                  {effectiveEmpty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {items.length > 0 && (
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>
            {selectedCount} of {items.length} row(s) selected
          </span>
          <span>
            Total: {items.length} {plural}
          </span>
        </div>
      )}

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected {plural}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedCount} {plural}?
              This action cannot be undone. Existing records using these will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isBulkDeleting ? 'Deleting...' : `Delete ${selectedCount} ${plural}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
