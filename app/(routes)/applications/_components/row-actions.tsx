'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Eye } from 'lucide-react';

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
import { Application } from '@/types/applications';
import { ApplicationService } from '@/lib/services/application/application-service';
import { usePermissions } from '@/hooks/use-permissions';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const application = row.original as Application;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  // Permission checks
  const canViewApplication =
    isSuperAdmin || canAccess('applications', 'view');
  const canEditApplication =
    isSuperAdmin || canAccess('applications', 'edit');
  const canDeleteApplication =
    isSuperAdmin || canAccess('applications', 'delete');

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await ApplicationService.deleteApplication(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Application deleted successfully');
      setShowDeleteAlert(false);
    },
    onError: (error) => {
      console.error('Delete application error:', error);
      toast.error('Failed to delete application');
    }
  });

  const handleView = () => {
    router.push(`/applications/${application.id}`);
  };

  const handleEdit = () => {
    router.push(`/applications/${application.id}/edit`);
  };

  const handleDelete = () => {
    deleteMutation.mutate(application.id);
  };

  // If user has no permissions, don't show any actions
  if (!canViewApplication && !canEditApplication && !canDeleteApplication) {
    return null;
  }

  return (
    <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
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
          {canViewApplication && (
            <DropdownMenuItem onClick={handleView}>
              <Eye className='mr-2 h-4 w-4' />
              View
            </DropdownMenuItem>
          )}
          {canEditApplication && (
            <DropdownMenuItem onClick={handleEdit}>
              Edit
              <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {canDeleteApplication && (
            <>
              <DropdownMenuSeparator />
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  className='text-red-600 focus:text-red-600'
                  onSelect={(e) => e.preventDefault()}
                >
                  Delete
                  <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the application &quot;{application.name}
            &quot;. This action cannot be undone and will remove all associated data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className='bg-red-600 hover:bg-red-700'
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
