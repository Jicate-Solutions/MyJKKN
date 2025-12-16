'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MoreHorizontal, Eye, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { LeaveService } from '@/lib/services/academic/leave-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { InstitutionLeave } from '@/types/leaves';

interface LeaveRowActionsProps {
  leave: InstitutionLeave;
}

export function LeaveRowActions({ leave }: LeaveRowActionsProps) {
  const router = useRouter();
  const { userProfile, canAccess } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveComment, setApproveComment] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const canApprove = leave.status === 'pending' && canAccess('academic.leaves', 'approve');
  const canEdit = leave.status === 'pending' && canAccess('academic.leaves', 'edit');
  const canDelete = canAccess('academic.leaves', 'delete');

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await LeaveService.deleteLeave(leave.id);
      toast.success('Leave deleted successfully');
      router.refresh();
    } catch (error) {
      console.error('Error deleting leave:', error);
      toast.error('Failed to delete leave');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleApprove = async () => {
    try {
      setIsApproving(true);
      if (!userProfile?.id) throw new Error('User not authenticated');
      await LeaveService.approveLeave(leave.id, userProfile.id, approveComment);
      toast.success('Leave approved successfully');
      router.refresh();
    } catch (error) {
      console.error('Error approving leave:', error);
      toast.error('Failed to approve leave');
    } finally {
      setIsApproving(false);
      setShowApproveDialog(false);
      setApproveComment('');
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    try {
      setIsRejecting(true);
      if (!userProfile?.id) throw new Error('User not authenticated');
      await LeaveService.rejectLeave(leave.id, userProfile.id, rejectReason);
      toast.success('Leave rejected');
      router.refresh();
    } catch (error) {
      console.error('Error rejecting leave:', error);
      toast.error('Failed to reject leave');
    } finally {
      setIsRejecting(false);
      setShowRejectDialog(false);
      setRejectReason('');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <span className='sr-only'>Open menu</span>
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => router.push(`/academic/leaves/${leave.id}`)}
          >
            <Eye className='mr-2 h-4 w-4' />
            View Details
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem
              onClick={() => router.push(`/academic/leaves/${leave.id}/edit`)}
            >
              <Pencil className='mr-2 h-4 w-4' />
              Edit
            </DropdownMenuItem>
          )}

          {canApprove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowApproveDialog(true)}
                className='text-green-600'
              >
                <Check className='mr-2 h-4 w-4' />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowRejectDialog(true)}
                className='text-destructive'
              >
                <X className='mr-2 h-4 w-4' />
                Reject
              </DropdownMenuItem>
            </>
          )}

          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className='text-destructive'
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leave</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{leave.leave_name}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Leave</DialogTitle>
            <DialogDescription>
              Approve "{leave.leave_name}" from{' '}
              {new Date(leave.start_date).toLocaleDateString()} to{' '}
              {new Date(leave.end_date).toLocaleDateString()}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='comment'>Comment (optional)</Label>
              <Textarea
                id='comment'
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                placeholder='Add a comment...'
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowApproveDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isApproving}
              className='bg-green-600 hover:bg-green-700'
            >
              {isApproving ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Leave</DialogTitle>
            <DialogDescription>
              Reject "{leave.leave_name}". Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='reason'>Reason for rejection *</Label>
              <Textarea
                id='reason'
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder='Enter reason for rejection...'
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowRejectDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={isRejecting || !rejectReason.trim()}
              variant='destructive'
            >
              {isRejecting ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
