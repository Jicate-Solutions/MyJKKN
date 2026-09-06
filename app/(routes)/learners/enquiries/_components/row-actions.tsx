'use client';
// ============================================
// ENQUIRIES ROW ACTIONS COMPONENT
// ============================================
// Created: 2025-01-18
// Purpose: Actions menu for enquiry rows in TanStack Table
// ============================================


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
  HelpCircle,
  Landmark,
  ArrowRightLeft,
  Send,
} from 'lucide-react';
import { TransferEnquiryDialog } from './transfer-enquiry-dialog';
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
// 2026-05-21: 'Mark as Account' from the table row-actions now routes through
// the same AccountVerificationDialog the detail-page status updater uses.
// markAsAccountMutation (which the legacy flow called here) reads the
// institution's required_documents config and fails with P0001 when
// documents are configured but not yet collected at this UI surface.
// The dialog handles the documents-optional path + provides the
// verification preview the user requested.
import { AccountVerificationDialog } from './_account/account-verification-dialog';

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
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  // 2026-05-21: dedicated state for the verification dialog. The 'account'
  // path opens this instead of the inline AlertDialog so admins see the
  // dim preview + fee structure + total before committing bills.
  const [showAccountVerifyDialog, setShowAccountVerifyDialog] = useState(false);

  // Use learners.admissions module for enquiries
  const canEdit = isSuperAdmin || canAccess('learners.admissions', 'edit');
  const canDelete = isSuperAdmin || canAccess('learners.admissions', 'delete');
  const canTransfer = isSuperAdmin || canAccess('learners.admissions', 'transfer');
  // Transfers are blocked once billing has been created or the learner is active.
  const transferBlockedByStatus = ['account', 'active', 'graduated', 'exited'].includes(
    learner.lifecycle_status
  );

  // Use React Query mutation hooks with automatic cache invalidation
  const deleteMutation = useDeleteLearnerProfile();
  const updateMutation = useUpdateLearnerProfile();

  const handleDelete = async () => {
    if (!canDelete) return;

    console.log('[enquiries/row-actions] Delete started', { id: learner.id });

    try {
      await deleteMutation.mutateAsync(learner.id);
      console.log('[enquiries/row-actions] Delete mutation completed');

      toast.success('Admitted deleted successfully');

      // Close dialog first to clear component state
      console.log('[enquiries/row-actions] Closing dialog');
      setShowDeleteDialog(false);

      // Delay refresh to allow React to finish updating component state
      // This prevents race conditions between client state and server re-render
      console.log('[enquiries/row-actions] Scheduling router.refresh()');
      setTimeout(() => {
        console.log('[enquiries/row-actions] Calling router.refresh()');
        router.refresh();
      }, 300);
    } catch (error) {
      console.error('[enquiries/row-actions] Error deleting enquiry:', error);
      toast.error('Failed to delete enquiry. Please try again.');
      setShowDeleteDialog(false);
    }
  };

  const handleStatusUpdate = (newStatus: string) => {
    if (!canEdit) return;
    // 2026-05-21: the 'account' transition gets the dedicated verification
    // dialog (academic-dimension preview + fee-structure resolution + total)
    // instead of the lightweight AlertDialog used for the other statuses.
    // The dialog itself drives admission_account_transition_with_bills, so
    // we never enter the confirmStatusUpdate path for this status.
    if (newStatus === 'account') {
      setShowAccountVerifyDialog(true);
      return;
    }
    setSelectedStatus(newStatus);
    setShowStatusDialog(true);
  };

  const confirmStatusUpdate = async () => {
    if (!canEdit || !selectedStatus) return;
    // 'account' never reaches this handler — it's routed through
    // AccountVerificationDialog. Every other status flows here unchanged.

    console.log('[enquiries/row-actions] Status update started', {
      id: learner.id,
      from: learner.lifecycle_status,
      to: selectedStatus
    });

    try {
      const result = await updateMutation.mutateAsync({
        id: learner.id,
        dto: { lifecycle_status: selectedStatus as any }
      });

      console.log('[enquiries/row-actions] Status mutation completed', { result });

      // Check if user account was created during this update
      // @ts-expect-error - Temporary metadata from service
      const userCreation = result._userCreation;
      if (userCreation) {
        console.log('[enquiries/row-actions] User creation metadata found', userCreation);
        if (userCreation.success) {
          toast.success(userCreation.message, { duration: 5000 });
        } else {
          toast.error(`User creation failed: ${userCreation.message}`, { duration: 5000 });
        }
      }

      const statusLabels: Record<string, string> = {
        enquiry: 'Enquiry',
        enquiry_submitted: 'Enquiry Submitted',
        admitted: 'Admitted',
        pending: 'Pending Application',
        rejected: 'Rejected',
        waitlisted: 'Waitlisted'
      };

      toast.success(`Status updated to ${statusLabels[selectedStatus] ?? selectedStatus}`);

      // Close dialog and clear state first
      setShowStatusDialog(false);
      setSelectedStatus('');

      // Delay refresh to allow React to finish updating component state
      setTimeout(() => {
        router.refresh();
      }, 300);
    } catch (error) {
      console.error('[enquiries/row-actions] Error updating status:', error);
      toast.error('Failed to update status. Please try again.');
      setShowStatusDialog(false);
      setSelectedStatus('');
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
                    onClick={() => handleStatusUpdate('enquiry_submitted')}
                    disabled={learner.lifecycle_status === 'enquiry_submitted' || updateMutation.isPending}
                  >
                    <Send className="mr-2 h-4 w-4 text-sky-500" />
                    Mark as Enquiry Submitted
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('pending')}
                    disabled={learner.lifecycle_status === 'pending' || updateMutation.isPending}
                  >
                    <Clock className="mr-2 h-4 w-4 text-yellow-500" />
                    Mark as Pending
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate('account')}
                    disabled={learner.lifecycle_status === 'account' || learner.lifecycle_status === 'active' || updateMutation.isPending}
                  >
                    <Landmark className="mr-2 h-4 w-4 text-amber-500" />
                    Mark as Account
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

          {canTransfer && !transferBlockedByStatus && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setShowTransferDialog(true)}>
                <ArrowRightLeft className="mr-2 h-4 w-4 text-indigo-600" />
                Transfer to Another Institution
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
            <Button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Enquiry Dialog */}
      {canTransfer && !transferBlockedByStatus && (
        <TransferEnquiryDialog
          enquiry={learner}
          open={showTransferDialog}
          onOpenChange={setShowTransferDialog}
          onTransferred={() => {
            setTimeout(() => router.refresh(), 300);
          }}
        />
      )}

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
            <Button
              onClick={confirmStatusUpdate}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Updating...' : 'Update Status'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Account-transition verification dialog — same component the detail
       *  page header uses. Mounted conditionally so the
       *  FeeChangeEventService.hasPendingForLearner probe inside the dialog
       *  only fires when the user actually picks 'Mark as Account'. */}
      {showAccountVerifyDialog && (
        <AccountVerificationDialog
          learner={learner}
          open={showAccountVerifyDialog}
          onOpenChange={setShowAccountVerifyDialog}
          onSuccess={() => {
            // The dialog already toasts + writes the activity audit row,
            // so we just refresh the table to surface the new lifecycle
            // status badge.
            setTimeout(() => router.refresh(), 300);
          }}
        />
      )}
    </>
  );
}
