'use client';

import { useState } from 'react';
import { Ban, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BillCancelAttachmentsField } from './bill-cancel-attachments-field';
import {
  BILL_CANCEL_REASON_CODES,
  BILL_CANCEL_REASON_LABELS,
} from '@/types/billing-bill-cancellation';
import type {
  BillCancelReasonCode,
  BillCancellationAttachment,
} from '@/types/billing-bill-cancellation';

export interface BillCancelTarget {
  id: string;
  bill_description?: string | null;
  final_amount?: number | null;
  status?: string | null;
  student_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One bill, or several for the bulk case — they share one reason + document set. */
  bills: BillCancelTarget[];
  institutionName: string;
  isPending: boolean;
  onConfirm: (payload: {
    reasonCode: BillCancelReasonCode;
    reason: string;
    attachments: BillCancellationAttachment[];
  }) => void;
}

const MIN_REASON_LENGTH = 5;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * The single cancellation dialog, shared by the learner page and the schedule
 * list so the two cannot capture different things.
 *
 * The submit button stays disabled until BOTH a reason of real length and at
 * least one document are present. That mirrors fn_cancel_student_bill, which
 * refuses either way — the disabled button is the courtesy, the RPC is the rule.
 */
export function BillCancelDialog({
  open,
  onOpenChange,
  bills,
  institutionName,
  isPending,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent in this repo carries no max-height or overflow of its own,
          so a tall modal puts the submit button off-screen with no way to
          scroll to it. The flex shell keeps the header and the footer fixed and
          scrolls only the middle. */}
      <DialogContent className='max-w-lg max-h-[85vh] flex flex-col gap-0 p-0'>
        {/* The form is a child so it MOUNTS with the dialog: Radix unmounts
            DialogContent on close, which resets the reason and — more
            importantly — the attachment list, with no effect to do it. State
            hoisted up here would survive the close and let one cancellation
            inherit the previous one's documents. */}
        <BillCancelForm
          bills={bills}
          institutionName={institutionName}
          isPending={isPending}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

function BillCancelForm({
  bills,
  institutionName,
  isPending,
  onCancel,
  onConfirm,
}: Omit<Props, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const [reasonCode, setReasonCode] = useState<BillCancelReasonCode>('duplicate_bill');
  const [reason, setReason] = useState('');
  const [attachments, setAttachments] = useState<BillCancellationAttachment[]>([]);

  const total = bills.reduce((sum, b) => sum + (Number(b.final_amount) || 0), 0);
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;
  const docsOk = attachments.length > 0;
  const canSubmit = reasonOk && docsOk && !isPending && bills.length > 0;

  return (
    <>
      <DialogHeader className='p-6 pb-4 shrink-0'>
        <DialogTitle className='flex items-center gap-2'>
          <Ban className='h-5 w-5 text-amber-600' />
          {bills.length > 1 ? `Cancel ${bills.length} Bills` : 'Cancel Bill'}
        </DialogTitle>
        <DialogDescription>
          The amount stops counting toward what the learner owes. The bill is kept
          for audit, along with the reason and documents you record here.
        </DialogDescription>
      </DialogHeader>

      <div className='flex-1 overflow-y-auto px-6 space-y-4'>
        <div className='rounded-md border bg-muted/40 p-3 space-y-1'>
          {bills.slice(0, 4).map((b) => (
            <div key={b.id} className='flex items-start justify-between gap-3 text-sm'>
              <span className='truncate'>{b.bill_description || 'Student bill'}</span>
              <span className='font-medium shrink-0'>
                {formatCurrency(Number(b.final_amount) || 0)}
              </span>
            </div>
          ))}
          {bills.length > 4 && (
            <p className='text-xs text-muted-foreground'>
              …and {bills.length - 4} more
            </p>
          )}
          <div className='flex items-center justify-between pt-2 mt-1 border-t text-sm font-semibold'>
            <span>Amount cancelled</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        <div className='flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'>
          <AlertTriangle className='h-4 w-4 mt-0.5 shrink-0' />
          <span>
            A bill with money receipted against it cannot be cancelled — cancel the
            receipt first, then cancel the bill.
          </span>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='bill-cancel-reason-code'>Reason *</Label>
          <Select
            value={reasonCode}
            onValueChange={(v) => setReasonCode(v as BillCancelReasonCode)}
          >
            <SelectTrigger id='bill-cancel-reason-code'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILL_CANCEL_REASON_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {BILL_CANCEL_REASON_LABELS[code]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='bill-cancel-notes'>Notes *</Label>
          <Textarea
            id='bill-cancel-notes'
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder='What happened, and on whose authority the bill is being cancelled'
          />
          {!reasonOk && reason.length > 0 && (
            <p className='text-xs text-muted-foreground'>
              At least {MIN_REASON_LENGTH} characters.
            </p>
          )}
        </div>

        <div className='space-y-2 pb-2'>
          <Label>Supporting documents *</Label>
          <BillCancelAttachmentsField
            value={attachments}
            onChange={setAttachments}
            institutionName={institutionName}
            billRef={bills.length === 1 ? bills[0].id : `bulk-${bills.length}`}
            disabled={isPending}
          />
          {!docsOk && (
            <p className='text-xs text-muted-foreground'>
              At least one document is required before a bill can be cancelled.
            </p>
          )}
        </div>
      </div>

      <div className='flex justify-end gap-2 border-t p-6 pt-4 shrink-0'>
        <Button variant='outline' onClick={onCancel} disabled={isPending}>
          Keep Bill
        </Button>
        <Button
          className='bg-amber-600 hover:bg-amber-700 text-white'
          disabled={!canSubmit}
          onClick={() => onConfirm({ reasonCode, reason: reason.trim(), attachments })}
        >
          {isPending ? 'Cancelling…' : bills.length > 1 ? 'Cancel Bills' : 'Cancel Bill'}
        </Button>
      </div>
    </>
  );
}
