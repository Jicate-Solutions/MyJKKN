'use client';

/**
 * Manual deduction override for one payslip.
 *
 * A FIELD LEFT BLANK KEEPS ITS AMOUNT (W12 review, 30 Sep 2026). Each box shows
 * the amount the slip already carries; only what is typed changes. The server
 * applies the same rule (PayslipGenerator.overrideDeductions →
 * resolveDeductionOverrides), so what this dialog previews is what is saved.
 * A slip made before deductions were saved one by one has nothing to keep, so
 * every box must then be filled in.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useOverridePayslipDeductions } from '@/hooks/hr/payroll/use-payroll-payslips';
import { toast } from 'sonner';

type DeductionKey = 'pf' | 'esi' | 'tds' | 'pt';

interface PayslipOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodId: string;
  slipId: string;
  staffName: string;
  currentGross: number;
  currentDeductions: number;
  /** The slip's saved amounts; null where the slip has none saved. */
  current?: Partial<Record<DeductionKey, number | null>>;
}

const FIELDS: { key: DeductionKey; label: string }[] = [
  { key: 'pf', label: 'PF (₹)' },
  { key: 'esi', label: 'ESI (₹)' },
  { key: 'tds', label: 'TDS (₹)' },
  { key: 'pt', label: 'Prof. Tax (₹)' },
];

export function PayslipOverrideDialog({
  open,
  onOpenChange,
  periodId,
  slipId,
  staffName,
  currentGross,
  currentDeductions,
  current = {},
}: PayslipOverrideDialogProps) {
  const [typed, setTyped] = useState<Record<DeductionKey, string>>({ pf: '', esi: '', tds: '', pt: '' });
  const [reason, setReason] = useState('');

  const override = useOverridePayslipDeductions();

  const saved = (k: DeductionKey): number | null => {
    const v = current[k];
    return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
  };

  // The amount each deduction will have: what was typed, else what is saved.
  const next = FIELDS.map(({ key }) => (typed[key].trim() === '' ? saved(key) : Number(typed[key])));
  const nothingToKeep = next.some((v) => v === null);
  const anyTyped = FIELDS.some(({ key }) => typed[key].trim() !== '');
  const newTotal = next.reduce<number>((t, v) => t + (v ?? 0), 0);
  const newNet = currentGross - newTotal;

  function handleSubmit() {
    if (!reason.trim()) {
      toast.error('Reason is required for manual override');
      return;
    }

    const value = (k: DeductionKey) => (typed[k].trim() === '' ? undefined : Number(typed[k]));
    override.mutate(
      {
        periodId,
        slipId,
        pf: value('pf'),
        esi: value('esi'),
        tds: value('tds'),
        pt: value('pt'),
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Deduction override applied');
          onOpenChange(false);
          setTyped({ pf: '', esi: '', tds: '', pt: '' });
          setReason('');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Override Deductions — {staffName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Pay</span>
              <span className="font-medium">₹{currentGross.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Current Deductions</span>
              <span>₹{currentDeductions.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Type only the amounts you want to change. A box left empty keeps the amount shown in it.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(({ key, label }) => {
              const s = saved(key);
              return (
                <div key={key}>
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    type="number"
                    min="0"
                    value={typed[key]}
                    onChange={(e) => setTyped((t) => ({ ...t, [key]: e.target.value }))}
                    placeholder={s === null ? 'Required' : `Keep ₹${s.toLocaleString('en-IN')}`}
                  />
                </div>
              );
            })}
          </div>

          {anyTyped && nothingToKeep && (
            <div className="rounded-md border border-amber-700/30 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100">
              This payslip was made before deductions were saved one by one, so there is nothing to
              keep. Fill in all four amounts.
            </div>
          )}

          {anyTyped && !nothingToKeep && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>New Total Deductions</span>
                <span>₹{newTotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>New Net Pay</span>
                <span
                  className={
                    newNet < 0
                      ? 'font-bold text-red-700 dark:text-red-400'
                      : 'font-bold text-green-700 dark:text-green-400'
                  }
                >
                  ₹{newNet.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="reason">Reason for Override *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Employee submitted investment declaration under 80C"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={override.isPending || !reason.trim()}>
              {override.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Override
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
