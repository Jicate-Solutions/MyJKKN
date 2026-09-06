'use client';

/**
 * PeriodBackdateModal — Director-only modal to flip is_backdated=true + record reason.
 *
 * Per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md E9 + Q5/Q8:
 *   - Reason (textarea) required, min 10 chars.
 *   - Confirm button is amber (matches backdate badge palette).
 *   - Calls useBackdatePayrollPeriod which wraps fn_backdate_payroll_period RPC.
 *   - RPC enforces Director-only — modal trigger is also role-gated upstream
 *     in PeriodActionButtons, but RPC is the authoritative gate.
 *   - Backdating does NOT change status — flag-only flow (Decision #20).
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
import { useBackdatePayrollPeriod } from '@/hooks/hr/payroll/use-payroll-periods';
import type { HRPayrollPeriod } from '@/types/hr-payroll';

export function PeriodBackdateModal({
  open,
  onOpenChange,
  period,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  period: HRPayrollPeriod;
}) {
  const [reason, setReason] = useState(period.backdate_reason ?? '');
  const backdate = useBackdatePayrollPeriod();

  const tooShort = reason.trim().length < 10;

  const handleSubmit = async () => {
    if (tooShort) return;
    try {
      await backdate.mutateAsync({ periodId: period.id, reason: reason.trim() });
      onOpenChange(false);
    } catch {
      // surfaced via backdate.error below
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {period.is_backdated ? 'Update backdate reason' : 'Backdate this period?'}
          </DialogTitle>
          <DialogDescription>
            Marking this period as backdated will flag it for downstream watermarks
            (PDF + Form 16). The status flow continues normally — backdating does not
            change the approval chain. Please provide a reason (auditable).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="backdate-reason">Reason (required, min 10 characters)</Label>
          <Textarea
            id="backdate-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Period reopened to correct PF arrears identified during Q4 audit."
            rows={4}
          />
        </div>

        {backdate.error && (
          <p className="text-sm text-red-700">{backdate.error.message}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={backdate.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={tooShort || backdate.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {backdate.isPending ? 'Saving…' : 'Confirm backdate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
