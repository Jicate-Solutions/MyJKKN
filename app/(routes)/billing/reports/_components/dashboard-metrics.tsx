'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import {
  IndianRupee,
  Users,
  FileText,
  TrendingUp,
  AlertCircle,
  ReceiptIndianRupee,
  Percent,
  Download,
  Building2,
  Landmark,
  HelpCircle,
  GraduationCap
} from 'lucide-react';
import type {
  BillingDashboardMetrics,
  StudentYearBreakdown
} from '@/types/billing-schedule';
import type { BillingCollectionSplit } from '@/types/billing-analytics';

/**
 * '1st Year', '2nd Year', '3rd Year', … for the year-of-study cards.
 *
 * Formatted here rather than in the RPC because it is presentation: the SQL
 * emits the bare ordinal so the payload stays language-neutral. The 11–13 case
 * is guarded even though no programme runs that long — an ordinal helper that
 * says '11st' is the kind of thing that survives into a screenshot.
 */
function yearOfStudyLabel(year: number | null): string {
  if (year === null) return 'Year Not Set';
  const suffix =
    year % 100 >= 11 && year % 100 <= 13
      ? 'th'
      : { 1: 'st', 2: 'nd', 3: 'rd' }[year % 10] ?? 'th';
  return `${year}${suffix} Year`;
}

interface DashboardMetricsProps {
  metrics: BillingDashboardMetrics | null;
  loading: boolean;
  canExport: boolean;
  /** Management / Government / Unallocated breakdown of the collected figure.
   *  Undefined for users without billing.analytics.view — the section is then
   *  simply not rendered. */
  split?: BillingCollectionSplit;
  /** Year-wise split of the Total Learners card. Served by its own query, since
   *  the dashboard RPC returns grand totals only. */
  yearWiseStudents?: StudentYearBreakdown[];
}

