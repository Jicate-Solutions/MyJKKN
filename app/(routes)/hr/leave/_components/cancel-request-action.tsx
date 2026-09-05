'use client';

// Take back a request that has not been decided yet.
// Created 2026-08-21.
//
// Applies to all three Time Off surfaces — Leave, Short Time Off and
// Compensatory Off — which between them had no cancel control at all outside
// /hr/leave/[id], a page nothing linked to. The only way to undo a mistaken
// request was to ask an approver to REJECT it, which files a rejection against
// someone for their own typo.
//
// BEFORE A DECISION ONLY. The button is not rendered once a request is
// approved; an approved request is a commitment, not a draft. That is the
// policy, and it is also what the database enforces:
//
//   leave / short time off : LeaveService.withdrawApplication refuses any
//       status outside pending / escalated
//   compensatory off       : the hcoc_withdraw_own_pending policy's USING
//       clause pins the old status to 'pending'
//
// So hiding the button is a convenience. Neither surface depends on it.

import { useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getErrorMessage } from '@/lib/utils';

/** Statuses a request can still be taken back from. */
export function isCancellable(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'escalated';
}

export function CancelRequestAction({
  what,
  detail,
  onConfirm,
  disabled,
}: {
  /** 'this leave request', 'this permission', 'this comp off claim'. */
  what: string;
  /** The one line that identifies WHICH one, so the dialog is unambiguous. */
  detail: string;
  /** Return value ignored — callers pass mutateAsync, which resolves the row. */
  onConfirm: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled}
        onClick={() => { setError(null); setOpen(true); }}
      >
        <Undo2 className="mr-1 h-3.5 w-3.5" />
        Cancel
      </Button>

      <AlertDialog open={open} onOpenChange={(v) => { if (!v && !busy) setOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {what}?</AlertDialogTitle>
            <AlertDialogDescription>
              {detail}
              <span className="mt-2 block">
                It will be withdrawn and will no longer reach an approver. You can apply
                again if you need to.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              // Keep the dialog mounted while the mutation runs — the default
              // action closes it immediately and unmounts the pending state.
              onClick={(e) => { e.preventDefault(); void run(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
