'use client';
/**
 * Receipt Actions Client Component
 *
 * Interactive action buttons for receipt operations (send, download, request
 * cancellation). Uses server actions with optimistic UI updates.
 *
 * 2026-08-25: the Delete button was REMOVED in favour of "Request
 * cancellation". Two reasons. It was gated only on `!isStudentView` and never
 * on billing.receipts.delete — a key no role holds — so for staff the RLS
 * DELETE matched zero rows, which Postgres does not treat as an error: the
 * action returned success and this page toasted "Receipt deleted successfully"
 * and navigated away while the receipt still existed. And for a super admin it
 * DID delete, destroying the audit trail that the cancellation workflow
 * (request → super-admin approval → bill reverted) exists to preserve.
 */


import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Download,
  Send,
  Edit,
  Ban,
  ArrowLeft,
  Printer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import { sendReceipt } from '../../../_actions/receipt-actions';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { RequestReceiptCancellationDialog } from '@/components/billing/request-receipt-cancellation-dialog';
import { usePendingCancellations } from '@/hooks/billing/use-receipt-cancellations';
import { usePermissions } from '@/hooks/use-permissions';
import type { BillingReceipt } from '@/types/billing-schedule';

interface ReceiptActionsClientProps {
  receipt: BillingReceipt;
  isStudentView?: boolean;
}

export function ReceiptActionsClient({
  receipt,
  isStudentView = false
}: ReceiptActionsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sendLoading, setSendLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { isSuperAdmin, canAccess } = usePermissions();
  const canRequestCancel =
    !isStudentView && (isSuperAdmin || canAccess('billing.receipts', 'cancel.request'));

  // An open request must suppress the button — the RPC rejects a second one
  // ("already awaiting approval"), so offering it again only produces an error.
  const { data: pendingCancellations = {} } = usePendingCancellations(
    canRequestCancel ? [receipt.id] : []
  );
  const hasPendingCancellation = !!pendingCancellations[receipt.id];

  const handleSendReceipt = async () => {
    if (!receipt.student?.college_email) {
      toast.error('No email address available for this student');
      return;
    }

    setSendLoading(true);
    startTransition(async () => {
      const result = await sendReceipt(receipt.id, receipt.student.college_email);
      setSendLoading(false);

      if (result.success) {
        toast.success('Receipt sent successfully');
      } else {
        toast.error(result.error || 'Failed to send receipt');
      }
    });
  };

  const handleDownloadPDF = async () => {
    setDownloadLoading(true);
    try {
      // PDF generation is browser-only (jsPDF needs `document`), so it runs
      // client-side here rather than through a server action.
      await BillingReceiptService.downloadReceiptPDF(receipt.id);
      toast.success('Receipt PDF downloaded');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to download PDF'
      );
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center'>
      <Button variant='outline' size='sm' asChild>
        <Link href={`/billing/schedule/students/${receipt.student_id}`}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to Student Bills
        </Link>
      </Button>

      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={handleDownloadPDF}
          disabled={isPending || downloadLoading}
        >
          <Download className='mr-2 h-4 w-4' />
          {downloadLoading ? 'Downloading...' : 'Download PDF'}
        </Button>

        <Button
          variant='outline'
          size='sm'
          onClick={() => window.print()}
          disabled={isPending}
        >
          <Printer className='mr-2 h-4 w-4' />
          Print
        </Button>

        {receipt.student?.college_email && (
          <Button
            variant='outline'
            size='sm'
            onClick={handleSendReceipt}
            disabled={isPending || sendLoading}
          >
            <Send className='mr-2 h-4 w-4' />
            {sendLoading ? 'Sending...' : 'Send Email'}
          </Button>
        )}

        {/* Hide Edit button for students */}
        {!isStudentView && (
          <Button variant='outline' size='sm' asChild>
            <Link href={`/billing/receipts/${receipt.id}/edit`}>
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </Link>
          </Button>
        )}

        {hasPendingCancellation ? (
          <Badge variant='secondary'>Cancellation pending approval</Badge>
        ) : (
          canRequestCancel && (
            <Button
              variant='destructive'
              size='sm'
              onClick={() => setCancelOpen(true)}
              disabled={isPending}
            >
              <Ban className='mr-2 h-4 w-4' />
              Request cancellation
            </Button>
          )
        )}
      </div>

      <RequestReceiptCancellationDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        receiptId={receipt.id}
        receiptNumber={receipt.receipt_number}
        // Re-render the server component so the pending badge appears without
        // a manual reload.
        onRequested={() => router.refresh()}
      />
    </div>
  );
}
