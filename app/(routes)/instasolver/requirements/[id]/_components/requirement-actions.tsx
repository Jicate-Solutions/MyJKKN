'use client';

// The actions on a requirement. Which buttons show follows the same rules as
// the database guard (lib/instasolver/constants.ts REQUIREMENT_TRANSITIONS);
// the guard still refuses anything illegal and its sentence is toasted.

import { useState } from 'react';
import { CheckCircle2, PackageCheck, Pencil, Undo2, XCircle } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { REQUIREMENT_TRANSITIONS } from '@/lib/instasolver/constants';
import { InstaSolverRequirementService } from '@/lib/services/instasolver/requirement-service';
import type { CreateRequirementDto, Requirement } from '@/types/instasolver';
import { RequirementForm } from '../../_components/requirement-form';

type Panel = 'approve' | 'reject' | 'fulfil' | 'edit' | 'withdraw' | null;

export function RequirementActions({
  requirement,
  isManager,
  isRequester
}: {
  requirement: Requirement;
  isManager: boolean;
  isRequester: boolean;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const next = REQUIREMENT_TRANSITIONS[requirement.status];
  const ref = requirement.reference_no;
  const close = () => {
    setPanel(null);
    setNote('');
    setReason('');
    setReasonError('');
  };

  const approve = useInstaSolverMutation(
    () => InstaSolverRequirementService.approve(requirement.id, note),
    `${ref} approved`
  );
  const reject = useInstaSolverMutation(
    () => InstaSolverRequirementService.reject(requirement.id, reason),
    `${ref} rejected`
  );
  const fulfil = useInstaSolverMutation(() => InstaSolverRequirementService.fulfil(requirement.id), `${ref} marked as fulfilled`);
  const withdraw = useInstaSolverMutation(() => InstaSolverRequirementService.withdraw(requirement.id), `${ref} withdrawn`);
  const edit = useInstaSolverMutation(
    (dto: CreateRequirementDto) => InstaSolverRequirementService.update(requirement.id, dto),
    `${ref} updated`
  );

  const canReview = isManager && next.includes('approved');
  const canFulfil = isManager && next.includes('fulfilled');
  const canEdit = isRequester && requirement.status === 'pending';
  const canWithdraw = isRequester && next.includes('withdrawn');

  if (!canReview && !canFulfil && !canEdit && !canWithdraw) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canReview && (
          <>
            <Button onClick={() => setPanel('approve')}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
            </Button>
            <Button variant="outline" className="text-destructive" onClick={() => setPanel('reject')}>
              <XCircle className="mr-1.5 h-4 w-4" /> Reject
            </Button>
          </>
        )}
        {canFulfil && (
          <Button onClick={() => setPanel('fulfil')}>
            <PackageCheck className="mr-1.5 h-4 w-4" /> Mark fulfilled
          </Button>
        )}
        {canEdit && (
          <Button variant="outline" onClick={() => setPanel('edit')}>
            <Pencil className="mr-1.5 h-4 w-4" /> Edit
          </Button>
        )}
        {canWithdraw && (
          <Button variant="outline" onClick={() => setPanel('withdraw')}>
            <Undo2 className="mr-1.5 h-4 w-4" /> Withdraw
          </Button>
        )}
      </div>

      {/* Approve, with an optional note */}
      <Dialog open={panel === 'approve'} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve {ref}</DialogTitle>
            <DialogDescription>{requirement.item_requested}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="approve-note">Note for the requester (optional)</Label>
            <Textarea
              id="approve-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example, to be ordered this week"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={approve.isPending}>
              Cancel
            </Button>
            <Button onClick={() => approve.mutate(undefined, { onSuccess: close })} disabled={approve.isPending}>
              {approve.isPending ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject, reason required */}
      <Dialog open={panel === 'reject'} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {ref}</DialogTitle>
            <DialogDescription>The requester reads this reason, so give them something to act on.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">
              Reason for rejection <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              rows={4}
              maxLength={2000}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError('');
              }}
              aria-invalid={!!reasonError}
            />
            {reasonError && (
              <p className="text-sm text-destructive" role="alert">
                {reasonError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={reject.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reject.isPending}
              onClick={() => {
                if (!reason.trim()) {
                  setReasonError('A reason is required to reject a requirement');
                  return;
                }
                reject.mutate(undefined, { onSuccess: close });
              }}
            >
              {reject.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark fulfilled */}
      <AlertDialog open={panel === 'fulfil'} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {ref} as fulfilled?</AlertDialogTitle>
            <AlertDialogDescription>
              This records that the item has been delivered. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => fulfil.mutate(undefined, { onSuccess: close })}>
              Mark fulfilled
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Withdraw */}
      <AlertDialog open={panel === 'withdraw'} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw {ref}?</AlertDialogTitle>
            <AlertDialogDescription>
              The CAO will no longer see this as waiting for review. A withdrawn request cannot be reopened; you would
              raise a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => withdraw.mutate(undefined, { onSuccess: close })}>Withdraw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit (requester, while pending) */}
      <Dialog open={panel === 'edit'} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit {ref}</DialogTitle>
            <DialogDescription>You can change this until the CAO reviews it.</DialogDescription>
          </DialogHeader>
          <RequirementForm
            initial={requirement}
            submitLabel="Save changes"
            submitting={edit.isPending}
            onSubmit={(dto) => edit.mutate(dto, { onSuccess: close })}
            onCancel={close}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
