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
import { BosMemberTypeRecord } from '@/types/bos';
import { useDeleteBosMemberType } from '@/hooks/bos/use-bos-member-types';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

interface DataTableRowActionsProps {
  row: Row<BosMemberTypeRecord>;
  /** Opens the shared edit dialog in member-type-data-table.tsx. */
  onEdit: (memberType: BosMemberTypeRecord) => void;
  /** Bumps the table's refetch key after a successful delete. */
  onChanged: () => void;
}

export function DataTableRowActions({ row, onEdit, onChanged }: DataTableRowActionsProps) {
  const memberType = row.original;
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  const deleteMemberType = useDeleteBosMemberType();

  // Same key the RLS policies use for writes — see 20260611 migration.
  const canManage = isSuperAdmin || canAccess('academic.bos-compositions', 'edit');

  const handleDelete = async () => {
    try {
      await deleteMemberType.mutateAsync(memberType.id);
      toast.success('Member type deleted');
      onChanged();
    } catch (error) {
      logger.error('academic/bos', 'Failed to delete member type', error);
      toast.error((error as Error).message || 'Failed to delete member type');
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
          <DropdownMenuItem onClick={() => onEdit(memberType)}>
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
            <AlertDialogTitle>Delete member type?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{memberType.name}</strong>. Member
              types still in use cannot be deleted — mark them inactive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMemberType.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteMemberType.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
