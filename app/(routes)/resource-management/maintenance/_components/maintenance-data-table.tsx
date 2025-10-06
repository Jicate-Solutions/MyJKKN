'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { MaintenanceLog, MaintenanceType, MaintenanceStatus } from '@/types/maintenance';
import { useState } from 'react';
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
import { toast } from 'sonner';
import { maintenanceService } from '@/lib/services/resource-management/maintenance-service';

interface MaintenanceDataTableProps {
  statusFilter?: string;
  typeFilter?: string;
  priorityFilter?: string;
}

export function MaintenanceDataTable({
  statusFilter = 'all',
  typeFilter = 'all',
  priorityFilter = 'all'
}: MaintenanceDataTableProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<MaintenanceLog[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
      const filters = {
        search_query: params.search || undefined,
        maintenance_type: typeFilter !== 'all' ? (typeFilter as MaintenanceType) : undefined,
        status: statusFilter !== 'all' ? (statusFilter as MaintenanceStatus) : undefined,
        priority: priorityFilter !== 'all' ? parseInt(priorityFilter) : undefined
      };

      const logs = await maintenanceService.getMaintenanceLogs(filters);

      // Apply client-side pagination since the service doesn't support it yet
      const startIndex = (params.page - 1) * params.limit;
      const endIndex = startIndex + params.limit;
      const paginatedLogs = logs.slice(startIndex, endIndex);

      return {
        success: true,
        data: paginatedLogs || [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.ceil(logs.length / params.limit),
          total_items: logs.length
        }
      };
    } catch (error) {
      console.error('Error fetching maintenance logs:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: MaintenanceLog[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    setSelectedForDelete(selectedRows);
    setDeleteResetFn(() => resetSelection);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (selectedForDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedForDelete.map((log: MaintenanceLog) =>
          maintenanceService.deleteMaintenanceLog(log.id)
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (successful > 0) {
        toast.success(
          `Successfully deleted ${successful} maintenance log${successful > 1 ? 's' : ''}`
        );
      }

      if (failed > 0) {
        toast.error(
          `Failed to delete ${failed} maintenance log${failed > 1 ? 's' : ''}`
        );
      }

      if (deleteResetFn) {
        deleteResetFn();
      }

      // Refresh the table
      router.refresh();

      setShowDeleteDialog(false);
      setSelectedForDelete([]);
      setDeleteResetFn(null);
    } catch (error) {
      console.error('Error deleting maintenance logs:', error);
      toast.error('An error occurred while deleting maintenance logs');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      <Button
        onClick={() => router.push('/resource-management/maintenance/new')}
        size='sm'
        className='h-8'
      >
        <Plus className='mr-2 h-4 w-4' />
        New Maintenance
      </Button>

      {props.selectedRows.length > 0 && (
        <Button
          variant='destructive'
          size='sm'
          className='h-8'
          onClick={() => handleBulkDelete(props.selectedRows, props.resetSelection)}
        >
          <TrashIcon className='mr-2 h-4 w-4' />
          Delete ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  return (
    <>
      <DataTable
        key={`${statusFilter}-${typeFilter}-${priorityFilter}`}
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'maintenance-logs',
          columnMapping: {},
          columnWidths: [],
          headers: []
        }}
        idField='id'
        config={{
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{' '}
              {selectedForDelete.length} maintenance log
              {selectedForDelete.length > 1 ? 's' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
