'use client';

import { useState } from 'react';
import type { Row } from '@tanstack/react-table';
import { MoreHorizontal, Edit, Trash } from 'lucide-react';
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
import { BosExternalExpert } from '@/types/bos';
import { useDeleteBosExpert } from '@/hooks/bos/use-bos-experts';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({ row }: DataTableRowActionsProps<TData>) {
  const expert = row.original as BosExternalExpert;
  const router = useRouter();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  const deleteExpert = useDeleteBosExpert();

  const canEdit = isSuperAdmin || canAccess('academic.bos-experts', 'edit');
  const canDelete = isSuperAdmin || canAccess('academic.bos-experts', 'delete');

  const handleDelete = async () => {
    try {
      await deleteExpert.mutateAsync(expert.id);
      toast.success('Expert removed from directory');
      router.refresh();
    } catch (error) {
      logger.error('academic/bos', 'Failed to delete expert', error);
      toast.error('Failed to remove expert');
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
        <DropdownMenuContent align='end' className='w-[160px]'>
          {canEdit && (
            <DropdownMenuItem
              onClick={() => router.push(`/bos/experts/${expert.id}/edit`)}
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
            <AlertDialogTitle>Remove Expert?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <strong>
                {expert.title ? `${expert.title} ` : ''}
                {expert.name}
              </strong>{' '}
              from the External Expert Directory. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteExpert.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteExpert.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
