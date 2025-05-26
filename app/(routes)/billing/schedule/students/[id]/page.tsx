'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Receipt,
  Percent,
  RefreshCw,
  FileText,
  Eye,
  Calendar,
  Phone,
  Mail,
  MapPin,
  User,
  Building,
  GraduationCap,
  Filter
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
import { BeatLoader } from 'react-spinners';
import {
  useStudentForBilling,
  useStudentBillingSummary
} from '@/hooks/billing/use-student-search';
import { StudentBillsTable } from './_components/student-bills-table';
import { StudentTransactionHistory } from './_components/student-transaction-history';
import { StudentReceiptsTable } from './_components/student-receipts-table';

export default function StudentBillingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;

  const [billStatusFilter, setBillStatusFilter] = useState<string>('all');

  const {
    data: student,
    isLoading: isLoadingStudent,
    error: studentError
  } = useStudentForBilling(studentId);

  const {
    data: billingSummary,
    isLoading: isLoadingSummary,
    error: summaryError,
    refetch: refetchSummary
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
        className: 'bg-green-100 text-green-800 border-green-200'
      },
      unpaid: {
        variant: 'secondary' as const,
        className: 'bg-orange-100 text-orange-800 border-orange-200'
      },
      partially_paid: {
        variant: 'outline' as const,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      overdue: {
        variant: 'destructive' as const,
        className: 'bg-red-100 text-red-800 border-red-200'
      },
      cancelled: {
        variant: 'outline' as const,
        className: 'bg-gray-100 text-gray-800 border-gray-200'
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

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Student Billing Search'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewBills) {
    return (
      <ContentLayout title='Student Billing Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view student billing details.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (studentError || summaryError) {
    return (
      <ContentLayout title='Student Billing Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            Error loading student details:{' '}
            {studentError?.message || summaryError?.message}
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

  if (isLoadingStudent || isLoadingSummary) {
    return (
      <ContentLayout title='Student Billing Details'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!student || !billingSummary) {
    return (
      <ContentLayout title='Student Billing Details'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>Student not found.</p>
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
    <ContentLayout title='Student Billing Details'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Schedule', href: '/billing/schedule' },
          { label: 'Students', href: '/billing/schedule/students' },
          {
            label: student.student_name,
            href: `/billing/schedule/students/${studentId}`
          }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <div>
              <h1 className='text-2xl font-bold py-1'>
                Student Billing Details
              </h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Complete billing information and transaction history
              </p>
            </div>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {/* PRD Required Action Buttons */}
            <Button variant='outline' size='sm' asChild>
              <Link href={`/billing/receipts/new?student_id=${studentId}`}>
                <Receipt className='mr-2 h-4 w-4' />
                Generate Receipt
              </Link>
            </Button>

            <Button variant='outline' size='sm' asChild>
              <Link href={`/billing/discounts/new?student_id=${studentId}`}>
                <Percent className='mr-2 h-4 w-4' />
                Apply Discount
              </Link>
            </Button>

            <Button variant='outline' size='sm' asChild>
              <Link href={`/billing/refunds/new?student_id=${studentId}`}>
                <RefreshCw className='mr-2 h-4 w-4' />
                Process Refund
              </Link>
            </Button>

            {canCreateBills && (
              <Button asChild>
                <Link href={`/billing/schedule/new?student_id=${studentId}`}>
                  <Plus className='mr-2 h-4 w-4' />
                  Schedule Bill
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Student Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <User className='h-5 w-5' />
              Student Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
              {/* Student Photo and Basic Info */}
              <div className='flex flex-col items-center space-y-4'>
                <Avatar className='h-24 w-24'>
                  {' '}
                  <AvatarFallback className='text-lg'>
                    {' '}
                    {student.student_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}{' '}
                  </AvatarFallback>{' '}
                </Avatar>
                <div className='text-center'>
                  <h3 className='text-lg font-semibold'>
                    {student.student_name}
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    Roll No: {student.roll_number || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Contact Information */}
              <div className='space-y-4'>
                <h4 className='font-medium text-sm text-muted-foreground uppercase tracking-wide'>
                  Contact Information
                </h4>
                <div className='space-y-3'>
                  <div className='flex items-center gap-3'>
                    <Phone className='h-4 w-4 text-muted-foreground' />
                    <span className='text-sm'>{student.student_mobile}</span>
                  </div>
                  <div className='flex items-center gap-3'>
                    <Mail className='h-4 w-4 text-muted-foreground' />
                    <span className='text-sm'>{student.student_email}</span>
                  </div>
                  <div className='flex items-start gap-3'>
                    <User className='h-4 w-4 text-muted-foreground mt-0.5' />
                    <div className='text-sm'>
                      <div className='font-medium'>Guardian Contact</div>
                      <div className='text-muted-foreground'>
                        {student.father_name}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Academic Information */}
              <div className='space-y-4'>
                <h4 className='font-medium text-sm text-muted-foreground uppercase tracking-wide'>
                  Academic Information
                </h4>
                <div className='space-y-3'>
                  <div className='flex items-center gap-3'>
                    <Building className='h-4 w-4 text-muted-foreground' />
                    <div className='text-sm'>
                      <div className='font-medium'>
                        {student.institution?.name}
                      </div>
                      <div className='text-muted-foreground'>Institution</div>
                    </div>
                  </div>
                  <div className='flex items-center gap-3'>
                    <GraduationCap className='h-4 w-4 text-muted-foreground' />
                    <div className='text-sm'>
                      <div className='font-medium'>
                        {student.department?.department_name}
                      </div>
                      <div className='text-muted-foreground'>Department</div>
                    </div>
                  </div>
                  <div className='flex items-center gap-3'>
                    <Calendar className='h-4 w-4 text-muted-foreground' />
                    <div className='text-sm'>
                      <div className='font-medium'>
                        {student.semester?.semester_name}
                      </div>
                      <div className='text-muted-foreground'>
                        Current Semester
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Bills</CardTitle>
              <FileText className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {billingSummary.summary.total_bills}
              </div>
              <p className='text-xs text-muted-foreground'>All time bills</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Paid Amount</CardTitle>
              <Receipt className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>
                {formatCurrency(billingSummary.summary.paid_amount)}
              </div>
              <p className='text-xs text-muted-foreground'>Total payments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Outstanding</CardTitle>
              <FileText className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>
                {formatCurrency(billingSummary.summary.outstanding_amount)}
              </div>
              <p className='text-xs text-muted-foreground'>Pending dues</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Overdue</CardTitle>
              <FileText className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>
                {formatCurrency(billingSummary.summary.overdue_amount)}
              </div>
              <p className='text-xs text-muted-foreground'>Past due date</p>
            </CardContent>
          </Card>
        </div>

        {/* Billing Details Tabs */}
        <Card>
          <CardContent className='p-6'>
            <Tabs defaultValue='bills' className='space-y-4'>
              <div className='flex items-center justify-between'>
                <TabsList>
                  <TabsTrigger value='bills'>Bills</TabsTrigger>
                  <TabsTrigger value='receipts'>Receipts</TabsTrigger>
                  <TabsTrigger value='transactions'>
                    Transaction History
                  </TabsTrigger>
                </TabsList>

                <div className='flex items-center gap-2'>
                  <Filter className='h-4 w-4 text-muted-foreground' />
                  <Select
                    value={billStatusFilter}
                    onValueChange={setBillStatusFilter}
                  >
                    <SelectTrigger className='w-40'>
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
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => refetchSummary()}
                  >
                    <RefreshCw className='h-4 w-4' />
                  </Button>
                </div>
              </div>

              <TabsContent value='bills' className='space-y-4'>
                <StudentBillsTable
                  bills={billingSummary.bills}
                  statusFilter={billStatusFilter}
                  onRefresh={refetchSummary}
                />
              </TabsContent>

              <TabsContent value='receipts' className='space-y-4'>
                <StudentReceiptsTable
                  receipts={billingSummary.receipts}
                  onRefresh={refetchSummary}
                />
              </TabsContent>

              <TabsContent value='transactions' className='space-y-4'>
                <StudentTransactionHistory
                  summary={billingSummary}
                  onRefresh={refetchSummary}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
