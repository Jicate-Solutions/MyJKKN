'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { MoreHorizontal, Pencil, Trash2, Eye } from 'lucide-react';
import { useLeaveTypes } from '@/hooks/academic/use-leave-types';
import { LeaveTypeFormDialog } from './leave-type-form-dialog';
import { toast } from 'react-hot-toast';
import type { LeaveType } from '@/types/leaves';

interface LeaveTypeRowActionsProps {
  leaveType: LeaveType;
}

export function LeaveTypeRowActions({ leaveType }: LeaveTypeRowActionsProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { deleteLeaveType } = useLeaveTypes();

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteLeaveType(leaveType.id);
      toast.success('Leave type deleted successfully');
      setShowDeleteDialog(false);
    } catch (error) {
      toast.error('Failed to delete leave type');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon' className='h-8 w-8'>
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => setShowViewDialog(true)}>
            <Eye className='h-4 w-4 mr-2' />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            <Pencil className='h-4 w-4 mr-2' />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className='text-destructive focus:text-destructive'
          >
            <Trash2 className='h-4 w-4 mr-2' />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View Dialog */}
      <AlertDialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className='flex items-center gap-2'>
              <span
                className='w-4 h-4 rounded-full'
                style={{ backgroundColor: leaveType.color_code }}
              />
              {leaveType.leave_type_name}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='space-y-3 text-left'>
                <div className='grid grid-cols-2 gap-2 text-sm'>
                  <div className='text-muted-foreground'>Code:</div>
                  <div className='font-mono'>{leaveType.leave_type_code}</div>

                  <div className='text-muted-foreground'>Color:</div>
                  <div className='flex items-center gap-2'>
                    <span
                      className='w-4 h-4 rounded border'
                      style={{ backgroundColor: leaveType.color_code }}
                    />
                    <span className='font-mono text-xs'>{leaveType.color_code}</span>
                  </div>

                  <div className='text-muted-foreground'>Requires Approval:</div>
                  <div>{leaveType.requires_approval ? 'Yes' : 'No'}</div>

                  <div className='text-muted-foreground'>Status:</div>
                  <div>{leaveType.is_active ? 'Active' : 'Inactive'}</div>
                </div>

                {leaveType.description && (
                  <div className='pt-2 border-t'>
                    <div className='text-muted-foreground text-sm mb-1'>Description:</div>
                    <p className='text-sm'>{leaveType.description}</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowViewDialog(false);
              setShowEditDialog(true);
            }}>
              Edit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <LeaveTypeFormDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        mode='edit'
        leaveType={leaveType}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leave Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{leaveType.leave_type_name}&quot;?
              This action cannot be undone. Existing leaves using this type will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
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
    </>
  );
}
