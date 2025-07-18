'use client';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Download,
  Send,
  Edit,
  Trash2,
  FileText,
  Calendar,
  User,
  Building,
  DollarSign,
  Receipt,
  Tag,
  Clock,
  CreditCard
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { useRouter } from 'next/navigation';
import {
  useBillingInvoice,
  useBillingInvoiceQuery,
  useDeleteBillingInvoice,
  useSendInvoice,
  useDownloadInvoicePDF
} from '@/hooks/billing/use-billing-invoices';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';
import { use } from 'react';

interface InvoiceDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function InvoiceDetailsPage({
  params
}: InvoiceDetailsPageProps) {
  const router = useRouter();
  const { id } = use(params);

  // Use React Query version
  const {
    data: invoice,
    isLoading: loading,
    error: queryError,
    refetch
  } = useBillingInvoiceQuery(id);
  const error = queryError?.message || null;

  const { deleteInvoice, loading: deleteLoading } = useDeleteBillingInvoice();
  const { sendInvoice, loading: sendLoading } = useSendInvoice();
  const { downloadPDF, loading: downloadLoading } = useDownloadInvoicePDF();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canEditInvoices = isSuperAdmin || canAccess('billing.invoices', 'edit');
  const canDeleteInvoices =
    isSuperAdmin || canAccess('billing.invoices', 'delete');
  const canSendInvoices = isSuperAdmin || canAccess('billing.invoices', 'send');

  if (loading) {
    return (
      <ContentLayout title='Invoice Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !invoice) {
    if (error?.includes('not found') || !invoice) {
      notFound();
    }
    return (
      <ContentLayout title='Invoice Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button variant='outline' onClick={() => refetch()} className='mt-4'>
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const handleDelete = async () => {
    try {
      await deleteInvoice(invoice.id);
      router.push('/billing/invoices');
    } catch (error) {
      console.error('Error deleting invoice:', error);
    }
  };

  const handleSendInvoice = async () => {
    if (!invoice.student?.college_email) {
      toast.error('No email address available for this student');
      return;
    }

    try {
      await sendInvoice(invoice.id, invoice.student.college_email);
    } catch (error) {
      console.error('Error sending invoice:', error);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await downloadPDF(invoice.id);
    } catch (error) {
      console.error('Error downloading invoice:', error);
    }
  };

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

  return (
    <ContentLayout title={`Invoice ${invoice.invoice_number}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Invoices', href: '/billing/invoices' },
          {
            label: invoice.invoice_number,
            href: `/billing/invoices/${invoice.id}`
          }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header Actions */}
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
              disabled={downloadLoading}
            >
              <Download className='mr-2 h-4 w-4' />
              {downloadLoading ? 'Downloading...' : 'Download PDF'}
            </Button>

            {canSendInvoices && invoice.student?.college_email && (
              <Button
                variant='outline'
                size='sm'
                onClick={handleSendInvoice}
                disabled={sendLoading}
              >
                <Send className='mr-2 h-4 w-4' />
                {sendLoading ? 'Sending...' : 'Send Email'}
              </Button>
            )}

            {canEditInvoices && (
              <Button variant='outline' size='sm' asChild>
                <Link href={`/billing/invoices/${invoice.id}/edit`}>
                  <Edit className='mr-2 h-4 w-4' />
                  Edit
                </Link>
              </Button>
            )}

            {canDeleteInvoices && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant='destructive' size='sm'>
                    <Trash2 className='mr-2 h-4 w-4' />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete invoice{' '}
                      <span className='font-semibold'>
                        {invoice.invoice_number}
                      </span>
                      ? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      disabled={deleteLoading}
                    >
                      {deleteLoading ? 'Deleting...' : 'Delete Invoice'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Professional Invoice Layout */}
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
                        <div className='text-sm'>
                          {invoice.student.college_email}
                        </div>
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
                      <p className='text-gray-700'>
                        {invoice.invoice_description}
                      </p>
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
                        {invoice.invoice_items &&
                        invoice.invoice_items.length > 0 ? (
                          invoice.invoice_items.map((item, index) => (
                            <tr key={item.id} className='hover:bg-gray-50'>
                              <td className='px-6 py-4'>
                                <div className='font-medium text-blue-600'>
                                  #{item.receipt?.receipt_number || 'N/A'}
                                </div>
                                <div className='text-sm text-gray-500'>
                                  {item.receipt?.payment_mode?.toUpperCase() ||
                                    ''}
                                </div>
                              </td>
                              <td className='px-6 py-4'>
                                <div className='text-gray-900'>
                                  Receipt Amount:{' '}
                                  {formatCurrency(
                                    item.receipt?.payment_amount || 0
                                  )}
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
                      <span className='font-medium'>
                        {formatCurrency(
                          invoice.invoice_items?.reduce(
                            (sum, item) => sum + item.amount,
                            0
                          ) || 0
                        )}
                      </span>
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
                  This is a computer-generated invoice. For any queries, please
                  contact the billing department.
                </p>
                <p className='text-xs text-gray-400 mt-2'>
                  Generated on: {new Date().toLocaleString('en-IN')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
