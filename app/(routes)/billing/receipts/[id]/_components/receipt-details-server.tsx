/**
 * Receipt Details Server Component
 *
 * Displays complete receipt information in professional format.
 * Server component - no client-side state or interactivity.
 */

import { format } from 'date-fns';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { BillingReceipt } from '@/types/billing-schedule';

interface ReceiptDetailsServerProps {
  receipt: BillingReceipt;
}

export function ReceiptDetailsServer({ receipt }: ReceiptDetailsServerProps) {
  const formatDate = (date: string) => {
    return format(new Date(date), 'PPP');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getPaymentModeBadge = (mode: string) => {
    const modeConfig = {
      cash: { variant: 'default' as const, label: 'Cash' },
      online: { variant: 'secondary' as const, label: 'Online' },
      bank_transfer: { variant: 'outline' as const, label: 'Bank Transfer' },
      dd: { variant: 'secondary' as const, label: 'DD' },
      cheque: { variant: 'outline' as const, label: 'Cheque' }
    };

    const config = modeConfig[mode as keyof typeof modeConfig] || {
      variant: 'secondary' as const,
      label: mode.toUpperCase()
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getApprovalStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: 'secondary' as const, label: 'Pending' },
      approved: { variant: 'default' as const, label: 'Approved' },
      rejected: { variant: 'destructive' as const, label: 'Rejected' },
      processed: { variant: 'default' as const, label: 'Processed' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      variant: 'outline' as const,
      label: status.toUpperCase()
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Calculate refund totals
  const processedRefunds =
    receipt.refunds?.filter((r) => r.approval_status === 'processed') || [];
  const totalProcessedRefunds = processedRefunds.reduce(
    (sum, r) => sum + r.refund_amount,
    0
  );
  const hasProcessedRefunds = processedRefunds.length > 0;
  const netReceiptAmount = receipt.payment_amount - totalProcessedRefunds;

  return (
    <div className='max-w-5xl mx-auto'>
      <Card className='shadow-lg border-0 bg-white'>
        <CardContent className='p-0'>
          {/* Receipt Header */}
          <div className='bg-gradient-to-r from-green-600 to-green-700 text-white p-8'>
            <div className='flex justify-between items-start'>
              <div>
                <h1 className='text-4xl font-bold mb-2'>RECEIPT</h1>
                <p className='text-green-100 text-lg'>
                  {receipt.institution?.name || 'Institution Name'}
                </p>
              </div>
              <div className='text-right'>
                <div className='text-2xl font-bold mb-1'>
                  {receipt.receipt_number}
                </div>
                <div className='text-green-100'>
                  {formatDate(receipt.receipt_date)}
                </div>
              </div>
            </div>
          </div>

          {/* Receipt Details */}
          <div className='p-8'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-8 mb-8'>
              {/* Received From */}
              <div>
                <h3 className='text-lg font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2'>
                  Received From
                </h3>
                <div className='space-y-2 text-gray-700'>
                  <div className='font-semibold text-gray-900'>
                    {`${receipt.student?.first_name} ${
                      receipt.student?.last_name || ''
                    }`.trim()}
                  </div>
                  {receipt.student?.roll_number && (
                    <div>Roll No: {receipt.student.roll_number}</div>
                  )}
                  {receipt.student?.college_email && (
                    <div className='text-sm'>{receipt.student.college_email}</div>
                  )}
                </div>
              </div>

              {/* Payment Info */}
              <div>
                <h3 className='text-lg font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2'>
                  Payment Details
                </h3>
                <div className='space-y-2 text-gray-700'>
                  <div className='flex justify-between'>
                    <span>Payment Mode:</span>
                    <span className='font-medium'>
                      {getPaymentModeBadge(receipt.payment_mode)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span>Payment Date:</span>
                    <span className='font-medium'>
                      {formatDate(receipt.payment_paid_date)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span>Receipt Date:</span>
                    <span className='font-medium'>
                      {formatDate(receipt.receipt_date)}
                    </span>
                  </div>
                  {receipt.payment_reference_number && (
                    <div className='flex justify-between'>
                      <span>Transaction ID:</span>
                      <span className='font-medium font-mono text-sm'>
                        {receipt.payment_reference_number}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Payer Information */}
            {receipt.payer_name && (
              <div className='mb-8'>
                <h3 className='text-lg font-semibold text-gray-900 mb-3'>
                  Payer Information
                </h3>
                <div className='bg-gray-50 p-4 rounded-lg border'>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <span className='text-sm text-gray-600'>Name: </span>
                      <span className='font-medium'>{receipt.payer_name}</span>
                    </div>
                    {receipt.payer_contact && (
                      <div>
                        <span className='text-sm text-gray-600'>Contact: </span>
                        <span className='font-medium'>{receipt.payer_contact}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Payment Remarks */}
            {receipt.payment_remarks && (
              <div className='mb-8'>
                <h3 className='text-lg font-semibold text-gray-900 mb-3'>
                  Payment Remarks
                </h3>
                <div className='bg-blue-50 p-4 rounded-lg border border-blue-200'>
                  <p className='text-gray-700'>{receipt.payment_remarks}</p>
                </div>
              </div>
            )}

            {/* Receipt Items Table */}
            {receipt.receipt_items && receipt.receipt_items.length > 0 && (
              <div className='mb-8'>
                <h3 className='text-lg font-semibold text-gray-900 mb-4'>
                  Payment Breakdown
                </h3>
                <div className='border border-gray-200 rounded-lg overflow-hidden'>
                  <Table>
                    <TableHeader>
                      <tr className='bg-gray-50'>
                        <TableHead className='px-6 py-4 text-left text-sm font-semibold text-gray-900'>
                          Bill Item
                        </TableHead>
                        <TableHead className='px-6 py-4 text-left text-sm font-semibold text-gray-900'>
                          Due Date
                        </TableHead>
                        <TableHead className='px-6 py-4 text-right text-sm font-semibold text-gray-900'>
                          Bill Amount
                        </TableHead>
                        <TableHead className='px-6 py-4 text-right text-sm font-semibold text-gray-900'>
                          Amount Paid
                        </TableHead>
                      </tr>
                    </TableHeader>
                    <TableBody>
                      {receipt.receipt_items.map((item) => (
                        <TableRow key={item.id} className='hover:bg-gray-50'>
                          <TableCell className='px-6 py-4'>
                            <div>
                              <p className='font-medium text-gray-900'>
                                {item.bill?.bill_description &&
                                item.bill.bill_description.trim() !== ''
                                  ? item.bill.bill_description
                                  : item.bill?.item_category?.item_category_name ||
                                    'No description'}
                              </p>
                              {item.bill?.bill_description &&
                                item.bill.bill_description.trim() !== '' && (
                                  <p className='text-sm text-gray-500'>
                                    {item.bill?.item_category?.item_category_name}
                                  </p>
                                )}
                            </div>
                          </TableCell>
                          <TableCell className='px-6 py-4 text-gray-700'>
                            {item.bill?.due_date && formatDate(item.bill.due_date)}
                          </TableCell>
                          <TableCell className='px-6 py-4 text-right text-gray-700'>
                            {item.bill?.final_amount &&
                              formatCurrency(item.bill.final_amount)}
                          </TableCell>
                          <TableCell className='px-6 py-4 text-right'>
                            <div className='text-lg font-semibold text-green-600'>
                              {formatCurrency(item.amount_paid)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Refund History */}
            {receipt.refunds && receipt.refunds.length > 0 && (
              <div className='mb-8'>
                <h3 className='text-lg font-semibold text-gray-900 mb-4'>
                  Refund History ({receipt.refunds.length})
                </h3>
                <div className='border border-gray-200 rounded-lg overflow-hidden'>
                  <Table>
                    <TableHeader>
                      <tr className='bg-gray-50'>
                        <TableHead className='px-6 py-4'>Refund Category</TableHead>
                        <TableHead className='px-6 py-4'>Amount</TableHead>
                        <TableHead className='px-6 py-4'>Date</TableHead>
                        <TableHead className='px-6 py-4'>Method</TableHead>
                        <TableHead className='px-6 py-4'>Status</TableHead>
                        <TableHead className='px-6 py-4'>Actions</TableHead>
                      </tr>
                    </TableHeader>
                    <TableBody>
                      {receipt.refunds.map((refund) => (
                        <TableRow key={refund.id} className='hover:bg-gray-50'>
                          <TableCell className='px-6 py-4'>
                            <div>
                              <p className='font-medium'>
                                {refund.refund_category.replace('_', ' ').toUpperCase()}
                              </p>
                              <p className='text-sm text-gray-500'>
                                {refund.refund_reason}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className='px-6 py-4'>
                            <div>
                              <p
                                className={`font-semibold ${
                                  refund.approval_status === 'processed'
                                    ? 'text-red-600'
                                    : 'text-orange-600'
                                }`}
                              >
                                {refund.approval_status === 'processed' ? '-' : ''}
                                {formatCurrency(refund.refund_amount)}
                              </p>
                              {refund.processing_fee > 0 && (
                                <p className='text-xs text-gray-500'>
                                  Fee: {formatCurrency(refund.processing_fee)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className='px-6 py-4'>
                            {formatDate(refund.refund_date)}
                          </TableCell>
                          <TableCell className='px-6 py-4'>
                            <Badge variant='outline'>
                              {refund.refund_method.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className='px-6 py-4'>
                            {getApprovalStatusBadge(refund.approval_status)}
                          </TableCell>
                          <TableCell className='px-6 py-4'>
                            <Button variant='outline' size='sm' asChild>
                              <Link href={`/billing/refunds/${refund.id}`}>
                                View Details
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Refund Summary */}
                {hasProcessedRefunds && (
                  <div className='mt-4 p-4 bg-red-50 border border-red-200 rounded-lg'>
                    <div className='flex justify-between items-center'>
                      <span className='text-red-700 font-medium'>
                        Total Refunded:
                      </span>
                      <span className='font-bold text-red-800'>
                        -{formatCurrency(totalProcessedRefunds)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Total Section */}
          <div className='bg-gray-50 border-t p-8'>
            <div className='max-w-md ml-auto'>
              <div className='space-y-3'>
                <div className='flex justify-between text-gray-700'>
                  <span>Payment Amount:</span>
                  <span
                    className={`font-medium ${
                      hasProcessedRefunds
                        ? 'text-red-600 line-through'
                        : 'text-gray-900'
                    }`}
                  >
                    {formatCurrency(receipt.payment_amount)}
                  </span>
                </div>

                {hasProcessedRefunds && (
                  <>
                    <div className='flex justify-between text-gray-700'>
                      <span>Less: Refunds Processed:</span>
                      <span className='font-medium text-red-600'>
                        -{formatCurrency(totalProcessedRefunds)}
                      </span>
                    </div>

                    <Separator />

                    <div className='flex justify-between text-xl font-bold text-gray-900'>
                      <span>Net Receipt Amount:</span>
                      <span className='text-green-600'>
                        {formatCurrency(netReceiptAmount)}
                      </span>
                    </div>
                  </>
                )}

                {!hasProcessedRefunds && (
                  <>
                    <Separator />

                    <div className='flex justify-between text-xl font-bold text-gray-900'>
                      <span>Total Received:</span>
                      <span className='text-green-600'>
                        {formatCurrency(receipt.payment_amount)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className='bg-gray-900 text-white p-6 text-center'>
            <p className='text-sm text-gray-300'>
              This is a computer-generated receipt. For any queries, please contact
              the billing department.
            </p>
            {receipt.accountant && (
              <p className='text-xs text-gray-400 mt-2'>
                Processed by: {receipt.accountant.full_name}
              </p>
            )}
            <p className='text-xs text-gray-400 mt-1'>
              Generated on: {new Date().toLocaleString('en-IN')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
