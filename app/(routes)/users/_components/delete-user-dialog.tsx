'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Profile } from '@/types/auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DeleteUserDialogProps {
  user: Profile;
  onConfirm: (user: Profile) => Promise<void>;
  trigger?: React.ReactNode;
  disabled?: boolean;
}

export function DeleteUserDialog({
  user,
  onConfirm,
  trigger,
  disabled = false
}: DeleteUserDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onConfirm(user);
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsDeleting(false);
    }
  };

  const defaultTrigger = (
    <Button
      variant='ghost'
      size='sm'
      disabled={disabled}
      className={
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'text-destructive hover:text-destructive hover:bg-destructive/10'
      }
    >
      <Trash2 className='mr-2 h-4 w-4' />
      Delete User
    </Button>
  );

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger || defaultTrigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className='flex items-center gap-2'>
            <AlertTriangle className='h-5 w-5 text-destructive' />
            <AlertDialogTitle>Delete User Account</AlertDialogTitle>
          </div>
        </AlertDialogHeader>

        <div className='space-y-4'>
          <div className='text-sm text-muted-foreground'>
            Are you sure you want to delete{' '}
            <strong>{user.full_name || user.email}</strong>?
          </div>

          <div className='bg-muted p-3 rounded-md space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>Email:</span>
              <span className='text-sm'>{user.email}</span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>Role:</span>
              <Badge variant='secondary' className='text-xs'>
                {user.role}
              </Badge>
            </div>
            {user.phone_number && (
              <div className='flex items-center justify-between'>
                <span className='text-sm font-medium'>Phone:</span>
                <span className='text-sm'>{user.phone_number}</span>
              </div>
            )}
          </div>

          <div className='bg-destructive/10 border border-destructive/20 p-3 rounded-md'>
            <div className='text-sm text-destructive font-medium'>
              ⚠️ This action cannot be undone
            </div>
            <div className='text-xs text-destructive/80 mt-1'>
              This will permanently delete the user account, profile data, and
              authentication credentials.
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            {isDeleting ? (
              <>
                <div className='mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className='mr-2 h-4 w-4' />
                Delete User
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
