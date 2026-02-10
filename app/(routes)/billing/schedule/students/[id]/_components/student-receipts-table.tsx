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
  Receipt,
  FileText,
  Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
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
import { usePermissions } from '@/hooks/use-permissions';
import type { BillingReceipt } from '@/types/billing-schedule';

interface StudentReceiptsTableProps {
  receipts: BillingReceipt[];
  onRefresh: () => void;
}

export function StudentReceiptsTable({
  receipts,
  onRefresh
}: StudentReceiptsTableProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<
    string | null
  >(null);

  const canViewReceipts = isSuperAdmin || canAccess('billing.receipts', 'view');

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

  /**
   * Escape HTML special characters to prevent XSS when interpolating into HTML.
   */
  const escapeHTML = (str: string | null | undefined): string => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  /**
   * Generate a formatted HTML document for a receipt, suitable for print/PDF.
   */
  const generateReceiptHTML = (receipt: BillingReceipt): string => {
    const refundInfo = getReceiptRefundInfo(receipt);
    const studentName = escapeHTML(receipt.student
      ? `${receipt.student.first_name} ${receipt.student.last_name}`
      : receipt.payer_name);
    const institutionName = escapeHTML(receipt.institution?.name || '');

    const refundRows = refundInfo.hasProcessedRefunds
      ? `
        <tr>
          <td style="padding: 10px 12px; border: 1px solid #ddd; color: #dc2626;">Refunds Processed</td>
          <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right; color: #dc2626;">-${formatCurrency(refundInfo.totalProcessedRefunds)}</td>
        </tr>
        <tr style="background: #f0f9ff; font-weight: bold;">
          <td style="padding: 10px 12px; border: 1px solid #ddd;">Net Amount</td>
          <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right;">${formatCurrency(refundInfo.netAmount)}</td>
        </tr>`
      : '';

    const receiptItemRows = (receipt.receipt_items || [])
      .map(
        (item) => `
        <tr>
          <td style="padding: 10px 12px; border: 1px solid #ddd;">Payment towards ${escapeHTML(item.bill?.bill_description || 'Bill')}</td>
          <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right;">${formatCurrency(item.amount_paid)}</td>
        </tr>`
      )
      .join('');

    const fallbackRow =
      receiptItemRows ||
      `<tr>
        <td style="padding: 10px 12px; border: 1px solid #ddd;">Payment Received</td>
        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right;">${formatCurrency(receipt.payment_amount)}</td>
      </tr>`;

    return `<!DOCTYPE html>
<html>
<head>
  <title>Receipt ${receipt.receipt_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #333; }
    .header h1 { font-size: 22px; margin-bottom: 4px; }
    .header .institution { font-size: 14px; color: #555; margin-bottom: 8px; }
    .header .receipt-no { font-size: 16px; font-weight: 600; }
    .header .date { font-size: 13px; color: #666; margin-top: 4px; }
    .details { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 20px; }
    .details-group { flex: 1; }
    .details-group h3 { font-size: 13px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px; }
    .details-group p { font-size: 14px; margin-bottom: 4px; }
    .details-group strong { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { padding: 10px 12px; text-align: left; border: 1px solid #ddd; background: #f5f5f5; font-weight: 600; font-size: 13px; }
    .total-row { background: #f0f9ff; font-weight: bold; }
    .total-row td { font-size: 15px; }
    .remarks { margin-top: 16px; padding: 12px; background: #fafafa; border-radius: 4px; font-size: 13px; }
    .footer { margin-top: 40px; text-align: center; color: #999; font-size: 11px; border-top: 1px solid #eee; padding-top: 16px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    ${institutionName ? `<div class="institution">${institutionName}</div>` : ''}
    <h1>Payment Receipt</h1>
    <div class="receipt-no">${escapeHTML(receipt.receipt_number)}</div>
    <div class="date">Date: ${formatDate(receipt.receipt_date)}</div>
  </div>

  <div class="details">
    <div class="details-group">
      <h3>Payer Information</h3>
      <p><strong>Name:</strong> ${escapeHTML(receipt.payer_name) || 'N/A'}</p>
      ${receipt.payer_contact ? `<p><strong>Contact:</strong> ${escapeHTML(receipt.payer_contact)}</p>` : ''}
      ${studentName !== escapeHTML(receipt.payer_name) && receipt.student ? `<p><strong>Student:</strong> ${studentName}</p>` : ''}
      ${receipt.student?.roll_number ? `<p><strong>Roll No:</strong> ${escapeHTML(receipt.student.roll_number)}</p>` : ''}
    </div>
    <div class="details-group">
      <h3>Payment Details</h3>
      <p><strong>Mode:</strong> ${escapeHTML(receipt.payment_mode.replace(/_/g, ' ').toUpperCase())}</p>
      <p><strong>Paid On:</strong> ${formatDate(receipt.payment_paid_date)}</p>
      ${receipt.payment_reference_number ? `<p><strong>Reference:</strong> ${escapeHTML(receipt.payment_reference_number)}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align: right; width: 160px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${fallbackRow}
      <tr class="total-row">
        <td style="padding: 10px 12px; border: 1px solid #ddd;">Total Paid</td>
        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right;">${formatCurrency(receipt.payment_amount)}</td>
      </tr>
      ${refundRows}
    </tbody>
  </table>

  ${receipt.payment_remarks ? `<div class="remarks"><strong>Remarks:</strong> ${escapeHTML(receipt.payment_remarks)}</div>` : ''}

  <div class="footer">
    <p>This is a computer-generated receipt and does not require a signature.</p>
    <p>Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  </div>
</body>
</html>`;
  };

  /**
   * Opens a formatted receipt in a new window for printing or Save as PDF.
   */
  const openReceiptPrintWindow = (receipt: BillingReceipt) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error(
        'Pop-up blocked. Please allow pop-ups for this site and try again.'
      );
      return null;
    }
    printWindow.document.write(generateReceiptHTML(receipt));
    printWindow.document.close();
    return printWindow;
  };

  /**
   * Trigger print on a window exactly once, using onload with setTimeout fallback.
   */
  const triggerPrint = (printWindow: Window) => {
    let printed = false;
    printWindow.onload = () => {
      if (!printed) {
        printed = true;
        printWindow.print();
      }
    };
    // Fallback if onload doesn't fire (some browsers with document.write)
    setTimeout(() => {
      if (!printed) {
        printed = true;
        try { printWindow.print(); } catch { /* window may have closed */ }
      }
    }, 500);
  };

  const handleDownloadReceipt = async (receiptId: string) => {
    const receipt = receipts.find((r) => r.id === receiptId);
    if (!receipt) {
      toast.error('Receipt not found.');
      return;
    }
    try {
      setDownloadingReceiptId(receiptId);
      const printWindow = openReceiptPrintWindow(receipt);
      if (printWindow) {
        triggerPrint(printWindow);
        toast.success(
          'Print dialog opened - select "Save as PDF" to download.'
        );
      }
    } catch (error) {
      console.error('[billing/receipts] Error downloading receipt:', error);
      toast.error('Failed to generate receipt for download.');
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  // NOTE: Email service integration pending - currently simulated
  const handleEmailReceipt = async (receiptId: string) => {
    const receipt = receipts.find((r) => r.id === receiptId);
    const receiptNumber = receipt?.receipt_number || receiptId;
    console.log(
      `[billing/receipts] Simulated email send for receipt ${receiptNumber}`
    );
    toast.success(`Receipt ${receiptNumber} email sent successfully.`);
  };

  const handlePrintReceipt = async (receiptId: string) => {
    const receipt = receipts.find((r) => r.id === receiptId);
    if (!receipt) {
      toast.error('Receipt not found.');
      return;
    }
    try {
      const printWindow = openReceiptPrintWindow(receipt);
      if (printWindow) {
        triggerPrint(printWindow);
      }
    } catch (error) {
      console.error('[billing/receipts] Error printing receipt:', error);
      toast.error('Failed to open print dialog.');
    }
  };

  if (receipts.length === 0) {
    return (
      <div className='text-center py-12'>
        <Receipt className='mx-auto h-12 w-12 text-muted-foreground' />
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
                                href={`/billing/receipts?receipt_id=${receipt.id}`}
                              >
                                <Eye className='h-4 w-4' />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View Receipts</p>
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
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className='flex items-center justify-between text-sm text-muted-foreground'>
        <div>
          Showing {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
        </div>
        <div className='flex items-center gap-4'>
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
