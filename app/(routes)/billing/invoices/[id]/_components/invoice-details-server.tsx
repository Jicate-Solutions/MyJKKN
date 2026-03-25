/**
 * Invoice Details Server Component
 *
 * Displays complete invoice information in professional format.
 * Server component - no client-side state or interactivity.
 */

import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { BillingInvoice } from '@/types/billing-schedule';

interface InvoiceDetailsServerProps {
  invoice: BillingInvoice;
}

export function InvoiceDetailsServer({ invoice }: InvoiceDetailsServerProps) {
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

  const getInvoiceTypeBadge = (type: string) => {
    const typeConfig = {
      individual: { label: 'Individual', variant: 'default' as const },
      consolidated: { label: 'Consolidated', variant: 'secondary' as const }
    };

    const config = typeConfig[type as keyof typeof typeConfig] || {
      label: type,
      variant: 'outline' as const
    };

    return (
      <Badge variant={config.variant} className='capitalize'>
        {config.label}
      </Badge>
    );
  };

  const subtotal =
    invoice.invoice_items?.reduce((sum, item) => sum + item.amount, 0) || 0;

  return (
    <div className='max-w-4xl mx-auto'>
      <Card className='shadow-lg border-0 bg-white'>
        <CardContent className='p-0'>
          {/* Invoice Header */}
          <div className='bg-gradient-to-r from-blue-600 to-blue-700 text-white p-8'>
            <div className='flex justify-between items-start'>
              <div>
                <h1 className='text-4xl font-bold mb-2'>INVOICE</h1>
                <p className='text-blue-100 text-lg'>
                  {invoice.institution?.name || 'Institution Name'}
                </p>
              </div>
              <div className='text-right'>
                <div className='text-2xl font-bold mb-1'>
                  {invoice.invoice_number}
                </div>
                <div className='text-blue-100'>
                  {formatDate(invoice.invoice_date)}
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className='p-8'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-8 mb-8'>
              {/* Bill To */}
              <div>
                <h3 className='text-lg font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2'>
                  Bill To
                </h3>
                <div className='space-y-2 text-gray-700'>
                  <div className='font-semibold text-gray-900'>
                    {`${invoice.student?.first_name} ${
                      invoice.student?.last_name || ''
                    }`.trim()}
                  </div>
                  {invoice.student?.roll_number && (
                    <div>Roll No: {invoice.student.roll_number}</div>
                  )}
                  {invoice.student?.college_email && (
                    <div className='text-sm'>{invoice.student.college_email}</div>
                  )}
                </div>
              </div>

              {/* Invoice Info */}
              <div>
                <h3 className='text-lg font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2'>
                  Invoice Details
                </h3>
                <div className='space-y-2 text-gray-700'>
                  <div className='flex justify-between'>
                    <span>Invoice Type:</span>
                    <span className='font-medium'>
                      {getInvoiceTypeBadge(invoice.invoice_type)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span>Invoice Date:</span>
                    <span className='font-medium'>
                      {formatDate(invoice.invoice_date)}
                    </span>
                  </div>
                  {invoice.due_date && (
                    <div className='flex justify-between'>
                      <span>Due Date:</span>
                      <span className='font-medium'>
                        {formatDate(invoice.due_date)}
                      </span>
                    </div>
                  )}
                  {invoice.billing_period_from && (
                    <div className='flex justify-between'>
                      <span>Billing Period:</span>
                      <span className='font-medium text-sm'>
                        {formatDate(invoice.billing_period_from)}
                        {invoice.billing_period_to &&
                          ` - ${formatDate(invoice.billing_period_to)}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            {invoice.invoice_description && (
              <div className='mb-8'>
                <h3 className='text-lg font-semibold text-gray-900 mb-3'>
                  Description
                </h3>
                <div className='bg-gray-50 p-4 rounded-lg border'>
                  <p className='text-gray-700'>{invoice.invoice_description}</p>
                </div>
              </div>
            )}

            {/* Invoice Items Table */}
            <div className='mb-8'>
              <h3 className='text-lg font-semibold text-gray-900 mb-4'>
                Payment Details
              </h3>
              <div className='border border-gray-200 rounded-lg overflow-hidden'>
                <table className='w-full'>
                  <thead className='bg-gray-50'>
                    <tr>
                      <th className='px-6 py-4 text-left text-sm font-semibold text-gray-900'>
                        Receipt Number
                      </th>
                      <th className='px-6 py-4 text-left text-sm font-semibold text-gray-900'>
                        Payment Details
                      </th>
                      <th className='px-6 py-4 text-right text-sm font-semibold text-gray-900'>
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-200'>
                    {invoice.invoice_items && invoice.invoice_items.length > 0 ? (
                      invoice.invoice_items.map((item) => (
                        <tr key={item.id} className='hover:bg-gray-50'>
                          <td className='px-6 py-4'>
                            <div className='font-medium text-blue-600'>
                              #{item.receipt?.receipt_number || 'N/A'}
                            </div>
                            <div className='text-sm text-gray-500'>
                              {item.receipt?.payment_mode?.toUpperCase() || ''}
                            </div>
                          </td>
                          <td className='px-6 py-4'>
                            <div className='text-gray-900'>
                              Receipt Amount:{' '}
                              {formatCurrency(item.receipt?.payment_amount || 0)}
                            </div>
                            <div className='text-sm text-gray-500'>
                              Date:{' '}
                              {item.receipt?.receipt_date
                                ? formatDate(item.receipt.receipt_date)
                                : 'N/A'}
                            </div>
                          </td>
                          <td className='px-6 py-4 text-right'>
                            <div className='text-lg font-semibold text-green-600'>
                              {formatCurrency(item.amount)}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={3}
                          className='px-6 py-8 text-center text-gray-500'
                        >
                          No payment items found for this invoice
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Terms */}
            {invoice.payment_terms && (
              <div className='mb-8'>
                <h3 className='text-lg font-semibold text-gray-900 mb-3'>
                  Payment Terms
                </h3>
                <div className='bg-yellow-50 border border-yellow-200 p-4 rounded-lg'>
                  <p className='text-yellow-800'>{invoice.payment_terms}</p>
                </div>
              </div>
            )}

            {/* Tax Summary */}
            {invoice.tax_summary && (
              <div className='mb-8'>
                <h3 className='text-lg font-semibold text-gray-900 mb-3'>
                  Tax Summary
                </h3>
                <div className='bg-blue-50 border border-blue-200 p-4 rounded-lg'>
                  <p className='text-blue-800'>{invoice.tax_summary}</p>
                </div>
              </div>
            )}
          </div>

          {/* Total Section */}
          <div className='bg-gray-50 border-t p-8'>
            <div className='max-w-md ml-auto'>
              <div className='space-y-3'>
                <div className='flex justify-between text-gray-700'>
                  <span>Subtotal:</span>
                  <span className='font-medium'>{formatCurrency(subtotal)}</span>
                </div>

                {invoice.additional_charges > 0 && (
                  <div className='flex justify-between text-gray-700'>
                    <span>Additional Charges:</span>
                    <span className='font-medium text-orange-600'>
                      +{formatCurrency(invoice.additional_charges)}
                    </span>
                  </div>
                )}

                {invoice.discount_applied > 0 && (
                  <div className='flex justify-between text-gray-700'>
                    <span>Discount Applied:</span>
                    <span className='font-medium text-red-600'>
                      -{formatCurrency(invoice.discount_applied)}
                    </span>
                  </div>
                )}

                <Separator />

                <div className='flex justify-between text-xl font-bold text-gray-900'>
                  <span>Grand Total:</span>
                  <span className='text-green-600'>
                    {formatCurrency(invoice.grand_total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className='bg-gray-900 text-white p-6 text-center'>
            <p className='text-sm text-gray-300'>
              This is a computer-generated invoice. For any queries, please contact
              the billing department.
            </p>
            <p className='text-xs text-gray-400 mt-2'>
              Generated on: {new Date().toLocaleString('en-IN')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
