'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
import toast from 'react-hot-toast';
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
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import type { AdmissionYear } from '@/types/admission';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useAdmissionYearRefresh } from './admission-year-data-table';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const admissionYear = row.original as AdmissionYear;
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const refreshList = useAdmissionYearRefresh();

  const canEdit = isSuperAdmin || canAccess('admission.settings.years', 'edit');
  const canDelete =
    isSuperAdmin || canAccess('admission.settings.years', 'delete');

  const { mutate: deleteAdmissionYear, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      await AdmissionYearService.deleteAdmissionYear(admissionYear.id);
    },
    onSuccess: () => {
      toast.success('Admission year deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['admission-years'] });
      setShowDeleteDialog(false);
      refreshList();      // triggers DataTable.refetchKey bump → re-runs fetchDataFn
      router.refresh();   // re-renders server page (keeps counts/breadcrumbs fresh)
    },
    onError: (error) => {
      toast.error('Failed to delete admission year', { duration: 5000 });
      console.error('Failed to delete admission year', error);
    }
  });

  const handleDelete = () => {
    if (canDelete && !isDeleting) deleteAdmissionYear();
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
            onSelect={() =>
              router.push(`/admission/settings/years/${admissionYear.id}`)
            }
          >
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canEdit}
            onSelect={() =>
              router.push(`/admission/settings/years/${admissionYear.id}/edit`)
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
              admission year &quot;{admissionYear.admission_year_name}&quot;.
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
