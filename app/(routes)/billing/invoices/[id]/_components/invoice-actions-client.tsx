/**
 * Invoice Actions Client Component
 *
 * Interactive action buttons for invoice operations (send, download, delete).
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
  ArrowLeft
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
  sendInvoice,
  downloadInvoicePDF,
  deleteInvoice
} from '../../../_actions/invoice-actions';
import type { BillingInvoice } from '@/types/billing-schedule';

interface InvoiceActionsClientProps {
  invoice: BillingInvoice;
  isStudentView?: boolean;
}

export function InvoiceActionsClient({
  invoice,
  isStudentView = false
}: InvoiceActionsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sendLoading, setSendLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const handleSendInvoice = async () => {
    if (!invoice.student?.college_email) {
      toast.error('No email address available for this student');
      return;
    }

    setSendLoading(true);
    startTransition(async () => {
      const result = await sendInvoice(invoice.id, invoice.student.college_email);
      setSendLoading(false);

      if (result.success) {
        toast.success('Invoice sent successfully');
      } else {
        toast.error(result.error || 'Failed to send invoice');
      }
    });
  };

  const handleDownloadPDF = async () => {
    setDownloadLoading(true);
    startTransition(async () => {
      const result = await downloadInvoicePDF(invoice.id);
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
      const result = await deleteInvoice(invoice.id);

      if (result.success) {
        toast.success('Invoice deleted successfully');
        router.push('/billing/invoices');
      } else {
        toast.error(result.error || 'Failed to delete invoice');
      }
    });
  };

  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center'>
      <Button variant='outline' size='sm' asChild>
        <Link href='/billing/invoices'>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to Invoices
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

        {invoice.student?.college_email && (
          <Button
            variant='outline'
            size='sm'
            onClick={handleSendInvoice}
            disabled={isPending || sendLoading}
          >
            <Send className='mr-2 h-4 w-4' />
            {sendLoading ? 'Sending...' : 'Send Email'}
          </Button>
        )}

        {/* Hide Edit button for students */}
        {!isStudentView && (
          <Button variant='outline' size='sm' asChild>
            <Link href={`/billing/invoices/${invoice.id}/edit`}>
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
              <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete invoice{' '}
                <span className='font-semibold'>{invoice.invoice_number}</span>? This
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
                {isPending ? 'Deleting...' : 'Delete Invoice'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        )}
      </div>
    </div>
  );
}
