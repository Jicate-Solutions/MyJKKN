'use client';

import { useState } from 'react';
import type { Row } from '@tanstack/react-table';
import { MoreHorizontal, Eye, Edit, Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

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

import { BosMeeting } from '@/types/bos';
import { useDeleteBosMeeting } from '@/hooks/bos/use-bos-meetings';
import { logger } from '@/lib/utils/enhanced-logger';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  canEdit: boolean;
  canDelete: boolean;
}

export function DataTableRowActions<TData>({
  row,
  canEdit,
  canDelete,
}: DataTableRowActionsProps<TData>) {
  const meeting = row.original as BosMeeting;
  const router = useRouter();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const deleteMeeting = useDeleteBosMeeting();

  const handleDelete = async () => {
    try {
      await deleteMeeting.mutateAsync(meeting.id);
      toast.success('Meeting deleted');
    } catch (error) {
      logger.error('academic/bos', 'Failed to delete meeting', error);
      toast.error((error as Error).message || 'Failed to delete meeting');
    } finally {
      setShowDeleteAlert(false);
    }
  };

  const isDraft = meeting.status === 'draft';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'>
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[180px]'>
          <DropdownMenuItem onClick={() => router.push(`/bos/meetings/${meeting.id}`)}>
            <Eye className='mr-2 h-4 w-4' />
            View Details
          </DropdownMenuItem>
          {canEdit && isDraft && (
            <DropdownMenuItem onClick={() => router.push(`/bos/meetings/${meeting.id}/edit`)}>
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </DropdownMenuItem>
          )}
          {canDelete && isDraft && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteAlert(true)}
                className='text-destructive'
              >
                <Trash className='mr-2 h-4 w-4' />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete Meeting #{meeting.meeting_number}/{meeting.academic_year}.
              Only draft meetings can be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMeeting.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteMeeting.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
