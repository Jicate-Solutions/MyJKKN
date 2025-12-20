// ============================================
// PROFILES ROW ACTIONS COMPONENT
// ============================================
// Created: 2025-01-19
// Purpose: Actions menu for active learner profile rows in TanStack Table
// ============================================

'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  FileEdit,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  UserCheck,
  UserX,
  GraduationCap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuLabel,
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
} from '@/components/ui/alert-dialog';
import type { LearnerProfile } from '@/types/learner-profile';
import { useDeleteLearnerProfile, useUpdateLearnerProfile } from '@/hooks/use-learner-profiles';
import { usePermissions } from '@/hooks/use-permissions';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

/**
 * DataTableRowActions Component
 *
 * Actions menu for active learner profile rows:
 * - View Details: Navigate to profile detail page
 * - Edit: Navigate to profile edit page
 * - Update Status: Change lifecycle status (active, inactive, exited, graduated)
 * - Delete: Delete the profile (with confirmation)
 *
 * Permissions:
 * - View: Always available
 * - Edit: Requires 'learners' edit permission or super admin
 * - Update Status: Requires 'learners' edit permission or super admin
 * - Delete: Requires 'learners' delete permission or super admin
 */
export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const learner = row.original as LearnerProfile;
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');

  const canEdit = isSuperAdmin || canAccess('learners', 'edit');
  const canDelete = isSuperAdmin || canAccess('learners', 'delete');

  // Use React Query mutation hooks with automatic cache invalidation
  const deleteMutation = useDeleteLearnerProfile();
  const updateMutation = useUpdateLearnerProfile();

  const handleDelete = async () => {
    if (!canDelete) return;

    try {
      await deleteMutation.mutateAsync(learner.id);
      toast.success('Student profile deleted successfully');
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('[row-actions] Error deleting profile:', error);
      toast.error('Failed to delete profile. Please try again.');
    }
  };

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
        dto: { lifecycle_status: selectedStatus as any }
      });

      const statusLabels: Record<string, string> = {
        active: 'Active',
        inactive: 'Inactive',
        exited: 'Exited',
        graduated: 'Graduated'
      };

      toast.success(`Status updated to ${statusLabels[selectedStatus]}`);
      setShowStatusDialog(false);
      setSelectedStatus('');
    } catch (error) {
      console.error('[row-actions] Error updating status:', error);
      toast.error('Failed to update status. Please try again.');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <DotsHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          <DropdownMenuItem
            onSelect={() => router.push(`/learners/profiles/${learner.id}`)}
          >
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem
              onSelect={() => router.push(`/learners/profiles/${learner.id}/edit`)}
            >
              <FileEdit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}

          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Clock className="mr-2 h-4 w-4" />
                  Update Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('active')}
                    disabled={learner.lifecycle_status === 'active' || updateMutation.isPending}
                  >
                    <UserCheck className="mr-2 h-4 w-4 text-green-500" />
                    Mark as Active
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('inactive')}
                    disabled={learner.lifecycle_status === 'inactive' || updateMutation.isPending}
                  >
                    <UserX className="mr-2 h-4 w-4 text-orange-500" />
                    Mark as Inactive
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('exited')}
                    disabled={learner.lifecycle_status === 'exited' || updateMutation.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4 text-red-500" />
                    Mark as Exited
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('graduated')}
                    disabled={learner.lifecycle_status === 'graduated' || updateMutation.isPending}
                  >
                    <GraduationCap className="mr-2 h-4 w-4 text-blue-500" />
                    Mark as Graduated
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}

          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setShowDeleteDialog(true)}
                className="text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              student profile for &quot;{learner.first_name} {learner.last_name}&quot; and
              remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogAction
              onClick={confirmStatusUpdate}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Updating...' : 'Update Status'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
