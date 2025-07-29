'use client';

import { useState } from 'react';
import { Row } from '@tanstack/react-table';
import { MoreHorizontal, Edit, Trash } from 'lucide-react';
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
import { useRouter } from 'next/navigation';
import { ProgramService } from '@/lib/services/organization/program-service';
import { toast } from 'react-hot-toast';
import { Program } from '@/types/organizations';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function DataTableRowActions<TData>({
  row,
  onEdit,
  onDelete
}: DataTableRowActionsProps<TData>) {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const program = row.original as Program;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await ProgramService.deleteProgram(program.id);
      toast.success('Program deleted successfully');
      router.refresh();
      if (onDelete) {
        onDelete(program.id);
      }
    } catch (error) {
      console.error('Error deleting program:', error);
      toast.error('Failed to delete program');
    } finally {
      setIsDeleting(false);
      setShowDeleteAlert(false);
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
          <DropdownMenuItem
            onClick={() =>
              router.push(`/organizations/programs/${program.id}/edit`)
            }
          >
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
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              program &quot;{program.program_name}&quot;.
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
