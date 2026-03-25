'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileEdit, Trash2, MoreVertical } from 'lucide-react';
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

interface EnquiryDetailActionsProps {
  enquiry: LearnerProfile;
}

export function EnquiryDetailActions({ enquiry }: EnquiryDetailActionsProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  // Use React Query mutation for delete with automatic cache invalidation
  const deleteMutation = useDeleteLearnerProfile();

  // Only access permissions after they've loaded - use learners.admissions module for enquiries
  const hasEditPermission =
    !permissionsLoading && (isSuperAdmin || canAccess('learners.admissions', 'edit'));
  const hasDeletePermission =
    !permissionsLoading && (isSuperAdmin || canAccess('learners.admissions', 'delete'));

  const handleEdit = () => {
    router.push(`/learners/enquiries/${enquiry.id}/edit`);
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(enquiry.id);
      toast.success('Enquiry deleted successfully');
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
    </>
  );
}
