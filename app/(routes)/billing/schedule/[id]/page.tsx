'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Edit,
  Trash2,
  Receipt,
  Calendar,
  IndianRupee,
  User,
  Building,
  RefreshCw,
  ArrowLeft,
  FileText,
  Undo,
  Percent,
  CreditCard
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
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
import {
  useStudentBill,
  useDeleteStudentBill
} from '@/hooks/billing/use-student-bills';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';
import type { StudentBill } from '@/types/billing-schedule';
import { formatCurrency as utilFormatCurrency } from '@/lib/utils';

export default function StudentBillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const billId = params.id as string;

  const { data: bill, isLoading, error } = useStudentBill(billId);
  const deleteStudentBill = useDeleteStudentBill();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canEditBills = isSuperAdmin || canAccess('billing.schedule', 'update');
  const canDeleteBills =
    isSuperAdmin || canAccess('billing.schedule', 'delete');
  const canCreateRefunds =
    isSuperAdmin || canAccess('billing.refunds', 'create');

  const handleDeleteBill = async () => {
    try {
      await deleteStudentBill.mutateAsync(billId);
      router.push('/billing/schedule');
    } catch (error) {
      console.error('Error deleting bill:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      paid: { label: 'Paid', className: 'bg-green-100 text-green-800' },
      unpaid: { label: 'Unpaid', className: 'bg-orange-100 text-orange-800' },
      partially_paid: {
        label: 'Partially Paid',
        className: 'bg-blue-100 text-blue-800'
      },
      overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800' },
      cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800' },
      refunded: {
        label: 'Refunded',
        className: 'bg-purple-100 text-purple-800'
      }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.unpaid;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return utilFormatCurrency(amount, { showDecimals: true });
  };

  const calculatePaidAmount = (bill: StudentBill): number => {
    if (!bill.receipt_items || bill.receipt_items.length === 0) return 0;

    const totalPaid = bill.receipt_items.reduce(
      (total, item) => total + item.amount_paid,
      0
    );

    // Calculate total refunds for this bill
    const totalRefunded = bill.receipt_items.reduce((refundSum, item) => {
      if (item.receipt?.refunds) {
        const processedRefunds = item.receipt.refunds
          .filter((refund) => refund.approval_status === 'processed')
          .reduce((sum, refund) => sum + refund.refund_amount, 0);
        return refundSum + processedRefunds;
      }
      return refundSum;
    }, 0);

    return totalPaid - totalRefunded;
  };

  const calculateOutstanding = (bill: StudentBill): number => {
    return bill.balance_amount || 0;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Helper function to check if bill has any existing refunds
  const hasExistingRefunds = (bill: StudentBill): boolean => {
    if (!bill.receipt_items || bill.receipt_items.length === 0) {
      return false;
    }

    // Check if any receipt associated with this bill has refunds
    return bill.receipt_items.some(
      (item) => item.receipt?.refunds && item.receipt.refunds.length > 0
    );
  };

  if (isLoading) {
    return (
      <ContentLayout title='Student Bill Details'>
        <div className='flex justify-center items-center p-8'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !bill) {
    return (
      <ContentLayout title='Student Bill Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            Error loading bill details: {error?.message || 'Bill not found'}
          </p>
          <Button
            variant='outline'
            onClick={() => router.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Student Bill Details'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Bill Details', href: `/billing/schedule/${billId}` }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' onClick={() => router.back()}>
              <ArrowLeft className='h-4 w-4' />
            </Button>
            <div>
              <h1 className='text-2xl font-bold py-1'>Student Bill Details</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                View and manage student bill information
              </p>
            </div>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {/* Quick Actions for Unpaid Bills */}
            {bill.status !== 'paid' && bill.status !== 'cancelled' && (
              <>
                <Button
                  variant='default'
                  size='sm'
                  onClick={() =>
                    router.push(`/billing/receipts/new?bill_id=${billId}`)
                  }
                  className='bg-green-600 hover:bg-green-700'
                >
                  <CreditCard className='mr-2 h-4 w-4' /> Generate Receipt
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    router.push(`/billing/discounts/new?bill_id=${billId}`)
                  }
                >
                  <Percent className='mr-2 h-4 w-4' /> Apply Discount
                </Button>
              </>
            )}

            {canEditBills && (
              <Button variant='outline' asChild>
                <Link href={`/billing/schedule/${billId}/edit`}>
                  <Edit className='mr-2 h-4 w-4' />
                  Edit Bill
                </Link>
              </Button>
            )}
            {canCreateRefunds &&
              (bill.status === 'paid' || bill.status === 'partially_paid') &&
              !hasExistingRefunds(bill) && (
                <Button variant='outline' asChild>
                  <Link href={`/billing/refunds/new?bill_id=${billId}`}>
                    <Undo className='mr-2 h-4 w-4' />
                    Generate Refund
                  </Link>
                </Button>
              )}
            {canCreateRefunds &&
              (bill.status === 'paid' || bill.status === 'partially_paid') &&
              hasExistingRefunds(bill) && (
                <Button
                  variant='outline'
                  disabled
                  title='Refund already exists for this bill'
                >
                  <Undo className='mr-2 h-4 w-4' />
                  Refund Generated
                </Button>
              )}
            {canDeleteBills && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant='destructive'>
                    <Trash2 className='mr-2 h-4 w-4' />
                    Delete Bill
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Student Bill</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this bill? This action
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteBill}
                      className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    >
                      Delete Bill
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          {/* Left Column */}
          <div className='space-y-6'>
            {/* Student Information */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <User className='h-5 w-5' />
                  Student Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Student Name
                    </label>
                    <p className='font-medium'>
                      {`${bill.student?.first_name} ${bill.student?.last_name}`}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Roll Number
                    </label>
                    <p className='font-medium'>{bill.student?.roll_number}</p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Institution Email
                    </label>
                    <p className='font-medium'>
                      {bill.student?.college_email || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Mobile
                    </label>
                    <p className='font-medium'>
                      {bill.student?.student_mobile || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Academic Information */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Building className='h-5 w-5' />
                  Academic Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Institution
                    </label>
                    <p className='font-medium'>
                      {bill.institution?.name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Degree
                    </label>
                    <p className='font-medium'>
                      {bill.student?.degree?.degree_name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Department
                    </label>
                    <p className='font-medium'>
                      {bill.student?.department?.department_name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Semester
                    </label>
                    <p className='font-medium'>
                      {bill.student?.semester?.semester_name || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bill Details */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileText className='h-5 w-5' />
                  Bill Details
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Item Category
                  </label>
                  <p className='font-medium'>
                    {bill.item_category?.item_category_name || 'N/A'}
                  </p>
                  {bill.item_category?.parent_category && (
                    <p className='text-sm text-muted-foreground'>
                      Parent:{' '}
                      {bill.item_category.parent_category.parent_category_name}
                    </p>
                  )}
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Bill Amount
                    </label>
                    <p className='font-medium text-lg'>
                      {formatCurrency(bill.final_amount)}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Due Date
                    </label>
                    <div className='flex items-center gap-2'>
                      <Calendar className='h-4 w-4 text-muted-foreground' />
                      <p className='font-medium'>{formatDate(bill.due_date)}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Status
                  </label>
                  <div>{getStatusBadge(bill.status)}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className='space-y-6'>
            {/* Amount Details */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <IndianRupee className='h-5 w-5' />
                  Amount Details
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Quantity
                    </label>
                    <p className='font-medium'>{bill.quantity}</p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Unit Amount
                    </label>
                    <p className='font-medium'>
                      {formatCurrency(bill.unit_amount)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className='space-y-2'>
                  <div className='flex justify-between'>
                    <span className='text-sm'>Total Amount:</span>
                    <span className='font-medium'>
                      {formatCurrency(bill.total_amount)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-sm'>Tax Amount:</span>
                    <span className='font-medium'>
                      {formatCurrency(bill.tax_amount)}
                    </span>
                  </div>
                  <div className='flex justify-between font-medium text-lg border-t pt-2'>
                    <span>Final Amount:</span>
                    <span>{formatCurrency(bill.final_amount)}</span>
                  </div>
                  <div className='flex justify-between text-green-600 font-medium'>
                    <span>Net Paid Amount:</span>
                    <span>{formatCurrency(calculatePaidAmount(bill))}</span>
                  </div>
                  <div
                    className={`flex justify-between font-medium ${
                      calculateOutstanding(bill) > 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    <span>Outstanding:</span>
                    <span>{formatCurrency(calculateOutstanding(bill))}</span>
                  </div>
                  {bill.status === 'overdue' &&
                    calculateOutstanding(bill) > 0 && (
                      <div className='flex justify-between text-red-700 font-bold'>
                        <span>Overdue:</span>
                        <span>
                          {formatCurrency(calculateOutstanding(bill))}
                        </span>
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>

            {/* Recurring Information */}
            {bill.is_recurring && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <RefreshCw className='h-5 w-5' />
                    Recurring Information
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='text-sm font-medium text-muted-foreground'>
                        Pattern
                      </label>
                      <p className='font-medium capitalize'>
                        {bill.recurrence_pattern}
                      </p>
                    </div>
                    <div>
                      <label className='text-sm font-medium text-muted-foreground'>
                        Recurrences
                      </label>
                      <p className='font-medium'>
                        {bill.number_of_recurrences}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment Information */}
            {bill.payment_date && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Receipt className='h-5 w-5' />
                    Payment Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Payment Date
                    </label>
                    <p className='font-medium'>
                      {formatDate(bill.payment_date)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Audit Information */}
            <Card>
              <CardHeader>
                <CardTitle>Audit Information</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Created At
                    </label>
                    <p className='font-medium'>{formatDate(bill.created_at)}</p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Updated At
                    </label>
                    <p className='font-medium'>{formatDate(bill.updated_at)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
