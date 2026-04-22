'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileEdit, Trash2, MoreVertical, Landmark, ArrowRightLeft } from 'lucide-react';
import { TransferEnquiryDialog } from './transfer-enquiry-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { LearnerProfile } from '@/types/learner-profile';
import { useDeleteLearnerProfile } from '@/hooks/use-learner-profiles';
import { useMarkAsAccount } from '@/hooks/billing/use-onboarding';
import { OnboardingService } from '@/lib/services/billing/onboarding/onboarding-service';

interface EnquiryDetailActionsProps {
  enquiry: LearnerProfile;
}

export function EnquiryDetailActions({ enquiry }: EnquiryDetailActionsProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  // Use React Query mutation for delete with automatic cache invalidation
  const deleteMutation = useDeleteLearnerProfile();
  const markAsAccountMutation = useMarkAsAccount();

  // Only access permissions after they've loaded - use learners.admissions module for enquiries
  const hasEditPermission =
    !permissionsLoading && (isSuperAdmin || canAccess('learners.admissions', 'edit'));
  const hasDeletePermission =
    !permissionsLoading && (isSuperAdmin || canAccess('learners.admissions', 'delete'));
  const hasMarkAccountPermission =
    !permissionsLoading && (isSuperAdmin || canAccess('learners.admissions', 'mark_account'));
  const hasTransferPermission =
    !permissionsLoading && (isSuperAdmin || canAccess('learners.admissions', 'transfer'));
  const transferBlockedByStatus = ['account', 'active', 'graduated', 'exited'].includes(
    enquiry.lifecycle_status
  );

  const handleEdit = () => {
    router.push(`/learners/enquiries/${enquiry.id}/edit`);
  };

  const handleMarkAsAccount = () => {
    const validation = OnboardingService.validateFinanceFields(enquiry);
    if (!validation.valid) {
      toast.error(`Missing finance fields: ${(validation as any).missing.join(', ')}. Please edit the enquiry to add finance details.`);
      return;
    }
    setAccountDialogOpen(true);
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(enquiry.id);
      toast.success('Admitted deleted successfully');
      router.push('/learners/enquiries');
    } catch (error) {
      console.error('[enquiry-detail-actions] Error deleting enquiry:', error);
      toast.error('Failed to delete the enquiry. Please try again.');
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='icon'>
            <MoreVertical className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hasEditPermission && (
            <DropdownMenuItem onClick={handleEdit}>
              <FileEdit className='mr-2 h-4 w-4' />
              Edit Enquiry
            </DropdownMenuItem>
          )}
          {hasMarkAccountPermission && enquiry.lifecycle_status === 'approved' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleMarkAsAccount}>
                <Landmark className='mr-2 h-4 w-4' />
                Mark as Account
              </DropdownMenuItem>
            </>
          )}
          {hasTransferPermission && !transferBlockedByStatus && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTransferDialogOpen(true)}>
                <ArrowRightLeft className='mr-2 h-4 w-4 text-indigo-600' />
                Transfer to Another Institution
              </DropdownMenuItem>
            </>
          )}
          {hasDeletePermission && (
            <DropdownMenuItem
              onClick={() => setDeleteDialogOpen(true)}
              className='text-destructive'
            >
              <Trash2 className='mr-2 h-4 w-4' />
              Delete Enquiry
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              enquiry for {enquiry.first_name} {enquiry.last_name || ''} (
              {enquiry.application_id || 'No Application ID'}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {hasTransferPermission && !transferBlockedByStatus && (
        <TransferEnquiryDialog
          enquiry={enquiry}
          open={transferDialogOpen}
          onOpenChange={setTransferDialogOpen}
          onTransferred={() => router.refresh()}
        />
      )}

      <AlertDialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to Accounts Team?</AlertDialogTitle>
            <AlertDialogDescription>
              {enquiry.first_name} {enquiry.last_name || ''} will move to the
              Accounts team's onboarding queue. Bills will not be created
              automatically — the accounts team will create them manually
              using the captured fee items as reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markAsAccountMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await markAsAccountMutation.mutateAsync(enquiry.id);
                  setAccountDialogOpen(false);
                } catch {}
              }}
              disabled={markAsAccountMutation.isPending}
            >
              {markAsAccountMutation.isPending ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
