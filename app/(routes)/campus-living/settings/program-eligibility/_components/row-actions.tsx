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
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEligibility } from '@/hooks/campus-living/use-program-eligibility';
import { ProgramEligibilityFormDialog } from './form-dialog';
import { EligibilityDetailDialog } from './eligibility-detail-dialog';
import type { ProgramEligibilityRow } from '@/types/program-eligibility';

export function EligibilityRowActions({ row }: { row: ProgramEligibilityRow }) {
  const { deleteEligibility } = useEligibility(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onDelete = async () => {
    try {
      setDeleting(true);
      await deleteEligibility(row.id);
      toast.success('Eligibility removed');
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
          <DropdownMenuItem onClick={() => setDetailOpen(true)}>
            <Eye className='h-4 w-4 mr-2' /> View details
          </DropdownMenuItem>
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

      <EligibilityDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        row={row}
      />

      <ProgramEligibilityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        institutionId={row.institution_id}
        row={row}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove eligibility rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {row.program_name ?? 'institution default'} rule
              {row.quota_names.length ? ` (${row.quota_names.join(', ')})` : ''} for{' '}
              {row.room_category_name ?? row.mess_category_name ?? 'this band'}.
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
