'use client';

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

interface PayslipOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodId: string;
  slipId: string;
  staffName: string;
  currentGross: number;
  currentDeductions: number;
}

export function PayslipOverrideDialog({
  open,
  onOpenChange,
  periodId,
  slipId,
  staffName,
  currentGross,
  currentDeductions,
}: PayslipOverrideDialogProps) {
  const [pf, setPf] = useState('');
  const [esi, setEsi] = useState('');
  const [tds, setTds] = useState('');
  const [pt, setPt] = useState('');
  const [reason, setReason] = useState('');

  const override = useOverridePayslipDeductions();

  const totalOverride = (Number(pf) || 0) + (Number(esi) || 0) + (Number(tds) || 0) + (Number(pt) || 0);
  const newNet = currentGross - totalOverride;

  function handleSubmit() {
    if (!reason.trim()) {
      toast.error('Reason is required for manual override');
      return;
    }

    override.mutate(
      {
        periodId,
        slipId,
        pf: pf ? Number(pf) : undefined,
        esi: esi ? Number(esi) : undefined,
        tds: tds ? Number(tds) : undefined,
        pt: pt ? Number(pt) : undefined,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Deduction override applied');
          onOpenChange(false);
          setPf(''); setEsi(''); setTds(''); setPt(''); setReason('');
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pf">PF (₹)</Label>
              <Input id="pf" type="number" min="0" value={pf} onChange={(e) => setPf(e.target.value)} placeholder="Auto" />
            </div>
            <div>
              <Label htmlFor="esi">ESI (₹)</Label>
              <Input id="esi" type="number" min="0" value={esi} onChange={(e) => setEsi(e.target.value)} placeholder="Auto" />
            </div>
            <div>
              <Label htmlFor="tds">TDS (₹)</Label>
              <Input id="tds" type="number" min="0" value={tds} onChange={(e) => setTds(e.target.value)} placeholder="Auto" />
            </div>
            <div>
              <Label htmlFor="pt">Prof. Tax (₹)</Label>
              <Input id="pt" type="number" min="0" value={pt} onChange={(e) => setPt(e.target.value)} placeholder="Auto" />
            </div>
          </div>

          {totalOverride > 0 && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>New Total Deductions</span>
                <span>₹{totalOverride.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>New Net Pay</span>
                <span className="font-bold text-green-700 dark:text-green-400">
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
