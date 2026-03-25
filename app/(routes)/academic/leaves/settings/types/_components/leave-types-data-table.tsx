'use client';

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
import { useLeaveTypes } from '@/hooks/academic/use-leave-types';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { LeaveTypeService } from '@/lib/services/academic/leave-type-service';
import { toast } from 'react-hot-toast';
import { createColumns } from './columns';

export function LeaveTypesDataTable() {
  const { leaveTypes, loading, error, fetchLeaveTypes } = useLeaveTypes();
  const { institutions } = useInstitutionsWithAccess();
  const { isSuperAdmin } = usePermissions();

  // Row selection state
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Create institution lookup map
  const institutionMap = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((inst) => {
      map.set(inst.id, inst.name);
    });
    return map;
  }, [institutions]);

  // Create columns with institution lookup
  const columns = useMemo(
    () => createColumns({ institutionMap, isSuperAdmin }),
    [institutionMap, isSuperAdmin]
  );

  const table = useReactTable({
    data: leaveTypes,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      rowSelection
    },
    getRowId: (row) => row.id
  });

  // Get selected row IDs
  const selectedRowIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const selectedCount = selectedRowIds.length;

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedRowIds.length === 0) return;

    try {
      setIsBulkDeleting(true);
      const result = await LeaveTypeService.bulkDeleteLeaveTypes(selectedRowIds);

      if (result.success.length > 0) {
        toast.success(`Successfully deleted ${result.success.length} leave type(s)`);
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} leave type(s)`);
      }

      // Clear selection and refresh
      setRowSelection({});
      setShowBulkDeleteDialog(false);
      fetchLeaveTypes();
    } catch (error) {
      toast.error('Failed to delete leave types');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-destructive'>{error}</p>
        <Button variant='outline' onClick={() => fetchLeaveTypes()} className='mt-4'>
          <RefreshCw className='h-4 w-4 mr-2' />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Toolbar */}
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
          onClick={() => fetchLeaveTypes()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className='rounded-md border overflow-x-auto'>
        <Table className='min-w-[600px]'>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
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
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center'
                >
                  No leave types found. Create your first leave type to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer with selection count */}
      {leaveTypes.length > 0 && (
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>
            {selectedCount} of {leaveTypes.length} row(s) selected
          </span>
          <span>
            Total: {leaveTypes.length} leave type(s)
          </span>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Leave Types</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedCount} leave type(s)?
              This action cannot be undone. Existing leaves using these types will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isBulkDeleting ? 'Deleting...' : `Delete ${selectedCount} Leave Type(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
