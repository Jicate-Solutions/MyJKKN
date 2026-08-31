'use client';

// payment-dialogs.tsx — the last two steps: confirm, then receipt.
//
// The confirmation restates the payment in full because it is the last point
// where a wrong learner or a wrong amount can be caught for free. After it, a
// receipt exists and correcting it means a cancellation trail.

import { useState } from 'react';
import { CheckCircle2, Printer, Download, Plus, Loader2, Copy, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { SchoolLearnerForPayment, SchoolOutstandingBill } from '@/types/school-fees';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const money = (n: number) => `₹${inr.format(Number(n) || 0)}`;

export function ConfirmPaymentDialog({
  open,
  onOpenChange,
  learner,
  bills,
  amounts,
  total,
  modeLabel,
  referenceNumber,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learner: SchoolLearnerForPayment | null;
  bills: SchoolOutstandingBill[];
  amounts: Record<string, number>;
  total: number;
  modeLabel: string;
  referenceNumber?: string | null;
  submitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Confirm payment</DialogTitle>
          <DialogDescription>
            Check the learner and the amounts. A receipt is created immediately on confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Student</div>
            <div className="font-medium">
              {learner ? `${learner.first_name} ${learner.last_name}`.trim() : '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              Roll {learner?.roll_number || '—'} • Reg {learner?.register_number || '—'}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Selected bills</div>
            <ul className="space-y-1 max-h-40 overflow-y-auto rounded-md border p-2">
              {bills.map((bill) => (
                <li key={bill.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {bill.category_name || 'Fee'}
                    {bill.term_number ? ` — Term ${bill.term_number}` : ''}
                  </span>
                  <span className="tabular-nums shrink-0">{money(amounts[bill.id] ?? 0)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between border-t pt-2">
            <span className="font-medium">Total</span>
            <span className="text-lg font-bold tabular-nums">{money(total)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* outline, not secondary — see the note in the success dialog. */}
            <Badge variant="outline">{modeLabel}</Badge>
            {referenceNumber ? (
              <span className="text-xs text-muted-foreground">Ref: {referenceNumber}</span>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          {/* Disabled while submitting — the guard against a double-click
              creating two receipts for the same money. */}
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Recording…
              </>
            ) : (
              'Confirm Payment'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentSuccessDialog({
  open,
  onOpenChange,
  receiptNumber,
  amount,
  modeLabel,
  learnerName,
  isReprint,
  generatingPdf,
  onPrint,
  onDownload,
  onNewPayment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptNumber: string;
  amount: number;
  modeLabel: string;
  learnerName?: string;
  /** Re-issuing an existing receipt, not confirming a fresh payment. */
  isReprint: boolean;
  generatingPdf: boolean;
  onPrint: () => void;
  onDownload: () => void;
  onNewPayment: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyReceiptNumber = async () => {
    try {
      await navigator.clipboard.writeText(receiptNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is permission-gated and blocked outside a secure context.
      // The number is on screen to read off; failing silently beats a toast
      // for something this incidental.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            {isReprint ? (
              <Printer className="h-5 w-5 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
            <DialogTitle>{isReprint ? 'Reprint receipt' : 'Payment successful'}</DialogTitle>
          </div>
          <DialogDescription>
            {isReprint
              ? 'Re-issuing an existing receipt. No new payment is created.'
              : 'The receipt has been issued and the bills updated.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Hero. The amount is what the clerk reads back to the payer, so it
              gets the visual weight instead of sitting in a row of equals. */}
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {isReprint ? 'Receipt total' : 'Amount paid'}
            </div>
            <div className="text-3xl font-bold tabular-nums leading-tight">{money(amount)}</div>
            {learnerName ? (
              <div className="mt-0.5 text-sm text-muted-foreground truncate">{learnerName}</div>
            ) : null}
          </div>

          <div className="rounded-lg border divide-y text-sm">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="shrink-0 text-muted-foreground">Receipt No</span>
              {/* min-w-0 + truncate on the number, shrink-0 on the icon: without
                  them a long receipt number pushed the copy icon past the
                  panel's right edge and it clipped against the border. */}
              <button
                type="button"
                onClick={copyReceiptNumber}
                title="Copy receipt number"
                className="flex min-w-0 items-center gap-1.5 font-mono font-semibold hover:text-primary"
              >
                <span className="truncate">{receiptNumber}</span>
                {copied ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0 opacity-50" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="shrink-0 text-muted-foreground">Payment mode</span>
              {/* Plain text, not a Badge: this theme's `secondary` is amber, so
                  a neutral fact like "Cash" was rendering as a warning. It also
                  now matches the Receipt No row above it. */}
              <span className="font-medium">{modeLabel}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {isReprint ? (
              <>Stamped <strong>DUPLICATE</strong>. </>
            ) : (
              <>The PDF has downloaded automatically. </>
            )}
            One A4 sheet, two A5 copies — student on top, institution below, cut line between.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onPrint}
            disabled={generatingPdf}
            className="w-full sm:w-auto"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button
            variant="outline"
            onClick={onDownload}
            disabled={generatingPdf}
            className="w-full sm:w-auto"
          >
            {generatingPdf ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {isReprint ? 'Download' : 'Download again'}
          </Button>
          <Button onClick={onNewPayment} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            {isReprint ? 'Done' : 'New Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
