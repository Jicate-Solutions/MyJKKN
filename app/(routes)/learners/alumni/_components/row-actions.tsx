'use client';

import { useState } from 'react';
import { Row } from '@tanstack/react-table';
import {
  MoreHorizontal,
  Eye,
  FileEdit,
  Clock,
  UserCheck,
  UserX,
  XCircle,
  GraduationCap,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { useUpdateLearnerProfile } from '@/hooks/use-learner-profiles';
import type { LearnerProfile } from '@/types/learner-profile';

interface DataTableRowActionsProps {
  row: Row<LearnerProfile>;
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const learner = row.original;
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');

  const canView = isSuperAdmin || isAdmissionGlobalUser || canAccess('learners', 'view');
  const canEdit = isSuperAdmin || isAdmissionGlobalUser || canAccess('learners', 'edit');

  const updateMutation = useUpdateLearnerProfile();

  const handleStatusUpdate = (newStatus: string) => {
    if (!canEdit) return;
    setSelectedStatus(newStatus);
    setShowStatusDialog(true);
  };

  const confirmStatusUpdate = async () => {
    if (!canEdit || !selectedStatus) return;
    try {
      await updateMutation.mutateAsync({
        id: learner.id,
        dto: { lifecycle_status: selectedStatus as LearnerProfile['lifecycle_status'] },
      });

      const statusLabels: Record<string, string> = {
        active: 'Active',
        inactive: 'Inactive',
        exited: 'Exited',
        graduated: 'Graduated',
        alumni: 'Alumni',
      };

      toast.success(`Status updated to ${statusLabels[selectedStatus] ?? selectedStatus}`);
      setShowStatusDialog(false);
      setSelectedStatus('');
      router.refresh();
    } catch (error) {
      console.error('[alumni/row-actions] Error updating status:', error);
      toast.error('Failed to update status. Please try again.');
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
        <DropdownMenuContent align='end' className='w-[200px]'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          {canView && (
            <DropdownMenuItem
              onSelect={() => router.push(`/learners/alumni/${learner.id}`)}
            >
              <Eye className='mr-2 h-4 w-4' />
              View Details
            </DropdownMenuItem>
          )}

          {canEdit && (
            <DropdownMenuItem
              onSelect={() => router.push(`/learners/alumni/${learner.id}/edit`)}
            >
              <FileEdit className='mr-2 h-4 w-4' />
              Edit
            </DropdownMenuItem>
          )}

          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Clock className='mr-2 h-4 w-4' />
                  Update Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('active')}
                    disabled={learner.lifecycle_status === 'active' || updateMutation.isPending}
                  >
                    <UserCheck className='mr-2 h-4 w-4 text-green-500' />
                    Mark as Active
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('inactive')}
                    disabled={learner.lifecycle_status === 'inactive' || updateMutation.isPending}
                  >
                    <UserX className='mr-2 h-4 w-4 text-orange-500' />
                    Mark as Inactive
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('exited')}
                    disabled={learner.lifecycle_status === 'exited' || updateMutation.isPending}
                  >
                    <XCircle className='mr-2 h-4 w-4 text-red-500' />
                    Mark as Exited
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('graduated')}
                    disabled={learner.lifecycle_status === 'graduated' || updateMutation.isPending}
                  >
                    <GraduationCap className='mr-2 h-4 w-4 text-blue-500' />
                    Mark as Graduated
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('alumni')}
                    disabled={learner.lifecycle_status === 'alumni' || updateMutation.isPending}
                  >
                    <Users className='mr-2 h-4 w-4 text-purple-500' />
                    Mark as Alumni
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status Update Confirmation Dialog */}
      <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update the status for &quot;{learner.first_name}{' '}
              {learner.last_name}&quot; from &quot;
              {learner.lifecycle_status.charAt(0).toUpperCase() +
                learner.lifecycle_status.slice(1)}
              &quot; to &quot;
              {selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>Cancel</AlertDialogCancel>
            <Button onClick={confirmStatusUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Updating...' : 'Update Status'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
