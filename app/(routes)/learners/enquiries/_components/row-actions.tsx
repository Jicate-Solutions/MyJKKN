// ============================================
// ENQUIRIES ROW ACTIONS COMPONENT
// ============================================
// Created: 2025-01-18
// Purpose: Actions menu for enquiry rows in TanStack Table
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
  FileCheck,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  HelpCircle
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
 * Actions menu for enquiry rows:
 * - View Details: Navigate to enquiry detail page
 * - Edit: Navigate to enquiry edit page
 * - Update Status: Change lifecycle status (enquiry, pending, approved, rejected, waitlisted)
 * - Delete: Delete the enquiry (with confirmation)
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
      toast.success('Enquiry deleted successfully');
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('[row-actions] Error deleting enquiry:', error);
      toast.error('Failed to delete enquiry. Please try again.');
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
      const result = await updateMutation.mutateAsync({
        id: learner.id,
        dto: { lifecycle_status: selectedStatus as any }
      });

      const statusLabels: Record<string, string> = {
        enquiry: 'Enquiry',
        pending: 'Pending Application',
        approved: 'Approved',
        rejected: 'Rejected',
        waitlisted: 'Waitlisted'
      };

      toast.success(`Status updated to ${statusLabels[selectedStatus]}`);

      // Check if user account was created during this update
      // @ts-ignore - Temporary metadata from service
      const userCreation = result._userCreation;
      if (userCreation) {
        if (userCreation.success) {
          toast.success(userCreation.message, { duration: 5000 });
        } else {
          toast.error(`User creation failed: ${userCreation.message}`, { duration: 5000 });
        }
      }

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
            onSelect={() => router.push(`/learners/enquiries/${learner.id}`)}
          >
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem
              onSelect={() => router.push(`/learners/enquiries/${learner.id}/edit`)}
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
                    onClick={() => handleStatusUpdate('enquiry')}
                    disabled={learner.lifecycle_status === 'enquiry' || updateMutation.isPending}
                  >
                    <HelpCircle className="mr-2 h-4 w-4 text-gray-500" />
                    Mark as Enquiry
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('pending')}
                    disabled={learner.lifecycle_status === 'pending' || updateMutation.isPending}
                  >
                    <Clock className="mr-2 h-4 w-4 text-yellow-500" />
                    Mark as Pending
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('approved')}
                    disabled={learner.lifecycle_status === 'approved' || updateMutation.isPending}
                  >
                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                    Mark as Approved
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('rejected')}
                    disabled={learner.lifecycle_status === 'rejected' || updateMutation.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4 text-red-500" />
                    Mark as Rejected
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('waitlisted')}
                    disabled={learner.lifecycle_status === 'waitlisted' || updateMutation.isPending}
                  >
                    <AlertCircle className="mr-2 h-4 w-4 text-blue-500" />
                    Mark as Waitlisted
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
              enquiry for &quot;{learner.first_name} {learner.last_name}&quot; and
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
