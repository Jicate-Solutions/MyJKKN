'use client';

/**
 * PeriodRejectModal — confirms rejection of a period to the prior stage.
 *
 * Per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md E8:
 *   - Reason (textarea) required, min 10 chars.
 *   - Confirm button is destructive (red).
 *   - Calls useRejectPayrollPeriod which wraps fn_reject_payroll_period RPC.
 *   - RPC reverts status one stage back; we just communicate that to user.
 */

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRejectPayrollPeriod } from '@/hooks/hr/payroll/use-payroll-periods';
import type { HRPayrollPeriod, PayrollPeriodStatus } from '@/types/hr-payroll';

const PRIOR_STAGE_LABEL: Record<PayrollPeriodStatus, string> = {
  draft: '—',
  prepared: 'draft',
  cao_reviewed: 'prepared',
  accounts_verified: 'CAO-reviewed',
  chairperson_approved: 'Accounts-verified',
  distributed: 'Chairperson-approved',
  locked: '—',
};

export function PeriodRejectModal({
  open,
  onOpenChange,
  period,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  period: HRPayrollPeriod;
}) {
  const [comment, setComment] = useState('');
  const reject = useRejectPayrollPeriod();

  const priorLabel = PRIOR_STAGE_LABEL[period.status];
  const tooShort = comment.trim().length < 10;

  const handleSubmit = async () => {
    if (tooShort) return;
    try {
      await reject.mutateAsync({ periodId: period.id, comment: comment.trim() });
      setComment('');
      onOpenChange(false);
    } catch {
      // surfaced via reject.error below
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject period back to {priorLabel}?</DialogTitle>
          <DialogDescription>
            This will revert the period to <strong>{priorLabel}</strong> status and
            clear the current stage's timestamp. The audit trail will permanently
            record this rejection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reject-reason">Reason (required, min 10 characters)</Label>
          <Textarea
            id="reject-reason"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. PF deduction rate looks wrong for engine_type=non_teaching; please recheck row 47."
            rows={4}
          />
        </div>

        {reject.error && (
          <p className="text-sm text-red-700">{reject.error.message}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reject.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={tooShort || reject.isPending}
          >
            {reject.isPending ? 'Rejecting…' : 'Reject period'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
