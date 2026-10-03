'use client';

import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import type { TriagedIssue } from '@/types/instasolver';

/** Confirm reopening a disputed completed issue; the reason is optional. */
type ReopenDialogProps = {
  issue: Pick<TriagedIssue, 'id' | 'reference_no' | 'resolution_dispute_reason'> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Remounts per open / issue, so the reason starts empty each time. */
export function ReopenDialog(props: ReopenDialogProps) {
  return <ReopenDialogInner key={`${props.issue?.id ?? 'none'}-${props.open}`} {...props} />;
}

function ReopenDialogInner({ issue, open, onOpenChange }: ReopenDialogProps) {
  const [reason, setReason] = useState('');

  const reopen = useInstaSolverMutation(
    () => InstaSolverIssueService.reopen(issue!.id, reason),
    () => `${issue?.reference_no} reopened and back in progress`
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reopen {issue?.reference_no}?</AlertDialogTitle>
          <AlertDialogDescription>
            The issue goes back to In progress with the same person or team, and the reporter is told.
            {issue?.resolution_dispute_reason ? ` The reporter said: “${issue.resolution_dispute_reason}”` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reopen-reason">Note for the team (optional)</Label>
          <Textarea
            id="reopen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="What should be checked again?"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button disabled={reopen.isPending} onClick={() => reopen.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            {reopen.isPending ? 'Reopening…' : 'Reopen'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
