'use client';

/**
 * PeriodLockModal — Director/Admin terminal lock for a distributed period.
 *
 * Per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md Q5:
 *   - Visible only when status='distributed' AND user is Director/admin.
 *   - Calls useAdvancePayrollPeriod (RPC fn_advance_payroll_period; when
 *     status='distributed' it advances to 'locked').
 *   - Reason is OPTIONAL (unlike reject/backdate which require it).
 *   - Locked is TERMINAL — no further actions possible.
 */

import { useState } from 'react';
import { Lock } from 'lucide-react';

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
import { useAdvancePayrollPeriod } from '@/hooks/hr/payroll/use-payroll-periods';
import type { HRPayrollPeriod } from '@/types/hr-payroll';

export function PeriodLockModal({
  open,
  onOpenChange,
  period,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  period: HRPayrollPeriod;
}) {
  const [comment, setComment] = useState('');
  const advance = useAdvancePayrollPeriod();

  const handleSubmit = async () => {
    try {
      await advance.mutateAsync({
        periodId: period.id,
        comment: comment.trim() || undefined,
      });
      setComment('');
      onOpenChange(false);
    } catch {
      // surfaced via advance.error below
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Lock this period?
          </DialogTitle>
          <DialogDescription>
            Locking marks the period as <strong>terminal</strong> — no further
            edits, no further rejections, no further backdating. This is the final
            audit state once payslips are distributed and the books close for the
            month. Use this when the period is reconciled and ready for archival.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="lock-comment">Note (optional)</Label>
          <Textarea
            id="lock-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. Form 16 reconciled, books closed."
            rows={3}
          />
        </div>

        {advance.error && (
          <p className="text-sm text-red-700">{advance.error.message}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={advance.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={advance.isPending}
            className="bg-stone-700 hover:bg-stone-800 text-white"
          >
            {advance.isPending ? 'Locking…' : 'Lock period'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
