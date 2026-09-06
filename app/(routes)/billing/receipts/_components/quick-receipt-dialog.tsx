'use client';

import { ReceiptIndianRupee } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ReceiptEntryForm } from './receipt-entry-form';

interface QuickReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bills this receipt settles. */
  billIds: string[];
  studentId?: string | null;
  /** Shown in the header so the operator can see who they are collecting from. */
  studentName?: string;
  /** Second header line — roll number, programme, whatever the host has. */
  subtitle?: string;
  /** Fired after the receipt is persisted, so the host can refresh its lists. */
  onGenerated: () => void;
}

/**
 * Collect a payment WITHOUT leaving the page.
 *
 * The Generate Receipt action used to do `window.location.href = '/billing/
 * receipts/new?...'` — a full document navigation, which tore down whichever
 * popup the operator was working in and lost the search results behind it. At a
 * fee counter that costs a re-search per learner. Hosting the same
 * ReceiptEntryForm in a Dialog keeps the whole search → bill → collect loop on
 * one screen.
 *
 * The form is keyed on the bill ids so that opening the dialog for a different
 * selection remounts it with clean state, rather than syncing props into state
 * through an effect.
 */
export function QuickReceiptDialog({
  open,
  onOpenChange,
  billIds,
  studentId,
  studentName,
  subtitle,
  onGenerated
}: QuickReceiptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wide on purpose: the bill allocation table is six columns and the
          form below it is a two-column grid, so a narrow modal forces the
          clerk to scroll between the amount they are allocating and the
          total they are typing. w-[96vw] keeps it usable on a laptop while
          max-w-6xl stops it sprawling on a wide monitor. Matches
          QuickBillDialog so swapping between the two does not resize the
          modal under the operator's eyes. */}
      <DialogContent className='flex max-h-[95vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0'>
        {/* pr-12 clears DialogContent's built-in close button at right-4 top-4. */}
        <DialogHeader className='space-y-1 border-b px-6 py-4 pr-12 text-left'>
          <DialogTitle className='flex items-center gap-2 text-lg'>
            <ReceiptIndianRupee className='h-5 w-5 shrink-0 text-muted-foreground' />
            <span>Collect Payment{studentName ? ` — ${studentName}` : ''}</span>
          </DialogTitle>
          <DialogDescription className='text-xs'>
            {subtitle ||
              'Enter what was received; the amount splits across the selected bills.'}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4'>
          {/* Mounted only while open so each visit starts from a clean form. */}
          {open && (
            <ReceiptEntryForm
              key={billIds.join(',')}
              billIds={billIds}
              studentId={studentId}
              variant='dialog'
              onCancel={() => onOpenChange(false)}
              onSuccess={() => {
                onOpenChange(false);
                onGenerated();
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
