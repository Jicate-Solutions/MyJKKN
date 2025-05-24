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
      // TODO: Implement receipt download functionality
      console.log('Downloading receipt:', receiptId);
    } catch (error) {
      console.error('Error downloading receipt:', error);
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
                  <div className='font-medium text-green-600'>
                    {formatCurrency(receipt.payment_amount)}
                  </div>
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
                              <Link href={`/billing/receipts/${receipt.id}`}>
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
