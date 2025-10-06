'use client';

import { useState } from 'react';
import { Row } from '@tanstack/react-table';
import { MoreHorizontal, Edit, Trash, Eye, PlayCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
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
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { MaintenanceLog } from '@/types/maintenance';
import { MaintenanceStatus } from '@/types/maintenance';
import {
  useDeleteMaintenanceLog,
  useUpdateMaintenanceLog,
  useCompleteMaintenanceLog,
  useCancelMaintenanceLog
} from '@/hooks/resource-management/use-maintenance';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showStartAlert, setShowStartAlert] = useState(false);
  const [showCompleteAlert, setShowCompleteAlert] = useState(false);
  const [showCancelAlert, setShowCancelAlert] = useState(false);

  const router = useRouter();
  const log = row.original as MaintenanceLog;

  const deleteLog = useDeleteMaintenanceLog();
  const updateLog = useUpdateMaintenanceLog();
  const completeLog = useCompleteMaintenanceLog();
  const cancelLog = useCancelMaintenanceLog();

  const canStart = log.status === 'scheduled';
  const canComplete = log.status === 'scheduled' || log.status === 'in_progress';
  const canCancel = log.status === 'scheduled' || log.status === 'in_progress';
  const canEdit = log.status !== 'completed' && log.status !== 'cancelled';

  const handleDelete = async () => {
    try {
      await deleteLog.mutateAsync(log.id);
      setShowDeleteAlert(false);
    } catch (error) {
      console.error('Error deleting maintenance log:', error);
    }
  };

  const handleStart = async () => {
    try {
      await updateLog.mutateAsync({
        id: log.id,
        dto: { status: MaintenanceStatus.IN_PROGRESS }
      });
      toast.success('Maintenance started successfully');
      setShowStartAlert(false);
    } catch (error) {
      console.error('Error starting maintenance:', error);
      toast.error('Failed to start maintenance');
    }
  };

  const handleComplete = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      await completeLog.mutateAsync({
        id: log.id,
        data: {
          completed_date: today,
          notes: 'Completed from maintenance table'
        }
      });
      setShowCompleteAlert(false);
    } catch (error) {
      console.error('Error completing maintenance:', error);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelLog.mutateAsync({
        id: log.id,
        reason: 'Cancelled from maintenance table'
      });
      setShowCancelAlert(false);
    } catch (error) {
      console.error('Error cancelling maintenance:', error);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[180px]'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => router.push(`/resource-management/maintenance/${log.id}`)}
          >
            <Eye className='mr-2 h-4 w-4' />
            View Details
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem
              onClick={() => router.push(`/resource-management/maintenance/${log.id}/edit`)}
            >
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {canStart && (
            <DropdownMenuItem onClick={() => setShowStartAlert(true)}>
              <PlayCircle className='mr-2 h-4 w-4' />
              Start
            </DropdownMenuItem>
          )}

          {canComplete && (
            <DropdownMenuItem onClick={() => setShowCompleteAlert(true)} className='text-green-600'>
              <CheckCircle2 className='mr-2 h-4 w-4' />
              Mark Complete
            </DropdownMenuItem>
          )}

          {canCancel && (
            <DropdownMenuItem onClick={() => setShowCancelAlert(true)} className='text-orange-600'>
              <XCircle className='mr-2 h-4 w-4' />
              Cancel
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setShowDeleteAlert(true)}
            className='text-destructive'
          >
            <Trash className='mr-2 h-4 w-4' />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Alert */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              maintenance log &quot;{log.title}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLog.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteLog.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Start Alert */}
      <AlertDialog open={showStartAlert} onOpenChange={setShowStartAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Maintenance?</AlertDialogTitle>
            <AlertDialogDescription>
              This will change the status to &quot;In Progress&quot; for &quot;{log.title}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStart}
              disabled={updateLog.isPending}
            >
              {updateLog.isPending ? 'Starting...' : 'Start'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete Alert */}
      <AlertDialog open={showCompleteAlert} onOpenChange={setShowCompleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Maintenance?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the maintenance log &quot;{log.title}&quot; as completed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleComplete}
              disabled={completeLog.isPending}
              className='bg-green-600 hover:bg-green-700'
            >
              {completeLog.isPending ? 'Completing...' : 'Complete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Alert */}
      <AlertDialog open={showCancelAlert} onOpenChange={setShowCancelAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Maintenance?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the maintenance log &quot;{log.title}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelLog.isPending}
              className='bg-orange-600 hover:bg-orange-700'
            >
              {cancelLog.isPending ? 'Cancelling...' : 'Confirm Cancel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
