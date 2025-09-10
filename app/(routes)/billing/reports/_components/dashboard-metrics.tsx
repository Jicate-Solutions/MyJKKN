'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import {
  DollarSign,
  Users,
  FileText,
  TrendingUp,
  AlertCircle,
  Receipt,
  Percent,
  Download
} from 'lucide-react';
import type { BillingDashboardMetrics } from '@/types/billing-schedule';

interface DashboardMetricsProps {
  metrics: BillingDashboardMetrics | null;
  loading: boolean;
  canExport: boolean;
}

export function DashboardMetrics({
  metrics,
  loading,
  canExport
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

  return (
    <div className='space-y-6'>
      {/* Header with Export */}
      <div className='flex justify-between items-center'>
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
        {/* Total Students */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Total Students
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
            <DollarSign className='h-4 w-4 text-muted-foreground' />
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
            <Receipt className='h-4 w-4 text-muted-foreground' />
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
                      <Receipt className='h-4 w-4 text-muted-foreground' />
                      <div>
                        <p className='font-medium'>{receipt.receipt_number}</p>
                        <p className='text-sm text-muted-foreground'>
                          {`${receipt.student?.first_name || 'Unknown'} ${receipt.student?.last_name || 'Student'}`}
                        </p>
                      </div>
                    </div>
                    <div className='text-right'>
                      <p className='font-semibold text-green-600'>
                        {formatCurrency(receipt.payment_amount)}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {new Date(receipt.created_at).toLocaleDateString()}
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
