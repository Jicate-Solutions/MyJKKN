'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useRoomEligibility,
  useMessEligibility,
} from '@/hooks/campus-living/use-program-eligibility';
import { ProgramEligibilityFormDialog } from './form-dialog';
import type {
  ProgramRoomEligibilityRow,
  ProgramMessEligibilityRow,
} from '@/types/program-eligibility';

export function RoomEligibilityRowActions({
  row,
}: {
  row: ProgramRoomEligibilityRow;
}) {
  const { deleteRoomEligibility } = useRoomEligibility(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onDelete = async () => {
    try {
      setDeleting(true);
      await deleteRoomEligibility(row.id);
      toast.success('Room eligibility removed');
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className='h-4 w-4 mr-2' /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className='text-destructive focus:text-destructive'
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className='h-4 w-4 mr-2' /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProgramEligibilityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        kind='room'
        institutionId={row.institution_id}
        roomRow={row}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove room eligibility?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the{' '}
              {row.program_name ?? 'institution default'} entry for{' '}
              {row.room_category_name ?? 'this category'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              disabled={deleting}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function MessEligibilityRowActions({
  row,
}: {
  row: ProgramMessEligibilityRow;
}) {
  const { deleteMessEligibility } = useMessEligibility(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onDelete = async () => {
    try {
      setDeleting(true);
      await deleteMessEligibility(row.id);
      toast.success('Mess eligibility removed');
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className='h-4 w-4 mr-2' /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className='text-destructive focus:text-destructive'
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className='h-4 w-4 mr-2' /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProgramEligibilityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        kind='mess'
        institutionId={row.institution_id}
        messRow={row}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove mess eligibility?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the{' '}
              {row.program_name ?? 'institution default'} entry for{' '}
              {row.mess_category_name ?? 'this category'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              disabled={deleting}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
