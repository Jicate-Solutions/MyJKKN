'use client';

/**
 * ApprovalActionDialog — approve or reject the current step of a request.
 *
 * Shows the snapshot_chain, current step, status, and decision_notes textarea.
 * Calls useActOnRequest on confirm; advances current_step if approving a
 * multi-step chain (step < total steps - 1 → still pending; last step → approved).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F9.
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { useActOnRequest } from '@/hooks/projects/use-approvals';
import { statusBadgeClass, statusLabel } from './types';
import type { ProjectApprovalRequest } from '@/types/projects';
import type { ApprovalStep } from './types';

interface ApprovalActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ProjectApprovalRequest | null;
}

export function ApprovalActionDialog({
  open,
  onOpenChange,
  request,
}: ApprovalActionDialogProps) {
  const actOnRequest = useActOnRequest();
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) setNotes('');
  }, [open]);

  if (!request) return null;

  const chain: ApprovalStep[] = Array.isArray(request.snapshot_chain)
    ? (request.snapshot_chain as unknown as ApprovalStep[])
    : [];

  const totalSteps = chain.length;
  const currentStepIndex = request.current_step ?? 0;
  const currentStepLabel =
    chain[currentStepIndex]?.label ?? `Step ${currentStepIndex + 1}`;
  const isLastStep = totalSteps === 0 || currentStepIndex >= totalSteps - 1;

  const canAct = request.status === 'pending';

  async function handleAct(action: 'approved' | 'rejected') {
    if (!request) return;

    let nextStep: number | null = null;
    let newStatus: 'approved' | 'rejected' | 'pending' = action;

    if (action === 'approved' && !isLastStep) {
      // More steps remain — advance step but stay pending
      nextStep = currentStepIndex + 1;
      newStatus = 'pending';
    }

    try {
      await actOnRequest.mutateAsync({
        id: request.id,
        input: {
          status: newStatus,
          decision_notes: notes.trim() || null,
          next_step: nextStep,
        },
      });
      toast.success(
        action === 'approved'
          ? isLastStep
            ? 'Request approved.'
            : `Step approved — moved to step ${currentStepIndex + 2}.`
          : 'Request rejected.'
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  const isBusy = actOnRequest.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Act on approval request</DialogTitle>
          <DialogDescription>
            Trigger:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {request.trigger_action}
            </code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Status row */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">Status:</span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(request.status)}`}
            >
              {statusLabel(request.status)}
            </span>

            {request.is_emergency && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                Emergency
              </Badge>
            )}

            {request.escalation_status && request.escalation_status !== 'none' && (
              <Badge variant="outline" className="text-xs text-orange-600 border-orange-400">
                {request.escalation_status}
              </Badge>
            )}
          </div>

          {/* Chain progress */}
          {chain.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Approval chain
              </p>
              <div className="flex flex-col gap-1">
                {chain.map((step, i) => {
                  const isDone =
                    i < currentStepIndex ||
                    (i === currentStepIndex && request.status === 'approved');
                  const isCurrent = i === currentStepIndex && request.status === 'pending';
                  const isRejected =
                    i === currentStepIndex && request.status === 'rejected';

                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                        isCurrent
                          ? 'bg-yellow-50 border border-yellow-200'
                          : isDone
                          ? 'bg-green-50 text-green-800'
                          : isRejected
                          ? 'bg-red-50 text-red-800'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <span className="text-xs w-5 text-center font-mono">{i + 1}</span>
                      <span className="flex-1">{step.label}</span>
                      <code className="text-xs bg-background/60 rounded px-1">
                        {step.role}
                      </code>
                      {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                      {isRejected && <XCircle className="h-3.5 w-3.5 text-red-600" />}
                      {isCurrent && (
                        <span className="text-xs text-yellow-700 font-medium">
                          Awaiting
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current step indicator */}
          {canAct && (
            <p className="text-sm text-muted-foreground">
              Currently awaiting:{' '}
              <strong className="text-foreground">{currentStepLabel}</strong>
            </p>
          )}

          {/* Decision notes */}
          <div className="space-y-1.5">
            <Label htmlFor="decision-notes" className="text-sm">
              Decision notes{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="decision-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add context for your decision…"
              rows={3}
              disabled={isBusy || !canAct}
            />
          </div>

          {request.decision_notes && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Previous decision note
              </p>
              <p>{request.decision_notes}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            Close
          </Button>

          {canAct && (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleAct('rejected')}
                disabled={isBusy}
                className="gap-1.5"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </Button>
              <Button
                type="button"
                onClick={() => handleAct('approved')}
                disabled={isBusy}
                className="gap-1.5"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {isLastStep ? 'Approve' : `Approve & advance to step ${currentStepIndex + 2}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
