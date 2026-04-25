'use client';

import { useRemoveLearnerFromHostel } from '@/hooks/campus-living/use-learner-hostelites';
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
import type { LearnerHostelite } from '@/types/campus-living';
import { Loader2 } from 'lucide-react';

interface Props {
  learner: LearnerHostelite | null;
  onClose: () => void;
}

export function RemoveHosteliteDialog({ learner, onClose }: Props) {
  const removeMut = useRemoveLearnerFromHostel();
  const open = !!learner;

  const name = learner
    ? [learner.first_name, learner.last_name].filter(Boolean).join(' ') || '(unnamed)'
    : '';

  async function handleConfirm() {
    if (!learner) return;
    try {
      await removeMut.mutateAsync(learner.id);
      onClose();
    } catch {
      // Toast is surfaced by the hook; keep dialog open so user can retry.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {name} from hostel?</AlertDialogTitle>
          <AlertDialogDescription>
            This reclassifies the learner as <strong>Day Scholar</strong>. Use this when a
            learner was wrongly flagged as a hostelite during admission. The change only
            affects the admission record; any active bed allocation must be vacated separately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMut.isPending}>Keep as hostelite</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={removeMut.isPending}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            {removeMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Remove from hostel
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
