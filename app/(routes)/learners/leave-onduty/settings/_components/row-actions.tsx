'use client';

// Row actions for the learner leave types table: Edit + Delete.
// Delete errors surface via toast — the service already maps FK violations
// ("used by applications or gate passes") to a "deactivate it instead" message.

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
import { useDeleteLearnerLeaveType } from '@/hooks/learners/use-learner-leave-types';
import { LeaveTypeFormDialog } from './leave-type-form-dialog';
import type { LearnerLeaveType } from '@/types/learner-leave-types';

export function LeaveTypeRowActions({ leaveType }: { leaveType: LearnerLeaveType }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const deleteType = useDeleteLearnerLeaveType();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowEdit(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDelete(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LeaveTypeFormDialog open={showEdit} onOpenChange={setShowEdit} mode="edit" leaveType={leaveType} />

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{leaveType.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the leave type. If it is already used by applications or gate
              passes, deletion will fail — deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={() => deleteType.mutate(leaveType.id, { onSuccess: () => setShowDelete(false) })}
              disabled={deleteType.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
