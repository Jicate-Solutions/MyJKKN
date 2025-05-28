'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Edit,
  Trash2,
  Receipt,
  Calendar,
  DollarSign,
  User,
  Building,
  RefreshCw,
  ArrowLeft,
  FileText
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
      cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800' }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.unpaid;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
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
          { label: 'Billing', href: '/billing' },
          { label: 'Schedule', href: '/billing/schedule' },
          { label: 'Bill Details', href: `/billing/schedule/${billId}` }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
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
            {canEditBills && (
              <Button variant='outline' asChild>
                <Link href={`/billing/schedule/${billId}/edit`}>
                  <Edit className='mr-2 h-4 w-4' />
                  Edit Bill
                </Link>
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
                    <p className='font-medium'>{bill.student?.student_name}</p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Roll Number
                    </label>
                    <p className='font-medium'>{bill.student?.roll_number}</p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Email
                    </label>
                    <p className='font-medium'>{bill.student?.student_email}</p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Mobile
                    </label>
                    <p className='font-medium'>
                      {bill.student?.student_mobile}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Institution Information */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Building className='h-5 w-5' />
                  Institution Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Institution Name
                    </label>
                    <p className='font-medium'>{bill.institution?.name}</p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Counselling Code
                    </label>
                    <p className='font-medium'>
                      {bill.institution?.counselling_code}
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
                    {bill.item_category?.item_category_name}
                  </p>
                  {bill.item_category?.parent_category && (
                    <p className='text-sm text-muted-foreground'>
                      Parent:{' '}
                      {bill.item_category.parent_category.parent_category_name}
                    </p>
                  )}
                </div>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Description
                  </label>
                  <p className='font-medium'>{bill.bill_description}</p>
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Due Date
                    </label>
                    <div className='flex items-center gap-2'>
                      <Calendar className='h-4 w-4 text-muted-foreground' />
                      <p className='font-medium'>{formatDate(bill.due_date)}</p>
                    </div>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Status
                    </label>
                    <div>{getStatusBadge(bill.status)}</div>
                  </div>
                </div>
                {bill.remarks && (
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Remarks
                    </label>
                    <p className='font-medium'>{bill.remarks}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className='space-y-6'>
            {/* Amount Details */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <DollarSign className='h-5 w-5' />
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
                  {bill.status === 'partially_paid' && (
                    <div className='flex justify-between text-orange-600 font-medium'>
                      <span>Balance Amount:</span>
                      <span>{formatCurrency(bill.balance_amount)}</span>
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
