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
import { FileEdit, Trash2, FileCheck, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
 * - Convert to Application: Change status from 'enquiry' to 'pending'
 * - Delete: Delete the enquiry (with confirmation)
 *
 * Permissions:
 * - View: Always available
 * - Edit: Requires 'learners' edit permission or super admin
 * - Convert: Requires 'learners' edit permission or super admin, only for 'enquiry' status
 * - Delete: Requires 'learners' delete permission or super admin
 */
export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const learner = row.original as LearnerProfile;
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  const canEdit = isSuperAdmin || canAccess('learners', 'edit');
  const canDelete = isSuperAdmin || canAccess('learners', 'delete');
  const canConvert = canEdit && learner.lifecycle_status === 'enquiry';

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

  const handleConvert = async () => {
    if (!canConvert) return;

    try {
      await updateMutation.mutateAsync({
        id: learner.id,
        dto: { lifecycle_status: 'pending' }
      });
      toast.success('Enquiry converted to application successfully');
      setShowConvertDialog(false);
    } catch (error) {
      console.error('[row-actions] Error converting enquiry:', error);
      toast.error('Failed to convert enquiry. Please try again.');
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
        <DropdownMenuContent align="end" className="w-[180px]">
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

          {canConvert && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setShowConvertDialog(true)}
                className="text-blue-600"
              >
                <FileCheck className="mr-2 h-4 w-4" />
                Convert to Application
              </DropdownMenuItem>
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

      {/* Convert to Application Confirmation Dialog */}
      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will change the status from &quot;Enquiry&quot; to &quot;Pending
              Application&quot; for {learner.first_name} {learner.last_name}. The
              application will then be available for review and approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConvert}
              disabled={updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateMutation.isPending ? 'Converting...' : 'Convert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
