'use client';


import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  FileText,
  Phone,
  Mail,
  User,
  Filter,
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
import { RefundInitiateDialog } from './_components/refund-initiate-dialog';
import { StudentRefundHistory } from './_components/student-refund-history';
import { ReevaluateStatusButton } from './_components/reevaluate-status-button';
import { PaymentSelectionModal } from '@/components/billing/payment-selection-modal';
import { QuickReceiptDialog } from '../../../receipts/_components/quick-receipt-dialog';
import { isBillableBill } from '@/lib/billing/bill-status';
import { toast } from 'react-hot-toast';

export default function StudentBillingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = params.id as string;
  const { profile } = useAuth();

  // 2026-05-21: tab is now URL-driven so the receipt-create flow can
  // deep-link the user back here onto the Receipts tab. Only three valid
  // tab values; fall back to 'bills' on anything else (or no param).
  const initialTab = ((): 'bills' | 'receipts' | 'transactions' => {
    const t = searchParams.get('tab');
    if (t === 'receipts' || t === 'transactions') return t;
    return 'bills';
  })();

  const returnTo = searchParams.get('returnTo') || undefined;

  // Check if user is a student
  const isStudent = profile?.role === 'student';

  const [billStatusFilter, setBillStatusFilter] = useState<string>('all');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  // Non-null = the Collect Payment popup is showing, for these bills. Keeps the
  // operator on this page instead of navigating to /billing/receipts/new and
  // losing the tab, filter and scroll position they were working in.
  const [receiptBillIds, setReceiptBillIds] = useState<string[] | null>(null);
  const previousBillCountRef = useRef<number | null>(null);

  const {
    data: student,
    isLoading: isLoadingStudent,
    error: studentError
    // Read-only page: load the learner even when their lifecycle left the
    // billable set (rejected/withdrawn) — their existing bills must stay
    // viewable for cancellation/refund work.
  } = useStudentForBilling(studentId, { includeNonBillable: true });

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
  // bulk_create rather than create/update: those two are held by 68 roles each
  // (the billing namespace is broadly over-granted), while bulk_create is the
  // narrow operator-batch key — 13 roles, the accounts/admin set. Re-running the
  // automatic status check is that same kind of operator action.
  const canReevaluateStatus =
    isSuperAdmin || canAccess('billing.schedule', 'bulk_create');

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

  // Task 12: sum of billing_student_bills.refunded_amount disbursed via the
  // refund-request workflow (fn_disburse_refund_request) — separate from the
  // legacy billing_refunds table already netted into summary.paid_amount.
  const totalRefundedAmount = billingSummary.bills.reduce(
    (sum, bill) => sum + Number(bill.refunded_amount ?? 0),
    0
  );

  // summary.total_bills is a raw row count from the service and includes
  // cancelled/superseded bills, so the card read "2 bills" for a learner with
  // one live bill and one cancelled one.
  const billableBillCount = billingSummary.bills.filter(isBillableBill).length;

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
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className='text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate'>
                  {[student.first_name, student.last_name]
                    .filter(Boolean)
                    .join(' ') || 'N/A'}
                </h1>
                {/* 2026-05-21: lifecycle badge so accounts team sees the
                 *  learner's current state (account → reserved → admitted →
                 *  active) alongside the name without flipping to enquiry. */}
                {student.lifecycle_status && (
                  <Badge
                    variant='outline'
                    className={(() => {
                      switch (student.lifecycle_status) {
                        case 'account':
                          return 'bg-amber-50 text-amber-800 border-amber-200';
                        case 'reserved':
                          return 'bg-purple-50 text-purple-700 border-purple-200';
                        case 'admitted':
                          return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        case 'active':
                          return 'bg-emerald-100 text-emerald-800 border-emerald-300';
                        default:
                          return 'bg-muted text-muted-foreground border-input';
                      }
                    })()}
                  >
                    {student.lifecycle_status
                      .split('_')
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ')}
                  </Badge>
                )}
              </div>
              <p className='text-sm text-muted-foreground mt-1 sm:block'>
                Student billing information and transaction history
              </p>
            </div>
          </div>

          {/* Header Actions - Full width on mobile - Hidden for students */}
          {!isStudent && (
            <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:self-start'>
              {canCreateBills && (
                <Button asChild className='w-full sm:w-auto'>
                  <Link href={`/billing/schedule/new?student_id=${studentId}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`}>
                    <Plus className='mr-2 h-4 w-4' />
                    Schedule Bill
                  </Link>
                </Button>
              )}
              {canReevaluateStatus && (
                <ReevaluateStatusButton
                  studentId={studentId}
                  lifecycleStatus={student.lifecycle_status}
                  onEvaluated={() => {
                    // The lifecycle badge in this header is driven by the
                    // summary query, so a promotion is invisible without this.
                    refetchSummary();
                  }}
                />
              )}
              <RefundInitiateDialog
                studentId={studentId}
                institutionId={student.institution_id}
                institutionName={student.institution?.name || 'Unknown Institution'}
                studentName={[student.first_name, student.last_name].filter(Boolean).join(' ')}
              />
            </div>
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

              {/* Academic Information — dense definition grid.
                  This was eleven padded icon tiles in a 2-column grid plus a
                  whole separate Card for the single Accommodation field:
                  ~470 px of vertical space to show eleven short strings, which
                  pushed the bill tables (the reason accounts opens this page)
                  below the fold on a laptop.

                  Same eleven facts, now a label-over-value grid that reflows
                  from 2 columns on a phone to 6 on a wide screen, in roughly a
                  third of the height. Accommodation folds in as a twelfth cell
                  rather than owning a card. The icons are gone deliberately —
                  they were decorative (three different fields shared the same
                  GraduationCap) and each one cost 16 px of row height. */}
              <div className='space-y-2'>
                <h4 className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                  Academic Information
                </h4>
                <dl className='grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'>
                  {(
                    [
                      ['Institution', student.institution?.name],
                      // Admission year is the cohort the learner joined in and
                      // never changes; Academic Year is the year they are
                      // currently billed against. Accounts needs both to tell
                      // an arrears bill from a current-year one.
                      [
                        'Admission Year',
                        student.admission_year?.admission_year_name ||
                          (student.admission_year?.year != null
                            ? String(student.admission_year.year)
                            : undefined)
                      ],
                      ['Academic Year', student.academic_year?.academic_year_name],
                      ['Degree', student.degree?.degree_name],
                      ['Department', student.department?.department_name],
                      ['Program', student.program?.program_name],
                      ['Semester', student.semester?.semester_name],
                      ['Section', student.section?.section_name],
                      // Quota and Community are the dimensions a fee structure
                      // is matched on, so when a learner shows the wrong fee
                      // (or "no fee structure configured") these two are the
                      // first thing accounts checks. Both are FK-only on
                      // learners_profiles — the legacy text columns were
                      // dropped.
                      ['Quota', student.quota?.name],
                      ['Community', student.community_category?.code],
                      // gender is free text on learners_profiles with no CHECK
                      // and mixed casing (FEMALE / male / Male) plus
                      // empty-string rows, so lower-case it and let the
                      // `capitalize` class render one form.
                      ['Gender', student.gender?.trim().toLowerCase()],
                      ['Accommodation', student.accommodation_type?.name]
                    ] as [string, string | undefined][]
                  ).map(([label, value]) => (
                    <div key={label} className='min-w-0'>
                      <dt className='text-[11px] uppercase tracking-wide text-muted-foreground'>
                        {label}
                      </dt>
                      <dd
                        className={`truncate text-sm font-medium ${
                          label === 'Gender' ? 'capitalize' : ''
                        }`}
                        title={value || 'N/A'}
                      >
                        {value || 'N/A'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student Summary Cards */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
          <Card className='hover:shadow-md transition-shadow'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                Total Fees
              </CardTitle>
              <IndianRupee className='h-4 w-4 text-blue-600' />
            </CardHeader>
            <CardContent>
              {/* Void bills (cancelled AND superseded) are excluded. This
                  previously excluded only superseded, so a cancelled bill still
                  inflated Total Fees for an amount the learner does not owe. */}
              <div className='text-xl sm:text-2xl font-bold text-blue-600'>
                {formatCurrency(
                  billingSummary.bills.reduce(
                    (sum, bill) => sum + (isBillableBill(bill) ? bill.final_amount : 0),
                    0
                  )
                )}
              </div>
              <p className='text-xs text-muted-foreground'>
                {/* Counted from the bill list rather than summary.total_bills,
                    which is a raw row count and includes void bills. */}
                {billableBillCount} bill{billableBillCount !== 1 ? 's' : ''}
              </p>
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

                    const netPaidAmount =
                      billingSummary.summary.paid_amount - totalRefundedAmount;
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

          {/* Task 12: only shown once a refund-workflow disbursement has
           *  actually posted refunded_amount onto a bill. */}
          {totalRefundedAmount > 0 && (
            <Card className='hover:shadow-md transition-shadow'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  Refunded
                </CardTitle>
                <IndianRupee className='h-4 w-4 text-red-600' />
              </CardHeader>
              <CardContent>
                <div className='text-xl sm:text-2xl font-bold text-red-600'>
                  {formatCurrency(totalRefundedAmount)}
                </div>
                <p className='text-xs text-muted-foreground'>Disbursed refunds</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Billing Details Tabs - Enhanced for Mobile */}
        <Card className='overflow-hidden'>
          <CardContent className='p-0'>
            <Tabs defaultValue={initialTab} className='w-full'>
              {/* Tab Header with Filter */}
              <div className='flex flex-col gap-4 p-4 sm:p-6 bg-gray-50 dark:bg-gray-800 border-b'>
                <TabsList className='flex w-full justify-start gap-1 overflow-x-auto sm:grid sm:grid-cols-3 sm:gap-0 sm:overflow-visible'>
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
                    onGenerateReceipt={(billIds) =>
                      setReceiptBillIds(billIds)
                    }
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

        {/* Refund Requests — only renders once this student has ≥1 request */}
        <StudentRefundHistory studentId={studentId} />

        {/* Payment Selection Modal */}
        <PaymentSelectionModal
          open={showPaymentModal}
          onOpenChange={setShowPaymentModal}
          bills={billingSummary.bills}
          studentId={studentId}
        />

        {/* Collect Payment — same form as /billing/receipts/new, in place */}
        <QuickReceiptDialog
          open={receiptBillIds !== null}
          onOpenChange={(receiptOpen) => {
            if (!receiptOpen) setReceiptBillIds(null);
          }}
          billIds={receiptBillIds ?? []}
          studentId={studentId}
          studentName={
            [student.first_name, student.last_name]
              .filter(Boolean)
              .join(' ') || undefined
          }
          subtitle={
            student.roll_number ? `Roll ${student.roll_number}` : undefined
          }
          onGenerated={() => {
            setReceiptBillIds(null);
            refetchSummary();
          }}
        />
      </div>
    </ContentLayout>
  );
}
