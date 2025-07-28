'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { StaffPlan } from '@/types/staff-planning';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { usePermissions } from '@/hooks/use-permissions';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const staffPlan = row.original as StaffPlan;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewStaffPlan =
    isSuperAdmin || canAccess('academic.staff.planning', 'view');
  const canEditStaffPlan =
    isSuperAdmin || canAccess('academic.staff.planning', 'edit');
  const canDeleteStaffPlan =
    isSuperAdmin || canAccess('academic.staff.planning', 'delete');

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await StaffPlanService.deleteStaffPlan(id);
    },
    onSuccess: () => {
      toast.success('Staff plan deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['staff-plans'] });
      setShowDeleteAlert(false);
    },
    onError: (error: any) => {
      console.error('Error deleting staff plan:', error);

      // Provide more specific error messages
      if (
        error?.message?.includes('not found') ||
        error?.message?.includes('already deleted')
      ) {
        toast.error('Staff plan not found. It may have already been deleted.');
        // Refresh the data to show current state
        queryClient.invalidateQueries({ queryKey: ['staff-plans'] });
      } else if (error?.code === 'PGRST116') {
        toast.error('Staff plan not found or already deleted.');
        // Refresh the data to show current state
        queryClient.invalidateQueries({ queryKey: ['staff-plans'] });
      } else {
        toast.error(error?.message || 'Failed to delete staff plan');
      }

      setShowDeleteAlert(false);
    }
  });

  const handleView = () => {
    router.push(`/academic/staff-planning/${staffPlan.id}`);
  };

  const handleEdit = () => {
    router.push(`/academic/staff-planning/${staffPlan.id}/edit`);
  };

  const handleDelete = () => {
    deleteMutation.mutate(staffPlan.id);
  };

  return (
    <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <DotsHorizontalIcon className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[160px]'>
          {canViewStaffPlan && (
            <DropdownMenuItem onClick={handleView}>
              View Details
              <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {canEditStaffPlan && (
            <DropdownMenuItem onClick={handleEdit}>
              Edit
              <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {(canViewStaffPlan || canEditStaffPlan) && canDeleteStaffPlan && (
            <DropdownMenuSeparator />
          )}
          {canDeleteStaffPlan && (
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                className='text-red-600 focus:text-red-600'
                onSelect={(e) => e.preventDefault()}
              >
                Delete
                <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
              </DropdownMenuItem>
            </AlertDialogTrigger>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the staff
            plan &quot;{staffPlan.institution?.name} -{' '}
            {staffPlan.program?.program_name}&quot; and all associated course
            assignments.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className='bg-red-600 focus:ring-red-600'
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
