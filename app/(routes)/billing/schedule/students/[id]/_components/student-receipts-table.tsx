'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Eye,
  Download,
  Mail,
  RefreshCw,
  Calendar,
  CreditCard,
  ReceiptIndianRupee,
  FileText,
  Printer,
  Ban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { RequestReceiptCancellationDialog } from '@/components/billing/request-receipt-cancellation-dialog';
import { usePendingCancellations } from '@/hooks/billing/use-receipt-cancellations';
import type { BillingReceipt } from '@/types/billing-schedule';

interface StudentReceiptsTableProps {
  receipts: BillingReceipt[];
  onRefresh: () => void;
  /**
   * True when a learner is viewing their OWN record. Learners reach this page,
   * so cancellation is gated on the role here and not on the permission alone
   * — the same belt-and-braces the receipt detail page uses.
   */
  isStudentView?: boolean;
}

export function StudentReceiptsTable({
  receipts,
  onRefresh,
  isStudentView = false
}: StudentReceiptsTableProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<
    string | null
  >(null);
  const [receiptToCancel, setReceiptToCancel] = useState<BillingReceipt | null>(
    null
  );

  const canViewReceipts = isSuperAdmin || canAccess('billing.receipts', 'view');
  // Accounts staff settle bills from this page, so this is where a mis-keyed
  // receipt is noticed. Before 2026-08-25 the only way to act on one was to go
  // find it again in /billing/receipts.
  //
  // The grant itself is held by the Chief Accountant role alone (plus super
  // admins, who bypass via is_super_admin()); `!isStudentView` is the second
  // lock, so a learner never sees this even if the key is mis-granted later.
  const canRequestCancel =
    !isStudentView &&
    (isSuperAdmin || canAccess('billing.receipts', 'cancel.request'));

  // A second request is rejected by the RPC ("already awaiting approval"), so
  // a pending one shows a badge instead of the action.
  const { data: pendingCancellations = {} } = usePendingCancellations(
    canRequestCancel ? receipts.map((r) => r.id) : []
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Calculate refund information for a receipt
  const getReceiptRefundInfo = (receipt: BillingReceipt) => {
    const refunds = receipt.refunds || [];
    const processedRefunds = refunds.filter(
      (r) => r.approval_status === 'processed'
    );
    const totalProcessedRefunds = processedRefunds.reduce(
      (sum, r) => sum + r.refund_amount,
      0
    );
    const hasProcessedRefunds = processedRefunds.length > 0;
    const netAmount = receipt.payment_amount - totalProcessedRefunds;

    return {
      hasProcessedRefunds,
      totalProcessedRefunds,
      netAmount,
      processedRefunds
    };
  };

  const getPaymentModeBadge = (mode: string) => {
    const modeConfig = {
      cash: {
        variant: 'default' as const,
        className: 'bg-green-100 text-green-800 border-green-200'
      },
      online: {
        variant: 'secondary' as const,
        className: 'bg-blue-100 text-blue-800 border-blue-200'
      },
      bank_transfer: {
        variant: 'outline' as const,
        className: 'bg-purple-100 text-purple-800 border-purple-200'
      },
      dd: {
        variant: 'outline' as const,
        className: 'bg-orange-100 text-orange-800 border-orange-200'
      },
      cheque: {
        variant: 'outline' as const,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      }
    };

    const config =
      modeConfig[mode as keyof typeof modeConfig] || modeConfig.cash;
    return (
      <Badge variant={config.variant} className={config.className}>
        {mode.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const handleDownloadReceipt = async (receiptId: string) => {
    try {
      setDownloadingReceiptId(receiptId);
      await BillingReceiptService.downloadReceiptPDF(receiptId);
      toast.success('Receipt PDF downloaded');
    } catch (error) {
      console.error('Error downloading receipt:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to download receipt PDF'
      );
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const handleEmailReceipt = async (receiptId: string) => {
    try {
      // TODO: Implement email receipt functionality
      console.log('Emailing receipt:', receiptId);
    } catch (error) {
      console.error('Error emailing receipt:', error);
    }
  };

  const handlePrintReceipt = async (receiptId: string) => {
    try {
      // TODO: Implement print receipt functionality
      console.log('Printing receipt:', receiptId);
    } catch (error) {
      console.error('Error printing receipt:', error);
    }
  };

  if (receipts.length === 0) {
    return (
      <div className='text-center py-12'>
        <ReceiptIndianRupee className='mx-auto h-12 w-12 text-muted-foreground' />
        <h3 className='mt-4 text-lg font-semibold'>No receipts found</h3>
        <p className='mt-2 text-muted-foreground'>
          This student has no payment receipts yet.
        </p>
        <Button variant='outline' onClick={onRefresh} className='mt-4'>
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt Number</TableHead>
              <TableHead>Receipt Date</TableHead>
              <TableHead>Payment Mode</TableHead>
              <TableHead>Payer Details</TableHead>
              <TableHead className='text-right'>Amount</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className='text-center'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.map((receipt) => (
              <TableRow key={receipt.id} className='hover:bg-muted/50'>
                <TableCell>
                  <div className='space-y-1'>
                    <div className='font-medium'>{receipt.receipt_number}</div>
                    <div className='text-xs text-muted-foreground'>
                      Paid on: {formatDate(receipt.payment_paid_date)}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <Calendar className='h-4 w-4 text-muted-foreground' />
                    <span className='text-sm'>
                      {formatDate(receipt.receipt_date)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {getPaymentModeBadge(receipt.payment_mode)}
                </TableCell>
                <TableCell>
                  <div className='space-y-1'>
                    <div className='font-medium'>{receipt.payer_name}</div>
                    {receipt.payer_contact && (
                      <div className='text-xs text-muted-foreground'>
                        {receipt.payer_contact}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className='text-right'>
                  {(() => {
                    const refundInfo = getReceiptRefundInfo(receipt);
                    return (
                      <div className='space-y-1'>
                        <div
                          className={`font-semibold ${
                            refundInfo.hasProcessedRefunds
                              ? 'text-red-600 line-through'
                              : 'text-green-600'
                          }`}
                        >
                          {formatCurrency(receipt.payment_amount)}
                          {refundInfo.hasProcessedRefunds && (
                            <span className='ml-1 text-xs font-normal text-muted-foreground'>
                              (Refunded)
                            </span>
                          )}
                        </div>
                        {refundInfo.hasProcessedRefunds && (
                          <div className='space-y-1'>
                            <div className='text-xs text-red-600'>
                              Refunded: -
                              {formatCurrency(refundInfo.totalProcessedRefunds)}
                            </div>
                            <div className='text-sm font-semibold text-green-600'>
                              Net: {formatCurrency(refundInfo.netAmount)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <div className='space-y-1'>
                    {receipt.payment_reference_number && (
                      <div className='text-sm font-mono'>
                        {receipt.payment_reference_number}
                      </div>
                    )}
                    {receipt.payment_remarks && (
                      <div className='text-xs text-muted-foreground'>
                        {receipt.payment_remarks}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className='text-center'>
                  <div className='flex items-center justify-center gap-1'>
                    {canViewReceipts && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant='ghost' size='sm' asChild>
                              <Link
                                href={`/billing/receipts/${receipt.id}`}
                              >
                                <Eye className='h-4 w-4' />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View Receipt</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => handleDownloadReceipt(receipt.id)}
                            disabled={downloadingReceiptId === receipt.id}
                          >
                            <Download className='h-4 w-4' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Download PDF</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => handlePrintReceipt(receipt.id)}
                          >
                            <Printer className='h-4 w-4' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Print Receipt</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => handleEmailReceipt(receipt.id)}
                          >
                            <Mail className='h-4 w-4' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Email Receipt</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {canRequestCancel &&
                      (pendingCancellations[receipt.id] ? (
                        <Badge variant='secondary' className='whitespace-nowrap'>
                          Cancellation pending
                        </Badge>
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => setReceiptToCancel(receipt)}
                                className='text-destructive hover:text-destructive'
                              >
                                <Ban className='h-4 w-4' />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Request Cancellation</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RequestReceiptCancellationDialog
        open={!!receiptToCancel}
        onOpenChange={(open) => {
          if (!open) setReceiptToCancel(null);
        }}
        receiptId={receiptToCancel?.id ?? null}
        receiptNumber={receiptToCancel?.receipt_number ?? null}
        onRequested={onRefresh}
      />

      {/* Summary */}
      <div className='flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground'>
        <div>
          Showing {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
        </div>
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
          <div>
            Total Collected:{' '}
            {formatCurrency(
              receipts.reduce((sum, receipt) => sum + receipt.payment_amount, 0)
            )}
          </div>
          <div>
            Payment Methods: {new Set(receipts.map((r) => r.payment_mode)).size}{' '}
            types
          </div>
        </div>
      </div>
    </div>
  );
}
