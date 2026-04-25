'use client';

import { useState } from 'react';
import type { Row } from '@tanstack/react-table';
import { MoreHorizontal, Edit, Trash, Users } from 'lucide-react';
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

import { BosComposition } from '@/types/bos';
import { useDeleteBosComposition } from '@/hooks/bos/use-bos-compositions';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({ row }: DataTableRowActionsProps<TData>) {
  const composition = row.original as BosComposition;
  const router = useRouter();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  const deleteComposition = useDeleteBosComposition();

  const canEdit = isSuperAdmin || canAccess('academic.bos-compositions', 'edit');
  const canDelete = isSuperAdmin || canAccess('academic.bos-compositions', 'delete');

  const handleDelete = async () => {
    try {
      await deleteComposition.mutateAsync(composition.id);
      toast.success('Composition deleted');
      router.refresh();
    } catch (error) {
      logger.error('academic/bos', 'Failed to delete composition', error);
      toast.error('Failed to delete composition');
    } finally {
      setShowDeleteAlert(false);
    }
  };

  if (!canEdit && !canDelete) return null;

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
          <DropdownMenuItem
            onClick={() =>
              router.push(`/bos/compositions/${composition.id}`)
            }
          >
            <Users className='mr-2 h-4 w-4' />
            View Members
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem
              onClick={() =>
                router.push(`/bos/compositions/${composition.id}/edit`)
              }
            >
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </DropdownMenuItem>
          )}
          {canDelete && (
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
            <AlertDialogTitle>Delete Composition?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <strong>{composition.composition_title}</strong> and all its members.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteComposition.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteComposition.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
