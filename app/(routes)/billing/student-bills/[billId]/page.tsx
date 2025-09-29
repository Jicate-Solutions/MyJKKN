'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Eye,
  FileText,
  Loader2,
  Receipt,
  ShieldAlert,
  ShoppingBag,
  Plus,
  Percent,
  CreditCard
} from 'lucide-react';
import { format } from 'date-fns';

import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import type {
  StudentBill,
  BillingDiscount,
  BillingRefund
} from '@/types/billing-schedule';
import { usePermissions } from '@/hooks/use-permissions';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency as utilFormatCurrency } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

export default function StudentBillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const billId = params.billId as string;

  const [bill, setBill] = useState<StudentBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  useEffect(() => {
    if (permissionsLoading) return; // Wait for permissions to load

    const hasPermission =
      isSuperAdmin || canAccess('billing.student_bills', 'view');
    if (!hasPermission) {
      router.push('/unauthorized');
      return;
    }

    if (billId) {
      StudentBillService.getStudentBill(billId)
        .then(setBill)
        .catch((err) => {
          console.error('Error fetching student bill:', err);
          setError(
            err instanceof Error ? err.message : 'Failed to load bill details.'
          );
        })
        .finally(() => setLoading(false));
    } else {
      setError('Bill ID is missing.');
      setLoading(false);
    }
  }, [billId, router, canAccess, isSuperAdmin, permissionsLoading]);

  const formatCurrency = (amount: number | undefined) => {
    return utilFormatCurrency(amount, { showDecimals: true });
  };

  const calculatePaidAmount = (bill: StudentBill): number => {
    if (!bill.receipt_items || bill.receipt_items.length === 0) return 0;
    return bill.receipt_items.reduce((total, item) => total + item.amount_paid, 0);
  };

  const calculateOutstanding = (bill: StudentBill): number => {
    return bill.balance_amount || 0;
  };

  const calculateNetPaidAmount = (bill: StudentBill): number => {
    const totalPaid = calculatePaidAmount(bill);
    const totalRefunded = (allRefunds || []).reduce((sum, refund) => {
      return refund.approval_status === 'processed' ? sum + refund.refund_amount : sum;
    }, 0);
    return totalPaid - totalRefunded;
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'PPP');
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return <Badge variant='outline'>Unknown</Badge>;
    switch (status.toLowerCase()) {
      case 'paid':
        return (
          <Badge variant='default' className='bg-green-500 text-white'>
            Paid
          </Badge>
        );
      case 'unpaid':
        return <Badge variant='destructive'>Unpaid</Badge>;
      case 'partially_paid':
        return (
          <Badge variant='outline' className='bg-yellow-500 text-white'>
            Partially Paid
          </Badge>
        );
      case 'cancelled':
        return <Badge variant='secondary'>Cancelled</Badge>;
      case 'overdue':
        return (
          <Badge
            variant='destructive'
            className='border-orange-500 text-orange-500'
          >
            Overdue
          </Badge>
        );
      case 'refunded':
        return (
          <Badge variant='outline' className='bg-purple-500 text-white'>
            Refunded
          </Badge>
        );
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  if (loading || permissionsLoading) {
    return (
      <ContentLayout title='Bill Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Error'>
        <div className='text-center py-10'>
          <ShieldAlert className='mx-auto h-12 w-12 text-destructive' />
          <h2 className='mt-4 text-xl font-semibold'>
            Could not load bill details
          </h2>
          <p className='mt-2 text-muted-foreground'>{error}</p>
          <Button onClick={() => router.back()} className='mt-6'>
            <ArrowLeft className='mr-2 h-4 w-4' /> Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!bill) {
    return (
      <ContentLayout title='Bill Not Found'>
        <div className='text-center py-10'>
          <FileText className='mx-auto h-12 w-12 text-muted-foreground' />
          <h2 className='mt-4 text-xl font-semibold'>Bill not found</h2>
          <p className='mt-2 text-muted-foreground'>
            The bill you are looking for does not exist or you do not have
            permission to view it.
          </p>
          <Button onClick={() => router.push('/billing')} className='mt-6'>
            Go to Billing Overview
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const allRefunds: BillingRefund[] =
    bill.receipt_items?.flatMap((item) => item.receipt?.refunds || []) || [];

  return (
    <ContentLayout title={`Bill: ${bill.bill_description.substring(0, 30)}...`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Student Bills', href: '/billing/student-bills' }, // Assuming a list page exists
          { label: `Bill ${bill.id.substring(0, 8)}...` }
        ]}
      />
      <div className='mt-4 space-y-6'>
        <div className='flex justify-between items-center'>
          <h1 className='text-2xl font-bold'>Bill Details</h1>
          <div className='flex gap-2'>
            {/* Action Buttons */}
            {bill.status !== 'paid' && bill.status !== 'cancelled' && (
              <>
                <Button
                  variant='default'
                  size='sm'
                  onClick={() => router.push(`/billing/receipts/new?bill_id=${bill.id}`)}
                  className='bg-green-600 hover:bg-green-700'
                >
                  <CreditCard className='mr-2 h-4 w-4' /> Generate Receipt
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => router.push(`/billing/discounts/new?bill_id=${bill.id}`)}
                >
                  <Percent className='mr-2 h-4 w-4' /> Apply Discount
                </Button>
              </>
            )}
            <Button variant='outline' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' /> Back
            </Button>
          </div>
        </div>

        {/* Student and Bill Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Summary of the student bill and associated student.
            </CardDescription>
          </CardHeader>
          <CardContent className='grid md:grid-cols-2 gap-6'>
            <div>
              <h3 className='font-semibold mb-1'>Student Information</h3>
              <p>
                <strong>Name:</strong>{' '}
                {`${bill.student?.first_name} ${bill.student?.last_name}` ||
                  'N/A'}
              </p>
              <p>
                <strong>Roll No:</strong> {bill.student?.roll_number || 'N/A'}
              </p>
              <p>
                <strong>Email:</strong> {bill.student?.college_email || 'N/A'}
              </p>
              {bill.student && (
                <Button variant='link' className='p-0 h-auto' asChild>
                  <Link href={`/students/${bill.student.id}`}>
                    View Student Profile <Eye className='ml-2 h-4 w-4' />
                  </Link>
                </Button>
              )}
            </div>
            <div>
              <h3 className='font-semibold mb-1'>Bill Information</h3>
              <p>
                <strong>Bill ID:</strong> {bill.id}
              </p>
              <p>
                <strong>Description:</strong> {bill.bill_description}
              </p>
              <p>
                <strong>Status:</strong> {getStatusBadge(bill.status)}
              </p>
              <p>
                <strong>Due Date:</strong> {formatDate(bill.due_date)}
              </p>
              <p>
                <strong>Total Amount:</strong>{' '}
                {formatCurrency(bill.total_amount)}
              </p>
              <p>
                <strong>Tax Amount:</strong> {formatCurrency(bill.tax_amount)}
              </p>
              <p>
                <strong>Final Amount:</strong>{' '}
                {formatCurrency(bill.final_amount)}
              </p>
              <p>
                <strong>Net Paid Amount:</strong>{' '}
                <span className="text-green-600 font-semibold">
                  {formatCurrency(calculateNetPaidAmount(bill))}
                </span>
              </p>
              <p>
                <strong>Outstanding:</strong>{' '}
                <span className={`font-semibold ${
                  calculateOutstanding(bill) > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {formatCurrency(calculateOutstanding(bill))}
                </span>
              </p>
              {bill.status === 'overdue' && calculateOutstanding(bill) > 0 && (
                <p>
                  <strong>Overdue Amount:</strong>{' '}
                  <span className="text-red-700 font-semibold">
                    {formatCurrency(calculateOutstanding(bill))}
                  </span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions Card */}
        {bill.status !== 'paid' && bill.status !== 'cancelled' && (
          <Card className='border-2 border-blue-200 dark:border-blue-800'>
            <CardHeader className='bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950'>
              <CardTitle className='flex items-center gap-3 text-xl'>
                <div className='p-2 bg-blue-100 dark:bg-blue-900 rounded-full'>
                  <Plus className='h-6 w-6 text-blue-600 dark:text-blue-400' />
                </div>
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className='p-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div className='space-y-3'>
                  <h3 className='font-semibold text-lg flex items-center gap-2'>
                    <CreditCard className='h-5 w-5 text-green-600' />
                    Generate Receipt
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    Create a new receipt for this bill to record payment
                  </p>
                  <Button
                    onClick={() => router.push(`/billing/receipts/new?bill_id=${bill.id}`)}
                    className='w-full bg-green-600 hover:bg-green-700'
                  >
                    <CreditCard className='mr-2 h-4 w-4' />
                    Generate Receipt
                  </Button>
                </div>

                <div className='space-y-3'>
                  <h3 className='font-semibold text-lg flex items-center gap-2'>
                    <Percent className='h-5 w-5 text-orange-600' />
                    Apply Discount
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    Apply a discount to reduce the bill amount
                  </p>
                  <Button
                    variant='outline'
                    onClick={() => router.push(`/billing/discounts/new?bill_id=${bill.id}`)}
                    className='w-full border-orange-300 text-orange-600 hover:bg-orange-50'
                  >
                    <Percent className='mr-2 h-4 w-4' />
                    Apply Discount
                  </Button>
                </div>
              </div>

              {calculateOutstanding(bill) > 0 && (
                <div className='mt-4 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg'>
                  <div className='flex items-center gap-2 text-yellow-800 dark:text-yellow-200'>
                    <Receipt className='h-4 w-4' />
                    <span className='text-sm font-medium'>
                      Outstanding Amount: {formatCurrency(calculateOutstanding(bill))}
                    </span>
                  </div>
                  <p className='text-xs text-yellow-700 dark:text-yellow-300 mt-1'>
                    Generate a receipt to record payment or apply a discount to reduce the amount.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions for Paid Bills */}
        {(bill.status === 'paid' || bill.status === 'cancelled') && (
          <Card className='border-2 border-green-200 dark:border-green-800'>
            <CardHeader className='bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950'>
              <CardTitle className='flex items-center gap-3 text-xl'>
                <div className='p-2 bg-green-100 dark:bg-green-900 rounded-full'>
                  <Receipt className='h-6 w-6 text-green-600 dark:text-green-400' />
                </div>
                Bill Actions
              </CardTitle>
            </CardHeader>
            <CardContent className='p-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div className='space-y-3'>
                  <h3 className='font-semibold text-lg flex items-center gap-2'>
                    <FileText className='h-5 w-5 text-blue-600' />
                    View Details
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    {bill.status === 'paid' ? 'View payment receipts and transaction history' : 'View bill cancellation details'}
                  </p>
                  {bill.receipt_items && bill.receipt_items.length > 0 && (
                    <Button
                      variant='outline'
                      onClick={() => router.push(`/billing/receipts/${bill.receipt_items?.[0]?.receipt?.id}`)}
                      className='w-full'
                    >
                      <Receipt className='mr-2 h-4 w-4' />
                      View Receipt
                    </Button>
                  )}
                </div>

                <div className='space-y-3'>
                  <h3 className='font-semibold text-lg flex items-center gap-2'>
                    <Percent className='h-5 w-5 text-purple-600' />
                    Additional Actions
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    {bill.status === 'paid' ? 'Process refunds if needed' : 'View related documents'}
                  </p>
                  {bill.status === 'paid' && (
                    <Button
                      variant='outline'
                      onClick={() => router.push(`/billing/refunds/new?bill_id=${bill.id}`)}
                      className='w-full border-purple-300 text-purple-600 hover:bg-purple-50'
                    >
                      <ShoppingBag className='mr-2 h-4 w-4' />
                      Process Refund
                    </Button>
                  )}
                </div>
              </div>

              <div className='mt-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg'>
                <div className='flex items-center gap-2 text-green-800 dark:text-green-200'>
                  <ShieldAlert className='h-4 w-4' />
                  <span className='text-sm font-medium'>
                    Bill Status: {bill.status === 'paid' ? 'Fully Paid' : 'Cancelled'}
                  </span>
                </div>
                <p className='text-xs text-green-700 dark:text-green-300 mt-1'>
                  {bill.status === 'paid'
                    ? 'This bill has been fully paid. You can view receipts or process refunds if needed.'
                    : 'This bill has been cancelled and no further actions are required.'
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Applied Discounts Section */}
        {bill.discounts && bill.discounts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Applied Discounts</CardTitle>
              <CardDescription>Discounts applied to this bill.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Authorized By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.discounts.map((discount) => (
                    <TableRow key={discount.id}>
                      <TableCell>
                        {discount.discount_category
                          .replace('_', ' ')
                          .toUpperCase()}
                      </TableCell>
                      <TableCell>
                        {discount.discount_type.toUpperCase()}
                      </TableCell>
                      <TableCell>
                        {discount.discount_type === 'percentage'
                          ? `${discount.discount_value}%`
                          : formatCurrency(discount.discount_value)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(discount.discount_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            discount.approval_status === 'approved'
                              ? 'default'
                              : 'outline'
                          }
                          className={
                            discount.approval_status === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : ''
                          }
                        >
                          {discount.approval_status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {discount.authorizer?.full_name || 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Payments and Refunds Section */}
        {(bill.receipt_items && bill.receipt_items.length > 0) ||
        (allRefunds && allRefunds.length > 0) ? (
          <Card>
            <CardHeader>
              <CardTitle>Payments & Refunds</CardTitle>
              <CardDescription>
                Payments made towards this bill and any associated refunds.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {bill.receipt_items &&
                bill.receipt_items.map(
                  (item) =>
                    item.receipt && (
                      <div key={item.id} className='p-4 border rounded-lg'>
                        <h4 className='font-semibold mb-2 flex items-center'>
                          <Receipt className='mr-2 h-5 w-5 text-blue-600' />
                          Payment via Receipt: {item.receipt.receipt_number}
                          <Button
                            variant='outline'
                            size='sm'
                            className='ml-auto'
                            asChild
                          >
                            <Link href={`/billing/receipts/${item.receipt.id}`}>
                              View Receipt
                            </Link>
                          </Button>
                        </h4>
                        <div className='grid grid-cols-2 md:grid-cols-3 gap-2 text-sm'>
                          <p>
                            <strong>Amount Paid (for this bill):</strong>{' '}
                            {formatCurrency(item.amount_paid)}
                          </p>
                          <p>
                            <strong>Total Receipt Amount:</strong>{' '}
                            {formatCurrency(item.receipt.payment_amount)}
                          </p>
                          <p>
                            <strong>Payment Date:</strong>{' '}
                            {formatDate(item.receipt.payment_paid_date)}
                          </p>
                          <p>
                            <strong>Payment Mode:</strong>{' '}
                            {item.receipt.payment_mode
                              .replace('_', ' ')
                              .toUpperCase()}
                          </p>
                          <p>
                            <strong>Accountant:</strong>{' '}
                            {item.receipt.accountant?.full_name || 'N/A'}
                          </p>
                        </div>

                        {item.receipt.refunds &&
                          item.receipt.refunds.length > 0 && (
                            <div className='mt-3 pt-3 border-t'>
                              <h5 className='font-medium mb-2 text-orange-600 flex items-center'>
                                <ShoppingBag className='mr-2 h-5 w-5' />{' '}
                                Associated Refunds
                              </h5>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Refund ID</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Approved By</TableHead>
                                    <TableHead>Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {item.receipt.refunds.map((refund) => (
                                    <TableRow key={refund.id}>
                                      <TableCell>
                                        {refund.id.substring(0, 8)}...
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(
                                          refund.net_refund_amount
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {refund.refund_method
                                          .replace('_', ' ')
                                          .toUpperCase()}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant={
                                            refund.approval_status ===
                                            'processed'
                                              ? 'default'
                                              : refund.approval_status ===
                                                'approved'
                                              ? 'outline'
                                              : 'secondary'
                                          }
                                          className={
                                            refund.approval_status ===
                                            'processed'
                                              ? 'bg-green-500 text-white'
                                              : refund.approval_status ===
                                                'approved'
                                              ? 'border-blue-500 text-blue-600'
                                              : ''
                                          }
                                        >
                                          {refund.approval_status.toUpperCase()}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        {refund.approver?.full_name ||
                                          (refund.approval_status !==
                                            'pending' &&
                                          refund.approval_status !== 'rejected'
                                            ? 'System/Auto'
                                            : 'N/A')}
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          variant='outline'
                                          size='sm'
                                          asChild
                                        >
                                          <Link
                                            href={`/billing/refunds/${refund.id}`}
                                          >
                                            Details
                                          </Link>
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                      </div>
                    )
                )}
              {/* Display refunds not directly tied to a receipt_item for this bill but whose receipt_id matches a receipt associated with this bill. This is a fallback. */}
              {allRefunds.filter(
                (refund) =>
                  !bill.receipt_items?.some((ri) =>
                    ri.receipt?.refunds?.some((r) => r.id === refund.id)
                  )
              ).length > 0 && (
                <div className='mt-3 pt-3 border-t'>
                  <h5 className='font-medium mb-2 text-purple-600 flex items-center'>
                    <ShieldAlert className='mr-2 h-5 w-5' /> Other Associated
                    Refunds (via Receipt)
                  </h5>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Refund ID</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Approved By</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRefunds
                        .filter(
                          (refund) =>
                            !bill.receipt_items?.some((ri) =>
                              ri.receipt?.refunds?.some(
                                (r) => r.id === refund.id
                              )
                            )
                        )
                        .map((refund) => (
                          <TableRow key={refund.id}>
                            <TableCell>
                              {refund.id.substring(0, 8)}...
                            </TableCell>
                            <TableCell>
                              {formatCurrency(refund.net_refund_amount)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant='link'
                                className='p-0 h-auto'
                                asChild
                              >
                                <Link
                                  href={`/billing/receipts/${refund.receipt_id}`}
                                >
                                  {refund.receipt?.receipt_number ||
                                    refund.receipt_id.substring(0, 8)}
                                </Link>
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  refund.approval_status === 'processed'
                                    ? 'default'
                                    : refund.approval_status === 'approved'
                                    ? 'outline'
                                    : 'secondary'
                                }
                                className={
                                  refund.approval_status === 'processed'
                                    ? 'bg-green-500 text-white'
                                    : refund.approval_status === 'approved'
                                    ? 'border-blue-500 text-blue-600'
                                    : ''
                                }
                              >
                                {refund.approval_status.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {refund.approver?.full_name ||
                                (refund.approval_status !== 'pending' &&
                                refund.approval_status !== 'rejected'
                                  ? 'System/Auto'
                                  : 'N/A')}
                            </TableCell>
                            <TableCell>
                              <Button variant='outline' size='sm' asChild>
                                <Link href={`/billing/refunds/${refund.id}`}>
                                  Details
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No Payments or Refunds</CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-muted-foreground'>
                There are no payments recorded or refunds processed for this
                bill yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
