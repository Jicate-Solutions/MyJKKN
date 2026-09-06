'use client';

/**
 * Budget Change Dialog — record a budget change (CR) against a budget line.
 *
 * Captures: old amount (pre-filled from line's planned), new amount, reason.
 * approval_status defaults to 'pending' (as per DB default).
 * requested_by is null — no current-staff helper on client path; see PR note.
 *
 * Pattern: components/projects/risks/risk-form-dialog.tsx
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F6.
 */

import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useRecordBudgetChange } from '@/hooks/projects/use-budget';
import type { ProjectBudget } from '@/types/projects';

function fmtINR(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface BudgetChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  line: ProjectBudget;
}

export function BudgetChangeDialog({
  open,
  onOpenChange,
  projectId,
  line,
}: BudgetChangeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record budget change</DialogTitle>
          <DialogDescription>
            Log a change request (CR) for this budget line. The change will be
            marked <Badge variant="secondary">pending</Badge> until approved.
          </DialogDescription>
        </DialogHeader>
        <BudgetChangeForm
          key={line.id}
          projectId={projectId}
          line={line}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Inner form ──────────────────────────────────────────────────────────────────

interface FormProps {
  projectId: string;
  line: ProjectBudget;
  onSuccess: () => void;
  onCancel: () => void;
}

function BudgetChangeForm({ projectId, line, onSuccess, onCancel }: FormProps) {
  const recordChange = useRecordBudgetChange();

  const [newAmount, setNewAmount] = useState(String(line.planned_amount_inr ?? ''));
  const [reason, setReason] = useState('');

  const oldAmount = line.planned_amount_inr;
  const parsedNew = parseFloat(newAmount.replace(/,/g, ''));
  const delta = !isNaN(parsedNew) ? parsedNew - oldAmount : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newAmount.trim()) {
      toast.error('New amount is required.');
      return;
    }
    if (!reason.trim()) {
      toast.error('A reason is required for the change request.');
      return;
    }
    if (!isNaN(parsedNew) && parsedNew === oldAmount) {
      toast.error('New amount is the same as the current planned amount.');
      return;
    }

    try {
      await recordChange.mutateAsync({
        project_id: projectId,
        budget_id: line.id,
        old_amount_inr: oldAmount,
        new_amount_inr: isNaN(parsedNew) ? null : parsedNew,
        reason: reason.trim(),
        approval_status: 'pending',
        requested_by: null, // TODO: wire once current-staff helper is available
      });
      toast.success('Budget change recorded (pending approval).');
      onSuccess();
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to record change.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Reference — display old amount */}
      <div className="rounded-md bg-muted px-4 py-3 text-sm">
        <p className="text-muted-foreground">Current planned amount</p>
        <p className="mt-0.5 font-semibold">{fmtINR(oldAmount)}</p>
      </div>

      {/* New amount */}
      <div className="space-y-1.5">
        <Label htmlFor="change-new-amount">
          New amount (INR) <span className="text-destructive">*</span>
        </Label>
        <Input
          id="change-new-amount"
          type="number"
          min="0"
          step="0.01"
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
          placeholder="0"
          required
        />
        {delta !== null && (
          <p
            className={`text-xs font-medium ${
              delta < 0 ? 'text-emerald-600' : 'text-destructive'
            }`}
          >
            {delta >= 0 ? '+' : ''}
            {fmtINR(delta)} from current plan
          </p>
        )}
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <Label htmlFor="change-reason">
          Reason <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="change-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this change needed?"
          required
        />
      </div>

      <p className="text-xs text-muted-foreground">
        This will be saved as <strong>pending</strong>. Approval workflow is
        managed separately.
      </p>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={recordChange.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={recordChange.isPending} className="gap-1.5">
          {recordChange.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Record change
        </Button>
      </DialogFooter>
    </form>
  );
}
