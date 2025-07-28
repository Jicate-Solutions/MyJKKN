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
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Institution } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { usePermissions } from '@/hooks/use-permissions';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const institution = row.original as Institution;
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const canView =
    isSuperAdmin || canAccess('organizations.institutions', 'view');
  const canEdit =
    isSuperAdmin || canAccess('organizations.institutions', 'edit');
  const canDelete =
    isSuperAdmin || canAccess('organizations.institutions', 'delete');

  const { mutate: deleteInstitution, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      await OrganizationService.deleteInstitution(institution.id);
    },
    onSuccess: () => {
      toast.success('Institution deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['institutions'] });
      setShowDeleteDialog(false);
    },
    onError: (error) => {
      toast.error('Failed to delete institution', {
        description:
          error instanceof Error ? error.message : 'Please try again.'
      });
    }
  });

  const handleDelete = () => {
    if (canDelete && !isDeleting) {
      deleteInstitution();
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
          {canView && (
            <DropdownMenuItem
              onSelect={() =>
                router.push(`/organizations/institutions/${institution.id}`)
              }
            >
              View Details
            </DropdownMenuItem>
          )}

          {canEdit && (
            <DropdownMenuItem
              onSelect={() =>
                router.push(
                  `/organizations/institutions/${institution.id}/edit`
                )
              }
            >
              Edit
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {canDelete && (
            <DropdownMenuItem
              onSelect={() => setShowDeleteDialog(true)}
              className='text-red-600'
            >
              Delete
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              institution &quot;{institution.name}&quot; and remove all
              associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className='bg-red-600 hover:bg-red-700'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