export function DashboardMetrics({
  metrics,
  loading,
  canExport,
  split,
  yearWiseStudents = []
}: DashboardMetricsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className='flex justify-center items-center p-8'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-16'>
          <AlertCircle className='h-12 w-12 text-muted-foreground mb-4' />
          <h3 className='text-lg font-semibold mb-2'>No Data Available</h3>
          <p className='text-muted-foreground text-center max-w-md'>
            Unable to load dashboard metrics. Please try refreshing the page.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalStudents = metrics.total_students;

  return (
    <div className='space-y-6'>
      {/* Header with Export */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <h3 className='text-lg font-medium'>Dashboard Overview</h3>
        {canExport && (
          <Button variant='outline' size='sm'>
            <Download className='h-4 w-4 mr-2' />
            Export Report
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* Total Learners */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Total Learners
            </CardTitle>
            <Users className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {metrics.total_students.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        {/* Total Bills */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Bills</CardTitle>
            <FileText className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {metrics.total_bills.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        {/* Amount Billed */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Amount Billed</CardTitle>
            <IndianRupee className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {formatCurrency(metrics.total_amount_billed)}
            </div>
          </CardContent>
        </Card>

        {/* Amount Collected */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Amount Collected
            </CardTitle>
            <TrendingUp className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {formatCurrency(metrics.total_amount_collected)}
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Amount */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Outstanding</CardTitle>
            <AlertCircle className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>
              {formatCurrency(metrics.total_outstanding)}
            </div>
          </CardContent>
        </Card>

        {/* Overdue Amount */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Overdue</CardTitle>
            <AlertCircle className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {formatCurrency(metrics.total_overdue)}
            </div>
          </CardContent>
        </Card>

        {/* Collection Rate */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Collection Rate
            </CardTitle>
            <Percent className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-purple-600'>
              {formatPercentage(metrics.collection_rate)}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions Count */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Recent Receipts
            </CardTitle>
            <ReceiptIndianRupee className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {metrics.recent_transactions.receipts.length}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              Last 10 transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Year-wise split of the Total Learners card above. */}
      {yearWiseStudents.length > 0 && (
        <div>
          <h3 className='text-lg font-medium'>Learners by Year of Study</h3>
          <p className='text-sm text-muted-foreground mb-3'>
            Splits the Total Learners figure above using each learner&apos;s
            current semester. Billed and collected cover the selected date
            range; outstanding is the balance carried as of today.
          </p>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
            {yearWiseStudents.map((bucket) => (
              <Card key={bucket.year ?? 'unassigned'}>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    {yearOfStudyLabel(bucket.year)}
                  </CardTitle>
                  <GraduationCap className='h-4 w-4 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>
                    {bucket.student_count.toLocaleString()}
                  </div>
                  <p className='text-xs text-muted-foreground mt-1'>
                    {bucket.student_count === 1 ? 'learner' : 'learners'}
                    {totalStudents > 0 &&
                      ` · ${formatPercentage(
                        (bucket.student_count / totalStudents) * 100
                      )} of total`}
                  </p>

                  <div className='mt-3 space-y-1.5 border-t pt-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-xs text-muted-foreground'>
                        Billed
                      </span>
                      <span className='text-sm font-semibold text-blue-600'>
                        {formatCurrency(bucket.amount_billed)}
                      </span>
                    </div>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-xs text-muted-foreground'>
                        Collected
                      </span>
                      <span className='text-sm font-semibold text-green-600'>
                        {formatCurrency(bucket.amount_collected)}
                      </span>
                    </div>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-xs text-muted-foreground'>
                        Outstanding
                      </span>
                      <span className='text-sm font-semibold text-orange-600'>
                        {formatCurrency(bucket.outstanding)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Collection ownership — who the collected cash actually belongs to. */}
      {split && (
        <div>
          <h3 className='text-lg font-medium mb-3'>Collection by Ownership</h3>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Management</CardTitle>
                <Building2 className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-green-600'>
                  {formatCurrency(split.management_collected)}
                </div>
                <p className='text-xs text-muted-foreground mt-1'>
                  {formatCurrency(split.management_net)} net of refunds
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Government</CardTitle>
                <Landmark className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-amber-600'>
                  {formatCurrency(split.government_collected)}
                </div>
                <p className='text-xs text-muted-foreground mt-1'>
                  collected on behalf of government
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Unallocated</CardTitle>
                <HelpCircle className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-muted-foreground'>
                  {formatCurrency(split.unallocated_collected)}
                </div>
                <p className='text-xs text-muted-foreground mt-1'>
                  receipts not linked to any bill
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      {metrics.recent_transactions.receipts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {metrics.recent_transactions.receipts
                .slice(0, 5)
                .map((receipt: any) => (
                  <div
                    key={receipt.id}
                    className='flex items-center justify-between p-3 border rounded-lg'
                  >
                    <div className='flex items-center gap-3'>
                      <ReceiptIndianRupee className='h-4 w-4 text-muted-foreground' />
                      {/* The dashboard RPC's recent-receipts sub-select only
                          emits id, receipt_number, receipt_date,
                          payment_amount, payment_mode — no student name and
                          no created_at, so neither is rendered here. */}
                      <p className='font-medium'>{receipt.receipt_number}</p>
                    </div>
                    <div className='text-right'>
                      <p className='font-semibold text-green-600'>
                        {formatCurrency(receipt.payment_amount)}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {new Date(receipt.receipt_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Institution-wise Summary */}
      {metrics.institution_wise_summary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Institution-wise Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {metrics.institution_wise_summary.map((summary: any) => (
                <div
                  key={summary.institution_id}
                  className='grid grid-cols-1 md:grid-cols-5 gap-4 p-4 border rounded-lg'
                >
                  <div>
                    <p className='font-medium'>{summary.institution_name}</p>
                    <p className='text-sm text-muted-foreground'>
                      {summary.total_bills} bills
                    </p>
                  </div>
                  <div>
                    <p className='text-sm text-muted-foreground'>Billed</p>
                    <p className='font-semibold text-blue-600'>
                      {formatCurrency(summary.amount_billed)}
                    </p>
                  </div>
                  <div>
                    <p className='text-sm text-muted-foreground'>Collected</p>
                    <p className='font-semibold text-green-600'>
                      {formatCurrency(summary.amount_collected)}
                    </p>
                  </div>
                  <div>
                    <p className='text-sm text-muted-foreground'>Outstanding</p>
                    <p className='font-semibold text-orange-600'>
                      {formatCurrency(summary.outstanding)}
                    </p>
                  </div>
                  <div>
                    <p className='text-sm text-muted-foreground'>
                      Collection Rate
                    </p>
                    <p className='font-semibold text-purple-600'>
                      {summary.amount_billed > 0
                        ? formatPercentage(
                            (summary.amount_collected / summary.amount_billed) *
                              100
                          )
                        : '0%'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
