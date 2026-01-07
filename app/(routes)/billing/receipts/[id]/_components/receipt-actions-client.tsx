/**
 * Receipt Actions Client Component
 *
 * Interactive action buttons for receipt operations (send, download, delete).
 * Uses server actions with optimistic UI updates.
 */

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Download,
  Send,
  Edit,
  Trash2,
  ArrowLeft,
  Printer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  sendReceipt,
  downloadReceiptPDF,
  deleteReceipt
} from '../../../_actions/receipt-actions';
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
    startTransition(async () => {
      const result = await downloadReceiptPDF(receipt.id);
      setDownloadLoading(false);

      if (result.success) {
        toast.success('PDF download started');
      } else {
        toast.error(result.error || 'Failed to download PDF');
      }
    });
  };

  const handleDelete = async () => {
    startTransition(async () => {
      const result = await deleteReceipt(receipt.id);

      if (result.success) {
        toast.success('Receipt deleted successfully');
        router.push('/billing/receipts');
      } else {
        toast.error(result.error || 'Failed to delete receipt');
      }
    });
  };

  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center'>
      <Button variant='outline' size='sm' asChild>
        <Link href='/billing/receipts'>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to Receipts
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

        {/* Hide Delete button for students */}
        {!isStudentView && (
          <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant='destructive' size='sm' disabled={isPending}>
              <Trash2 className='mr-2 h-4 w-4' />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Receipt</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete receipt{' '}
                <span className='font-semibold'>{receipt.receipt_number}</span>? This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                disabled={isPending}
              >
                {isPending ? 'Deleting...' : 'Delete Receipt'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        )}
      </div>
    </div>
  );
}
