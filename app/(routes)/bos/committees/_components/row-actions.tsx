'use client';

import { useState } from 'react';
import type { Row } from '@tanstack/react-table';
import { MoreHorizontal, Edit, Trash } from 'lucide-react';
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
import { BosCommittee } from '@/types/bos';
import { useDeleteBosCommittee } from '@/hooks/bos/use-bos-committees';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

interface DataTableRowActionsProps {
  row: Row<BosCommittee>;
  /** Opens the shared edit dialog in committee-data-table.tsx. */
  onEdit: (committee: BosCommittee) => void;
  /** Bumps the table's refetch key after a successful delete. */
  onChanged: () => void;
}

export function DataTableRowActions({ row, onEdit, onChanged }: DataTableRowActionsProps) {
  const committee = row.original;
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  const deleteCommittee = useDeleteBosCommittee();

  // Same key the RLS policies use for writes — see 20260610 migration.
  const canManage = isSuperAdmin || canAccess('academic.bos-compositions', 'edit');

  const handleDelete = async () => {
    try {
      await deleteCommittee.mutateAsync(committee.id);
      toast.success('Committee deleted');
      onChanged();
    } catch (error) {
      logger.error('academic/bos', 'Failed to delete committee', error);
      toast.error((error as Error).message || 'Failed to delete committee');
    } finally {
      setShowDeleteAlert(false);
    }
  };

  if (!canManage) return null;

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
          <DropdownMenuItem onClick={() => onEdit(committee)}>
            <Edit className='mr-2 h-4 w-4' />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteAlert(true)}
            className='text-destructive'
          >
            <Trash className='mr-2 h-4 w-4' />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete committee?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{committee.name}</strong>. Committees
              that still have members cannot be deleted — mark them inactive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteCommittee.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteCommittee.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
