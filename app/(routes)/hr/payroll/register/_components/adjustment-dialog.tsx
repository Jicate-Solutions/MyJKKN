'use client';

/**
 * Record a one-off correction against one register row.
 *
 * WHY THIS EXISTS. In the register HR keeps by hand, 4 of 13 rows had a Net Pay
 * that did not equal Earnings minus Deductions — a prior month's over-payment
 * being recovered, explained only by a note in the last column. Without a place
 * to put that, the exported file would either be wrong or would have to be
 * hand-edited after every export.
 *
 * SIGN CONVENTION: the amount is SUBTRACTED. A positive figure recovers money,
 * a negative one pays extra. Stated in the form, because getting it backwards
 * moves real money the wrong way.
 *
 * The dialog uses a flex shell with its own scroll area: DialogContent in this
 * repo sets no max-height, so a tall body pushes the submit button off-screen
 * with no way to scroll to it.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { HRSalaryRegisterLine } from '@/types/hr-payroll';

interface AdjustmentDialogProps {
  line: HRSalaryRegisterLine | null;
  open: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { lineId: string; adjustmentAmount: number; remarks: string | null }) => void;
}

const money = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function AdjustmentDialog({
  line,
  open,
  isSaving,
  onOpenChange,
  onSave,
}: AdjustmentDialogProps) {
  if (!line) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Keyed on the row, so opening the dialog on a different person REMOUNTS
          the form and its state seeds from the new props. The alternative —
          re-seeding from an effect — is a cascading render, and eslint's
          react-hooks/set-state-in-effect rejects it outright. */}
      <AdjustmentForm
        key={line.id}
        line={line}
        isSaving={isSaving}
        onCancel={() => onOpenChange(false)}
        onSave={onSave}
      />
    </Dialog>
  );
}

interface AdjustmentFormProps {
  line: HRSalaryRegisterLine;
  isSaving: boolean;
  onCancel: () => void;
  onSave: AdjustmentDialogProps['onSave'];
}

function AdjustmentForm({ line, isSaving, onCancel, onSave }: AdjustmentFormProps) {
  const [amount, setAmount] = useState(
    line.adjustment_amount ? String(line.adjustment_amount) : '',
  );
  const [remarks, setRemarks] = useState(line.remarks ?? '');

  const parsed = amount.trim() === '' ? 0 : Number(amount);
  const isValid = Number.isFinite(parsed);
  const projectedNet = isValid
    ? Math.round(line.total_earnings - line.total_deductions - parsed)
    : line.net_pay;

  return (
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate">{line.staff_name}</DialogTitle>
          <DialogDescription>
            {line.employee_code ? `${line.employee_code} · ` : ''}
            Adjust net pay and record why.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Total earnings</div>
              <div className="font-medium">₹{money(line.total_earnings)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total deductions</div>
              <div className="font-medium">₹{money(line.total_deductions)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjustment">Adjustment (₹)</Label>
            <Input
              id="adjustment"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              Subtracted from net pay. Enter <strong>682</strong> to recover one day paid in
              error last month; enter a negative figure to pay extra.
            </p>
            {!isValid && (
              <p className="text-xs text-destructive">That is not a number.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">Remark</Label>
            <Textarea
              id="remarks"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. May month comp-off issue — one day salary deducted"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              Prints in the register&apos;s last column. This is the only explanation anyone
              reading the exported file will have.
            </p>
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">Net pay after this adjustment</div>
            <div className="text-xl font-semibold">₹{money(projectedNet)}</div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            disabled={!isValid || isSaving}
            onClick={() =>
              onSave({
                lineId: line.id,
                adjustmentAmount: parsed,
                remarks: remarks.trim() ? remarks.trim() : null,
              })
            }
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save adjustment'
            )}
          </Button>
        </div>
    </DialogContent>
  );
}
