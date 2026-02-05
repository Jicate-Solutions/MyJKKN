'use client';

import { Row } from '@tanstack/react-table';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Edit, Trash2, Eye, Copy } from 'lucide-react';
import { revalidateTimetables } from '../_actions/revalidate-timetables';
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
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { Timetable } from '@/types/academics';
import { logger } from '@/lib/utils/enhanced-logger';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const timetable = row.original as Timetable;
  const router = useRouter();
  const { toast } = useToast();
  const { canAccess, isSuperAdmin } = usePermissions();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Permission checks
  const canEditTimetable =
    isSuperAdmin || canAccess('academic.timetables', 'edit');
  const canDeleteTimetable =
    isSuperAdmin || canAccess('academic.timetables', 'delete');

  // FIX: 2026-02-03 - Validate timetable ID before navigation
  // TanStack Table can create temporary row IDs with pattern %%drp:id:xxxxx%%
  // These are NOT valid UUIDs and will cause database errors if used in navigation
  const isValidId = (id: string | undefined): boolean => {
    if (!id) return false;
    // Check for temporary placeholder pattern
    if (id.includes('%%drp:id:')) return false;
    // Check for valid UUID format (basic check)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(id);
  };

  const handleView = () => {
    if (!isValidId(timetable.id)) {
      logger.error('academic/timetables', 'Invalid timetable ID for view', { id: timetable.id });
      toast({
        title: 'Error',
        description: 'Invalid timetable ID. Please refresh the page and try again.',
        variant: 'destructive'
      });
      return;
    }
    window.location.href = `/academic/timetables/${timetable.id}`;
  };

  const handleEdit = () => {
    if (!isValidId(timetable.id)) {
      logger.error('academic/timetables', 'Invalid timetable ID for edit', { id: timetable.id });
      toast({
        title: 'Error',
        description: 'Invalid timetable ID. Please refresh the page and try again.',
        variant: 'destructive'
      });
      return;
    }
    window.location.href = `/academic/timetables/${timetable.id}/edit`;
  };

  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    // FIX: 2026-02-03 - Validate ID before attempting delete
    if (!isValidId(timetable.id)) {
      logger.error('academic/timetables', 'Invalid timetable ID for delete', { id: timetable.id });
      toast({
        title: 'Error',
        description: 'Invalid timetable ID. Please refresh the page and try again.',
        variant: 'destructive'
      });
      setDeleteDialogOpen(false);
      return;
    }

    setIsDeleting(true);
    try {
      // Delete the timetable from database
      await TimetableService.deleteTimetable(timetable.id);

      // FIX: 2026-02-05 - Properly invalidate Next.js cache using server action
      // This ensures deleted timetables don't appear in the list anymore
      await revalidateTimetables();

      toast({
        title: 'Timetable deleted',
        description: `Timetable "${timetable.timetable_name}" has been deleted successfully.`
      });

      setDeleteDialogOpen(false);
      setIsDeleting(false);

      // Refresh the router to update the UI with fresh data
      router.refresh();
    } catch (error) {
      logger.error('academic/timetables', 'Error deleting timetable', error);

      // Check if it's an attendance-related error
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete timetable';
      const isAttendanceError = errorMessage.includes('attendance records');

      toast({
        title: isAttendanceError ? 'Cannot Delete Timetable' : 'Error',
        description: isAttendanceError
          ? 'This timetable has associated attendance records and cannot be deleted. You can still edit it if needed.'
          : 'Failed to delete timetable. Please try again.',
        variant: 'destructive'
      });

      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[160px]'>
          <DropdownMenuItem onClick={handleView}>
            <Eye className='mr-2 h-4 w-4' />
            View
          </DropdownMenuItem>

          {canEditTimetable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleEdit}>
                <Edit className='mr-2 h-4 w-4' />
                Edit
              </DropdownMenuItem>
            </>
          )}

          {canDeleteTimetable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className='text-destructive focus:text-destructive'
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              timetable &quot;{timetable.timetable_name}&quot; and all its
              associated data.
              <br /><br />
              <strong>Note:</strong> If this timetable has been used for attendance tracking, 
              the deletion will be prevented to preserve attendance records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
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
