'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Undo, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { toast } from 'react-hot-toast';
import {
  useRefundCapabilities, useEligibleRefundBills, useInitiateRefund
} from '@/hooks/billing/use-refund-workflow';
import { RefundAttachmentsField } from '@/components/billing/refund-attachments-field';
import type { RefundAttachment, RefundType } from '@/types/billing-refund-workflow';

interface Props {
  studentId: string;
  institutionId: string;
  institutionName: string;
  studentName: string;
}

export function RefundInitiateDialog({ studentId, institutionId, institutionName, studentName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [refundType, setRefundType] = useState<RefundType>('adjustment');
  const [selected, setSelected] = useState<Record<string, number>>({}); // bill_id -> amount
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<RefundAttachment[]>([]);

  const { data: caps } = useRefundCapabilities(institutionId);
  const { data: bills = [], isLoading } = useEligibleRefundBills(open ? studentId : undefined);
  const initiate = useInitiateRefund();

  const total = useMemo(
    () => Object.values(selected).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0),
    [selected]
  );

  if (!caps?.configured || !caps.can_initiate) return null;

  const toggleBill = (billId: string, refundable: number, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[billId] = refundable; else delete next[billId];
      return next;
    });
  };

  const handleSubmit = async () => {
    const lines = Object.entries(selected).map(([bill_id, refund_amount]) => ({ bill_id, refund_amount }));
    if (lines.length === 0) return toast.error('Select at least one bill');
    for (const l of lines) {
      const b = bills.find((x) => x.bill_id === l.bill_id);
      if (!b || l.refund_amount <= 0 || l.refund_amount > b.refundable) {
        return toast.error('Refund amount exceeds refundable for a selected bill');
      }
    }
    if (!notes.trim()) return toast.error('Notes are required');
    const requestId = await initiate.mutateAsync({
      student_id: studentId, refund_type: refundType, bills: lines, notes, attachments
    });
    setOpen(false);
    router.push(`/billing/refunds/${requestId}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'><Undo className='h-4 w-4 mr-2' />Initiate Refund</Button>
      </DialogTrigger>
      <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Initiate Refund — {studentName}</DialogTitle>
          <DialogDescription>Select paid bills and amounts. The request enters the approval workflow.</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label>Refund Type *</Label>
            <RadioGroup value={refundType} onValueChange={(v) => setRefundType(v as RefundType)} className='flex flex-wrap gap-x-6 gap-y-2'>
              <label className='flex items-center gap-2 text-sm'><RadioGroupItem value='adjustment' />Adjustment (overpayment/correction)</label>
              <label className='flex items-center gap-2 text-sm'><RadioGroupItem value='withdrawal' />Withdrawal (student leaving)</label>
            </RadioGroup>
            {refundType === 'withdrawal' && (
              <div className='flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 rounded-md text-sm text-orange-700 dark:text-orange-300'>
                <AlertTriangle className='h-4 w-4 mt-0.5 shrink-0' />
                The learner will be marked <b>Withdrawal Pending</b> immediately and the seat is released.
                If the request is declined, their previous status is restored.
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <Label>Paid Bills *</Label>
            {isLoading ? <p className='text-sm text-muted-foreground'>Loading bills…</p> :
             bills.length === 0 ? <p className='text-sm text-muted-foreground'>No refundable bills.</p> : (
              <div className='rounded-md border divide-y'>
                {bills.map((b) => (
                  <div key={b.bill_id} className='flex items-center gap-3 p-3'>
                    <Checkbox checked={b.bill_id in selected}
                      onCheckedChange={(c) => toggleBill(b.bill_id, b.refundable, c === true)} />
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium truncate'>{b.bill_description || 'Bill'}</p>
                      <p className='text-xs text-muted-foreground'>
                        Paid ₹{b.paid_amount.toLocaleString('en-IN')} · Refundable ₹{b.refundable.toLocaleString('en-IN')}
                        {b.held_amount > 0 && ` · ₹${b.held_amount.toLocaleString('en-IN')} held in another request`}
                      </p>
                    </div>
                    {b.bill_id in selected && (
                      <Input type='number' className='w-32' min={1} max={b.refundable}
                        value={selected[b.bill_id]}
                        onChange={(e) => setSelected((p) => ({ ...p, [b.bill_id]: parseFloat(e.target.value) || 0 }))} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <Label>Notes *</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder='Reason and context for this refund request' />
          </div>

          <div className='space-y-2'>
            <Label>Supporting Documents</Label>
            <RefundAttachmentsField value={attachments} onChange={setAttachments}
              institutionName={institutionName} requestRef={`draft-${studentId}`} />
          </div>

          <div className='flex flex-wrap items-center justify-between gap-3 pt-2 border-t'>
            <p className='text-sm font-semibold'>Total refund: ₹{total.toLocaleString('en-IN')}</p>
            <div className='flex gap-2'>
              <Button variant='outline' onClick={() => setOpen(false)} disabled={initiate.isPending}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={initiate.isPending || total <= 0}>
                {initiate.isPending ? 'Submitting…' : 'Submit Request'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
