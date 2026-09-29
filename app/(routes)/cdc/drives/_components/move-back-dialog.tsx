'use client';

/**
 * MoveBackButton — steps a drive back exactly one stage (2026-09-22).
 *
 * Nothing recorded in the later stage is deleted; the stage is simply open
 * for corrections again. A reason is mandatory and lands in the status
 * history with the actor and time. The server decides who may do it: CDC
 * editors for any stage, an assigned coordinator only within the drive-day
 * stages (see canCoordinatorRollback).
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTransitionCdcDriveWithNotify } from '@/hooks/cdc/use-cdc-drives';
import type { CdcDriveStatus } from '@/types/cdc';
import { CDC_DRIVE_STATUS_LABELS, previousDriveStatus } from '@/types/cdc';

const KEEPS: Partial<Record<CdcDriveStatus, string>> = {
  draft: 'The drive goes back to Draft. Its details and audience stay as they are.',
  announced: 'The willingness window closes for learners. Every response already given is kept.',
  willingness_open: 'Learners can respond again until the window closes. The finalized participant list is kept and can be re-finalized.',
  eligibility_locked: 'The drive is no longer "in progress". Attendance marks already recorded are kept and can be corrected.',
  attendance_day: 'Learners stop seeing their result until selection is finalized again. Decisions and uploaded letters are kept.',
  results_announced: 'The drive reopens at Selection Finalized. Nothing is deleted.',
};

export function MoveBackButton({
  driveId,
  status,
  className,
  variant = 'outline',
  size = 'sm',
}: {
  driveId: string;
  status: CdcDriveStatus;
  className?: string;
  variant?: 'outline' | 'ghost' | 'secondary';
  size?: 'sm' | 'default';
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const transition = useTransitionCdcDriveWithNotify();
  const target = previousDriveStatus(status);
  if (!target) return null;

  async function confirm() {
    if (!target) return;
    setError(null);
    try {
      await transition.mutateAsync({ driveId, payload: { to_status: target, reason: reason.trim() } });
      toast.success(`Drive moved back to ${CDC_DRIVE_STATUS_LABELS[target]}`);
      setOpen(false);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move the drive back');
    }
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Undo2 className="h-4 w-4 mr-2" /> Move back to {CDC_DRIVE_STATUS_LABELS[target]}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !transition.isPending) { setOpen(false); setError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move back to {CDC_DRIVE_STATUS_LABELS[target]}?</DialogTitle>
            <DialogDescription>
              From <strong>{CDC_DRIVE_STATUS_LABELS[status]}</strong> to <strong>{CDC_DRIVE_STATUS_LABELS[target]}</strong>. {KEEPS[target]}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="move-back-reason">Reason (required)</Label>
            <Textarea
              id="move-back-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this drive going back a stage? Saved in the status history."
              autoFocus
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={transition.isPending}>Cancel</Button>
            <Button onClick={confirm} disabled={transition.isPending || !reason.trim()}>
              {transition.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
              Move back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
