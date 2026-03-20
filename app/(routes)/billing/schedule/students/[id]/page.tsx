'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  FileText,
  Calendar,
  Phone,
  Mail,
  User,
  Building,
  GraduationCap,
  Filter,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  IndianRupee,
  CreditCard
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import {
  useStudentForBilling,
  useStudentBillingSummary
} from '@/hooks/billing/use-student-search';
import { StudentBillsTable } from './_components/student-bills-table';
import { StudentTransactionHistory } from './_components/student-transaction-history';
import { StudentReceiptsTable } from './_components/student-receipts-table';
import { PaymentSelectionModal } from '@/components/billing/payment-selection-modal';
import { toast } from 'react-hot-toast';

export default function StudentBillingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;
  const { profile } = useAuth();

  // Check if user is a student
  const isStudent = profile?.role === 'student';

  const [billStatusFilter, setBillStatusFilter] = useState<string>('all');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const previousBillCountRef = useRef<number | null>(null);

  const {
    data: student,
    isLoading: isLoadingStudent,
    error: studentError
  } = useStudentForBilling(studentId);

  const {
    data: billingSummary,
    isLoading: isLoadingSummary,
    error: summaryError,
    refetch: refetchSummary,
    isRefetching: isRefetchingSummary
  } = useStudentBillingSummary(studentId);

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewBills = isSuperAdmin || canAccess('billing.schedule', 'view');
  const canCreateBills =
    isSuperAdmin || canAccess('billing.schedule', 'create');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      paid: {
        variant: 'default' as const,
        className:
          'bg-green-100 text-green-800 border-green-200 hover:bg-green-200'
      },
      unpaid: {
        variant: 'secondary' as const,
        className:
          'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200'
      },
      partially_paid: {
        variant: 'outline' as const,
        className:
          'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200'
      },
      overdue: {
        variant: 'destructive' as const,
        className: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200'
      },
      cancelled: {
        variant: 'outline' as const,
        className: 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
      },
      refunded: {
        variant: 'outline' as const,
        className:
          'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200'
      }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.unpaid;
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  // Track bill count changes and show notifications for real-time updates
  useEffect(() => {
    if (billingSummary?.summary?.total_bills !== undefined) {
      const currentBillCount = billingSummary.summary.total_bills;

      if (
        previousBillCountRef.current !== null &&
        currentBillCount > previousBillCountRef.current
      ) {
        const newBillsCount = currentBillCount - previousBillCountRef.current;
        toast.success(
          `${newBillsCount} new bill${newBillsCount > 1 ? 's' : ''} added!`,
          {
            duration: 3000,
            position: 'top-right',
            icon: '✅'
          }
        );
      }

      previousBillCountRef.current = currentBillCount;
    }
  }, [billingSummary?.summary?.total_bills]);

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Student Billing Details'>
        <div className='flex items-center justify-center min-h-[60vh]'>
          <div className='text-center space-y-4'>
            <BeatLoader color='#00e902' size={12} />
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (!canViewBills) {
    return (
      <ContentLayout title='Student Billing Details'>
        <div className='flex items-center justify-center min-h-[60vh]'>
          <Card className='w-full max-w-md'>
            <CardContent className='text-center py-8'>
              <AlertCircle className='h-12 w-12 text-destructive mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>Access Denied</h3>
              <p className='text-muted-foreground mb-4'>
                You don&apos;t have permission to view student billing details.
              </p>
              <Button variant='outline' onClick={() => router.back()}>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (studentError || summaryError) {
    return (
      <ContentLayout title='Student Billing Details'>
        <div className='flex items-center justify-center min-h-[60vh]'>
          <Card className='w-full max-w-md'>
            <CardContent className='text-center py-8'>
              <AlertCircle className='h-12 w-12 text-destructive mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>Error Loading Data</h3>
              <p className='text-muted-foreground mb-4'>
                {studentError?.message || summaryError?.message}
              </p>
              <div className='space-x-2'>
                <Button variant='outline' onClick={() => router.back()}>
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  Go Back
                </Button>
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw className='mr-2 h-4 w-4' />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (isLoadingStudent || isLoadingSummary) {
    return (
      <ContentLayout title='Student Billing Details'>
        <div className='flex items-center justify-center min-h-[60vh]'>
          <div className='text-center space-y-4'>
            <BeatLoader color='#00e902' size={12} />
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (!student || !billingSummary) {
    return (
      <ContentLayout title='Student Billing Details'>
        <div className='flex items-center justify-center min-h-[60vh]'>
          <Card className='w-full max-w-md'>
            <CardContent className='text-center py-8'>
              <User className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>Student Not Found</h3>
              <p className='text-muted-foreground mb-4'>
                The requested student could not be found in the system.
              </p>
              <Button variant='outline' onClick={() => router.back()}>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Student Billing Details'>
      <div className='space-y-4 sm:space-y-6'>
        {/* Breadcrumb */}
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Billing', href: '/billing/schedule' },
            { label: 'Students', href: '/billing/schedule/students' },
            {
              label:
                [student.first_name, student.last_name]
                  .filter(Boolean)
                  .join(' ') || 'N/A',
              href: `/billing/schedule/students/${studentId}`
            }
          ]}
        />

        {/* Header Section */}
        <div className='flex flex-col sm:flex-row justify-between gap-4'>
          {/* Title and Back Button */}
          <div className='flex items-center gap-3'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => router.back()}
              className='shrink-0'
            >
              <ArrowLeft className='h-4 w-4' />
            </Button>
            <div className='min-w-0 flex-1'>
              <h1 className='text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate'>
                {[student.first_name, student.last_name]
                  .filter(Boolean)
                  .join(' ') || 'N/A'}
              </h1>
              <p className='text-sm text-muted-foreground mt-1 sm:block'>
                Student billing information and transaction history
              </p>
            </div>
          </div>

          {/* Schedule Bill Button - Full width on mobile - Hidden for students */}
          {!isStudent && canCreateBills && (
            <Button asChild className='w-full sm:w-auto sm:self-start'>
              <Link href={`/billing/schedule/new?student_id=${studentId}`}>
                <Plus className='mr-2 h-4 w-4' />
                Schedule Bill
              </Link>
            </Button>
          )}
        </div>

        {/* Student Profile Card - Redesigned for Mobile */}
        <Card className='overflow-hidden'>
          <CardHeader className='bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950'>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <User className='h-5 w-5' />
              Student Profile
            </CardTitle>
          </CardHeader>
          <CardContent className='p-4 sm:p-6'>
            <div className='flex flex-col space-y-6'>
              {/* Student Avatar and Basic Info */}
              <div className='flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6'>
                <Avatar className='h-20 w-20 sm:h-16 sm:w-16'>
                  <AvatarFallback className='text-lg font-semibold bg-gradient-to-br from-blue-400 to-indigo-600 text-white'>
                    {[student.first_name, student.last_name]
                      .filter(Boolean)
                      .map((n) => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <div className='text-center sm:text-left space-y-2 flex-1'>
                  <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                    {[student.first_name, student.last_name]
                      .filter(Boolean)
                      .join(' ') || 'N/A'}
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    Roll No: {student.roll_number || 'N/A'}
                  </p>
                  <div className='flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-4'>
                    <a
                      href={`mailto:${student.college_email}`}
                      className='flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline break-all'
                    >
                      <Mail className='h-3 w-3 shrink-0' />
                      <span className='truncate'>{student.college_email}</span>
                    </a>
                    <a
                      href={`tel:${student.mobile_number}`}
                      className='flex items-center gap-2 text-sm text-green-600 hover:text-green-800 hover:underline'
                    >
                      <Phone className='h-3 w-3 shrink-0' />
                      {student.mobile_number}
                    </a>
                  </div>
                </div>
              </div>

              {/* Academic Information */}
              <div className='space-y-4'>
                <h4 className='font-semibold text-sm text-gray-700 dark:text-gray-300 uppercase tracking-wide border-b pb-2'>
                  Academic Information
                </h4>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                  <div className='flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800'>
                    <Building className='h-4 w-4 text-indigo-600 shrink-0' />
                    <div className='min-w-0 flex-1'>
                      <p className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                        Institution
                      </p>
                      <p className='text-sm text-muted-foreground truncate'>
                        {student.institution?.name || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className='flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800'>
                    <GraduationCap className='h-4 w-4 text-purple-600 shrink-0' />
                    <div className='min-w-0 flex-1'>
                      <p className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                        Degree
                      </p>
                      <p className='text-sm text-muted-foreground truncate'>
                        {student.degree?.degree_name || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className='flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800'>
                    <GraduationCap className='h-4 w-4 text-orange-600 shrink-0' />
                    <div className='min-w-0 flex-1'>
                      <p className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                        Department
                      </p>
                      <p className='text-sm text-muted-foreground truncate'>
                        {student.department?.department_name || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className='flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800'>
                    <GraduationCap className='h-4 w-4 text-blue-600 shrink-0' />
                    <div className='min-w-0 flex-1'>
                      <p className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                        Program
                      </p>
                      <p className='text-sm text-muted-foreground truncate'>
                        {student.program?.program_name || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className='flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800'>
                    <Calendar className='h-4 w-4 text-teal-600 shrink-0' />
                    <div className='min-w-0 flex-1'>
                      <p className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                        Current Semester
                      </p>
                      <p className='text-sm text-muted-foreground truncate'>
                        {student.semester?.semester_name || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className='flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800'>
                    <User className='h-4 w-4 text-green-600 shrink-0' />
                    <div className='min-w-0 flex-1'>
                      <p className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                        Section
                      </p>
                      <p className='text-sm text-muted-foreground truncate'>
                        {student.section?.section_name || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student Summary Cards */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
          <Card>
            <CardContent className='p-3 sm:p-4'>
              <div className='flex items-center justify-between'>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm text-muted-foreground'>Total Bills</p>
                  <p className='text-xl sm:text-2xl font-bold'>
                    {billingSummary.summary.total_bills}
                  </p>
                </div>
                <FileText className='h-6 w-6 sm:h-8 sm:w-8 text-blue-600 shrink-0' />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='p-3 sm:p-4'>
              <div className='flex items-center justify-between'>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm text-muted-foreground'>
                    Net Paid Amount
                  </p>
                  {(() => {
                    const totalReceiptAmount =
                      billingSummary.receipts?.reduce(
                        (sum, receipt) => sum + receipt.payment_amount,
                        0
                      ) || 0;

                    const totalProcessedRefunds =
                      billingSummary.refunds
                        ?.filter((r) => r.approval_status === 'processed')
                        .reduce((sum, r) => sum + r.refund_amount, 0) || 0;

                    const netPaidAmount = billingSummary.summary.paid_amount;
                    const isFullyRefunded =
                      totalProcessedRefunds > 0 && netPaidAmount <= 0;
                    const hasRefunds = totalProcessedRefunds > 0;

                    if (isFullyRefunded) {
                      return (
                        <div className='space-y-1'>
                          <p className='text-xl sm:text-2xl font-bold text-gray-500'>
                            {formatCurrency(0)}
                          </p>
                          <div className='text-xs space-y-1'>
                            <div className='text-gray-600'>
                              <span className='line-through'>
                                Originally Paid:{' '}
                                {formatCurrency(totalReceiptAmount)}
                              </span>
                            </div>
                            <div className='text-red-600 font-medium'>
                              Fully Refunded: -
                              {formatCurrency(totalProcessedRefunds)}
                            </div>
                            <div className='text-orange-600 font-medium text-sm'>
                              ✓ Payment Fully Refunded
                            </div>
                          </div>
                        </div>
                      );
                    } else if (hasRefunds) {
                      return (
                        <div className='space-y-1'>
                          <p className='text-xl sm:text-2xl font-bold text-green-600'>
                            {formatCurrency(netPaidAmount)}
                          </p>
                          <div className='text-xs text-muted-foreground space-y-1'>
                            <div>
                              <span>Original Payment: </span>
                              <span className='text-blue-600 font-medium'>
                                {formatCurrency(totalReceiptAmount)}
                              </span>
                            </div>
                            <div>
                              <span>Refunded: </span>
                              <span className='text-red-600 font-medium'>
                                -{formatCurrency(totalProcessedRefunds)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <p className='text-xl sm:text-2xl font-bold text-green-600'>
                          {formatCurrency(netPaidAmount)}
                        </p>
                      );
                    }
                  })()}
                </div>
                <CreditCard
                  className={`h-6 w-6 sm:h-8 sm:w-8 shrink-0 ${
                    billingSummary.summary.paid_amount <= 0 &&
                    billingSummary.summary.refund_amount > 0
                      ? 'text-gray-500'
                      : 'text-green-600'
                  }`}
                />
              </div>
            </CardContent>
          </Card>

          <Card className='hover:shadow-md transition-shadow'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                Outstanding
              </CardTitle>
              <IndianRupee className='h-4 w-4 text-orange-600' />
            </CardHeader>
            <CardContent>
              <div className='text-xl sm:text-2xl font-bold text-orange-600'>
                {formatCurrency(billingSummary.summary.outstanding_amount)}
              </div>
              <p className='text-xs text-muted-foreground'>Pending dues</p>
            </CardContent>
          </Card>

          <Card className='hover:shadow-md transition-shadow'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                Overdue
              </CardTitle>
              <TrendingDown className='h-4 w-4 text-red-600' />
            </CardHeader>
            <CardContent>
              <div className='text-xl sm:text-2xl font-bold text-red-600'>
                {formatCurrency(billingSummary.summary.overdue_amount)}
              </div>
              <p className='text-xs text-muted-foreground'>Past due date</p>
            </CardContent>
          </Card>
        </div>

        {/* Billing Details Tabs - Enhanced for Mobile */}
        <Card className='overflow-hidden'>
          <CardContent className='p-0'>
            <Tabs defaultValue='bills' className='w-full'>
              {/* Tab Header with Filter */}
              <div className='flex flex-col gap-4 p-4 sm:p-6 bg-gray-50 dark:bg-gray-800 border-b'>
                <TabsList className='grid w-full grid-cols-3'>
                  <TabsTrigger value='bills' className='text-xs sm:text-sm'>
                    Bills
                  </TabsTrigger>
                  <TabsTrigger value='receipts' className='text-xs sm:text-sm'>
                    Receipts
                  </TabsTrigger>
                  <TabsTrigger
                    value='transactions'
                    className='text-xs sm:text-sm'
                  >
                    History
                  </TabsTrigger>
                </TabsList>

                <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2'>
                  <div className='flex items-center gap-2 flex-1'>
                    <Filter className='h-4 w-4 text-muted-foreground shrink-0' />
                    <Select
                      value={billStatusFilter}
                      onValueChange={setBillStatusFilter}
                    >
                      <SelectTrigger className='w-full sm:w-40'>
                        <SelectValue placeholder='Filter by status' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>All Bills</SelectItem>
                        <SelectItem value='paid'>Paid</SelectItem>
                        <SelectItem value='unpaid'>Unpaid</SelectItem>
                        <SelectItem value='partially_paid'>
                          Partially Paid
                        </SelectItem>
                        <SelectItem value='overdue'>Overdue</SelectItem>
                        <SelectItem value='cancelled'>Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='flex gap-2'>
                    {/* Pay Online Button - Hidden for students */}
                    {!isStudent && (
                      <Button
                        variant='default'
                        size='sm'
                        onClick={() => setShowPaymentModal(true)}
                        disabled={billingSummary.summary.outstanding_amount <= 0}
                        className='w-full sm:w-auto'
                      >
                        <CreditCard className='h-4 w-4' />
                        <span className='ml-2'>Pay Online</span>
                      </Button>
                    )}
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        console.log('Manual refresh triggered');
                        refetchSummary();
                      }}
                      disabled={isRefetchingSummary}
                      title={
                        isRefetchingSummary
                          ? 'Refreshing...'
                          : 'Refresh billing data'
                      }
                      className='w-full sm:w-auto'
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${
                          isRefetchingSummary ? 'animate-spin' : ''
                        }`}
                      />
                      {isRefetchingSummary ? (
                        <span className='ml-2'>Refreshing...</span>
                      ) : (
                        <span className='ml-2 sm:hidden'>Refresh</span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Tab Content */}
              <div className='p-3 sm:p-6'>
                <TabsContent value='bills' className='mt-0 space-y-4'>
                  <StudentBillsTable
                    bills={billingSummary.bills}
                    statusFilter={billStatusFilter}
                    onRefresh={refetchSummary}
                    isStudentView={isStudent}
                  />
                </TabsContent>

                <TabsContent value='receipts' className='mt-0 space-y-4'>
                  <StudentReceiptsTable
                    receipts={billingSummary.receipts}
                    onRefresh={refetchSummary}
                  />
                </TabsContent>

                <TabsContent value='transactions' className='mt-0 space-y-4'>
                  <StudentTransactionHistory
                    summary={billingSummary}
                    onRefresh={refetchSummary}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {/* Payment Selection Modal */}
        <PaymentSelectionModal
          open={showPaymentModal}
          onOpenChange={setShowPaymentModal}
          bills={billingSummary.bills}
          studentId={studentId}
        />
      </div>
    </ContentLayout>
  );
}
