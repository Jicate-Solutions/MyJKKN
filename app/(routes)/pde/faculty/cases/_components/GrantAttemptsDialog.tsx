'use client';

// GrantAttemptsDialog — faculty grants N additional attempts to a specific learner
// with mandatory reason. Calls POST /api/pde/cases/[id]/grant-attempts.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useGrantAttempts } from '@/hooks/pde/use-faculty-cases';

interface Props {
  open: boolean;
  onClose: () => void;
  caseId: string;
  caseTitle: string;
  learnerId: string;
  learnerName: string;
  attemptsUsed: number;
  hardCap?: number; // typically 5 lifetime per spec
}

export function GrantAttemptsDialog({
  open,
  onClose,
  caseId,
  caseTitle,
  learnerId,
  learnerName,
  attemptsUsed,
  hardCap = 5,
}: Props) {
  const [attempts, setAttempts] = useState(1);
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const grant = useGrantAttempts();

  const reset = () => {
    setAttempts(1);
    setReason('');
    setSubmitError(null);
  };

  const handleClose = () => {
    if (grant.isPending) return;
    reset();
    onClose();
  };

  const submit = async () => {
    setSubmitError(null);
    if (reason.trim().length < 5) {
      setSubmitError('Reason must be at least 5 characters.');
      return;
    }
    if (attempts < 1 || attempts > 10) {
      setSubmitError('Grant between 1 and 10 attempts.');
      return;
    }
    try {
      await grant.mutateAsync({
        case_id: caseId,
        learner_id: learnerId,
        attempts_granted: attempts,
        reason: reason.trim(),
      });
      reset();
      onClose();
    } catch (e: any) {
      setSubmitError(e?.message || 'Failed to grant attempts.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Grant additional attempts</DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block">
              <strong>{learnerName}</strong> — {caseTitle}
            </span>
            <span className="block text-xs text-muted-foreground">
              Used {attemptsUsed} of {hardCap} lifetime attempts on this case.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="attempts" className="text-xs">
              Attempts to grant
            </Label>
            <Input
              id="attempts"
              type="number"
              min={1}
              max={10}
              value={attempts}
              onChange={(e) => setAttempts(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            />
          </div>

          <div>
            <Label htmlFor="reason" className="text-xs">
              Reason <span className="text-red-600">(required, audit logged)</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Student lost internet during attempt 3; granting 2 retries to reach completion."
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              The reason is permanent and visible to admins for compliance review.
            </p>
          </div>

          {submitError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={grant.isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={grant.isPending}
            className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
          >
            {grant.isPending ? 'Granting…' : `Grant ${attempts}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
