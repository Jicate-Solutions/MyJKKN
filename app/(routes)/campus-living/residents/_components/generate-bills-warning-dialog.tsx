'use client';

// Confirmation gate before committing hostel-year bill generation. Summarizes
// how many learners already have some of these bills (those will be skipped) and
// how many brand-new bills the commit will create, derived from the dry-run
// plans for the previewed learners.

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
import { Loader2 } from 'lucide-react';
import type { LearnerGenerationPlan } from '@/lib/services/campus-living/hostel-bill-generation-service';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: LearnerGenerationPlan[];
  onConfirm: () => void;
  pending: boolean;
}

export function GenerateBillsWarningDialog({
  open,
  onOpenChange,
  plans,
  onConfirm,
  pending,
}: Props) {
  const studentsWithExisting = plans.filter((p) => p.skipped.length > 0).length;
  const totalSkipped = plans.reduce((sum, p) => sum + p.skipped.length, 0);
  const totalNew = plans.reduce((sum, p) => sum + p.new_count, 0);

  return (
    <AlertDialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate hostel bills?</AlertDialogTitle>
          <AlertDialogDescription>
            {studentsWithExisting > 0 ? (
              <>
                <strong>{studentsWithExisting}</strong> student
                {studentsWithExisting === 1 ? '' : 's'} already{' '}
                {studentsWithExisting === 1 ? 'has' : 'have'}{' '}
                <strong>{totalSkipped}</strong> of these bills (will be skipped).{' '}
              </>
            ) : null}
            <strong>{totalNew}</strong> new bill
            {totalNew === 1 ? '' : 's'} will be created.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Keep the dialog open until the mutation resolves so the caller
              // controls closing (after the re-preview runs).
              e.preventDefault();
              onConfirm();
            }}
            disabled={pending || totalNew === 0}
          >
            {pending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Confirm generate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
