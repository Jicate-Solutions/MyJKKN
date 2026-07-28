'use client';

/**
 * Receipt detail dialog + PDF download for the learner "My Bills" page.
 *
 * The PDF reuses lib/utils/billing/receipt-pdf.ts — the same generator every
 * admin download surface routes through — so a learner-downloaded receipt is
 * pixel-identical to the official one. jsPDF is pulled in via dynamic import
 * only when a download is actually requested.
 */

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import type { MyReceipt } from '@/types/billing';
import type { BillingReceipt } from '@/types/billing-schedule';
import { fmtDate, inr } from './shared';

export interface ReceiptPdfContext {
  learnerName: string;
  rollNumber: string;
  collegeEmail: string;
  institutionName: string;
}

/** Shape a MyReceipt into the BillingReceipt the shared PDF generator expects. */
function buildReceiptForPdf(receipt: MyReceipt, ctx: ReceiptPdfContext): BillingReceipt {
  const [firstName, ...restName] = (ctx.learnerName || '').split(' ');
  return {
    id: receipt.id,
    receipt_number: receipt.receiptNumber,
    receipt_date: receipt.receiptDate ?? receipt.paidDate ?? '',
    student_id: '',
    institution_id: '',
    payment_mode: (receipt.mode ?? 'cash') as BillingReceipt['payment_mode'],
    payment_reference_number: receipt.reference ?? undefined,
    payment_amount: receipt.amount,
    payment_paid_date: receipt.paidDate ?? '',
    payer_name: receipt.payerName || ctx.learnerName,
    created_at: '',
    updated_at: '',
    payment_remarks: receipt.remarks ?? undefined,
    student: {
      id: '',
      first_name: firstName ?? '',
      last_name: restName.join(' '),
      roll_number: ctx.rollNumber || undefined,
      college_email: ctx.collegeEmail,
    },
    institution: { id: '', name: ctx.institutionName, counselling_code: '' },
    receipt_items: receipt.items.map((item, i) => ({
      id: `${receipt.id}-item-${i}`,
      receipt_id: receipt.id,
      bill_id: item.billId,
      amount_paid: item.amountPaid,
      created_at: '',
      bill: {
        bill_description: item.billDescription,
        due_date: item.billDueDate ?? undefined,
        final_amount: item.billAmount ?? undefined,
      },
    })) as BillingReceipt['receipt_items'],
    refunds: receipt.refunds.map((refund, i) => ({
      id: `${receipt.id}-refund-${i}`,
      receipt_id: receipt.id,
      refund_category: (refund.category ?? 'other') as never,
      refund_amount: refund.amount,
      refund_date: refund.date ?? '',
      refund_method: (refund.method ?? 'cash') as never,
      refund_reason: '',
      processing_fee: 0,
      net_refund_amount: refund.amount,
      approval_status: 'processed' as never,
      created_at: '',
      updated_at: '',
    })) as BillingReceipt['refunds'],
  } as BillingReceipt;
}

export async function downloadMyReceiptPdf(receipt: MyReceipt, ctx: ReceiptPdfContext) {
  const { downloadReceiptPdf } = await import('@/lib/utils/billing/receipt-pdf');
  downloadReceiptPdf(buildReceiptForPdf(receipt, ctx));
}

interface ReceiptDialogProps {
  receipt: MyReceipt | null;
  ctx: ReceiptPdfContext;
  onClose: () => void;
}

export function ReceiptDialog({ receipt, ctx, onClose }: ReceiptDialogProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!receipt) return;
    setDownloading(true);
    try {
      await downloadMyReceiptPdf(receipt, ctx);
    } finally {
      setDownloading(false);
    }
  };

  const netAmount = receipt ? receipt.amount - receipt.refundedAmount : 0;

  return (
    <Dialog open={Boolean(receipt)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-lg'>
        {receipt && (
          <>
            <DialogHeader>
              <DialogTitle className='flex flex-wrap items-center gap-2'>
                Receipt #{receipt.receiptNumber || '—'}
                {receipt.refundedAmount > 0 && (
                  <Badge variant='destructive' className='font-normal'>Refunded</Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {ctx.institutionName || 'Payment receipt'}
              </DialogDescription>
            </DialogHeader>

            <div className='grid grid-cols-2 gap-x-4 gap-y-3 text-sm'>
              <ReceiptField label='Payment date' value={fmtDate(receipt.paidDate)} />
              <ReceiptField label='Receipt date' value={fmtDate(receiptDateOr(receipt))} />
              <ReceiptField label='Payment mode' value={humanize(receipt.mode)} />
              <ReceiptField label='Reference no.' value={receipt.reference || '—'} />
              <ReceiptField label='Paid by' value={receipt.payerName || ctx.learnerName || '—'} />
              <ReceiptField label='Academic year' value={receipt.academicYear} />
            </div>

            {receipt.items.length > 0 && (
              <div className='space-y-2'>
                <Separator />
                <div className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                  Paid towards
                </div>
                <ul className='space-y-1.5'>
                  {receipt.items.map((item) => (
                    <li key={item.billId} className='flex items-baseline justify-between gap-3 text-sm'>
                      <div className='min-w-0'>
                        <div className='truncate'>{item.billDescription}</div>
                        {item.billDueDate && (
                          <div className='text-xs text-muted-foreground'>Due {fmtDate(item.billDueDate)}</div>
                        )}
                      </div>
                      <span className='shrink-0 font-medium tabular-nums'>{inr(item.amountPaid)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Separator />
            <div className='space-y-1.5 text-sm'>
              <div className='flex items-baseline justify-between'>
                <span className='text-muted-foreground'>Amount paid</span>
                <span className='font-semibold tabular-nums'>{inr(receipt.amount)}</span>
              </div>
              {receipt.refundedAmount > 0 && (
                <>
                  <div className='flex items-baseline justify-between text-destructive'>
                    <span>Refunded</span>
                    <span className='tabular-nums'>- {inr(receipt.refundedAmount)}</span>
                  </div>
                  <div className='flex items-baseline justify-between font-semibold'>
                    <span>Net amount</span>
                    <span className='tabular-nums'>{inr(netAmount)}</span>
                  </div>
                </>
              )}
            </div>

            {receipt.remarks && (
              <p className='rounded-md bg-muted/60 p-3 text-xs text-muted-foreground'>{receipt.remarks}</p>
            )}

            <DialogFooter>
              <Button onClick={handleDownload} disabled={downloading} className='w-full sm:w-auto'>
                {downloading ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <Download className='mr-2 h-4 w-4' />
                )}
                Download PDF
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const receiptDateOr = (r: MyReceipt) => r.receiptDate ?? r.paidDate;

const humanize = (value: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—';

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div className='space-y-0.5'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='font-medium break-words'>{value}</div>
    </div>
  );
}
