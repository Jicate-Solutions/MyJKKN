'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { AcademicYear } from '@/types/academics';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { usePermissions } from '@/hooks/use-permissions';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DataTableRowActions<TData>({
  row,
  onEdit,
  onDelete
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const academicYear = row.original as AcademicYear;
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const canEdit = isSuperAdmin || canAccess('academic.years', 'edit');
  const canDelete = isSuperAdmin || canAccess('academic.years', 'delete');

  const { mutate: deleteAcademicYear, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      await AcademicYearService.deleteAcademicYear(academicYear.id);
    },
    onSuccess: () => {
      toast.success('Academic year deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      setShowDeleteDialog(false);
    },
    onError: (error) => {
      toast.error('Failed to delete academic year', {
        description:
          error instanceof Error ? error.message : 'Please try again.'
      });
    }
  });

  const handleDelete = () => {
    if (canDelete && !isDeleting) {
      deleteAcademicYear();
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
            <DotsHorizontalIcon className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[160px]'>
          <DropdownMenuItem
            onSelect={() => router.push(`/academic/years/${academicYear.id}`)}
          >
            View Details
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!canEdit}
            onSelect={() =>
              router.push(`/academic/years/${academicYear.id}/edit`)
            }
          >
            Edit
            <DropdownMenuShortcut>⌘⏎</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canDelete}
            className='text-destructive focus:text-destructive'
            onSelect={() => setShowDeleteDialog(true)}
          >
            Delete
            <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              academic year &quot;{academicYear.academic_year_name}&quot; and
              all associated data.
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
    </>
  );
}
