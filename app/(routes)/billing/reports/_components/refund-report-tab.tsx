'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Download,
  CreditCard,
  DollarSign,
  Receipt
} from 'lucide-react';
import {
  useRefundReport,
  useReportExport
} from '@/hooks/billing/use-billing-reports';
import type { BillingReportFilters } from '@/types/billing-schedule';

interface RefundReportTabProps {
  filters: BillingReportFilters;
  canExport: boolean;
}

export function RefundReportTab({ filters, canExport }: RefundReportTabProps) {
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>(
    'pdf'
  );

  const { report, loading, error, refetch } = useRefundReport(filters);
  const { exportReport, loading: exportLoading } = useReportExport();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-IN');
  };

  const getRefundCategoryBadge = (category: string) => {
    const categoryConfig = {
      course_change: {
        label: 'Course Change',
        className: 'bg-blue-100 text-blue-800'
      },
      withdrawal: {
        label: 'Withdrawal',
        className: 'bg-orange-100 text-orange-800'
      },
      duplicate_payment: {
        label: 'Duplicate Payment',
        className: 'bg-red-100 text-red-800'
      },
      service_not_provided: {
        label: 'Service Not Provided',
        className: 'bg-yellow-100 text-yellow-800'
      },
      system_error: {
        label: 'System Error',
        className: 'bg-gray-100 text-gray-800'
      }
    };

    const config =
      categoryConfig[category as keyof typeof categoryConfig] ||
      categoryConfig.duplicate_payment;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getRefundMethodBadge = (method: string) => {
    const methodConfig = {
      cash: { label: 'Cash', className: 'bg-green-100 text-green-800' },
      bank_transfer: {
        label: 'Bank Transfer',
        className: 'bg-blue-100 text-blue-800'
      },
      adjust_future_bills: {
        label: 'Adjust Future Bills',
        className: 'bg-purple-100 text-purple-800'
      },
      cheque: { label: 'Cheque', className: 'bg-gray-100 text-gray-800' }
    };

    const config =
      methodConfig[method as keyof typeof methodConfig] || methodConfig.cash;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getRefundStatusBadge = (status: string) => {
    const statusConfig = {
      processed: {
        label: 'Processed',
        className: 'bg-green-100 text-green-800'
      },
      approved: {
        label: 'Approved',
        className: 'bg-blue-100 text-blue-800'
      },
      pending: {
        label: 'Pending',
        className: 'bg-yellow-100 text-yellow-800'
      },
      rejected: {
        label: 'Rejected',
        className: 'bg-red-100 text-red-800'
      }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const handleExport = async () => {
    try {
      await exportReport('refund', filters, {
        format: exportFormat,
        include_summary: true,
        include_charts: false
      });
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const totalRefunds = report.length;
  const totalRefundAmount = report.reduce(
    (sum, refund) => sum + refund.refund_amount,
    0
  );
  const totalNetRefundAmount = report.reduce(
    (sum, refund) => sum + refund.net_refund_amount,
    0
  );
  const processedRefunds = report.filter(
    (refund) => refund.approval_status === 'processed'
  ).length;

  if (loading) {
    return (
      <div className='flex justify-center items-center p-8'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-16'>
          <AlertCircle className='h-12 w-12 text-destructive mb-4' />
          <h3 className='text-lg font-semibold mb-2'>Error Loading Report</h3>
          <p className='text-muted-foreground text-center max-w-md mb-4'>
            {error}
          </p>
          <Button variant='outline' onClick={refetch}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Refunds</CardTitle>
            <CreditCard className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalRefunds}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Processed Refunds
            </CardTitle>
            <Receipt className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {processedRefunds}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Total Refund Amount
            </CardTitle>
            <DollarSign className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {formatCurrency(totalRefundAmount)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Net Refund Amount
            </CardTitle>
            <DollarSign className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>
              {formatCurrency(totalNetRefundAmount)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Refund Report Table */}
    <Card>
      <CardHeader>
        <div className='flex justify-between items-center'>
          <CardTitle className='flex items-center gap-2'>
            <CreditCard className='h-5 w-5' />
            Refund Report
          </CardTitle>
          {canExport && (
              <div className='flex items-center gap-2'>
                <select
                  value={exportFormat}
                  onChange={(e) =>
                    setExportFormat(e.target.value as 'pdf' | 'excel' | 'csv')
                  }
                  className='px-3 py-1 border rounded text-sm'
                >
                  <option value='pdf'>PDF</option>
                  <option value='excel'>Excel</option>
                  <option value='csv'>CSV</option>
                </select>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleExport}
                  disabled={exportLoading}
                >
                  {exportLoading ? (
                    <BeatLoader size={8} color='currentColor' />
                  ) : (
                    <>
              <Download className='h-4 w-4 mr-2' />
              Export
                    </>
                  )}
            </Button>
              </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
          {report.length === 0 ? (
            <div className='text-center py-8'>
          <CreditCard className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>No Refunds</h3>
          <p className='text-muted-foreground'>
                No refunds found matching the current filters.
          </p>
        </div>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt Number</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className='text-right'>Refund Amount</TableHead>
                    <TableHead className='text-right'>Processing Fee</TableHead>
                    <TableHead className='text-right'>Net Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.map((refund) => (
                    <TableRow key={refund.refund_id}>
                      <TableCell className='font-medium'>
                        #{refund.receipt_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className='font-medium'>
                            {refund.student_name}
                          </div>
                          {refund.roll_number && (
                            <div className='text-sm text-muted-foreground'>
                              {refund.roll_number}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{refund.institution_name}</TableCell>
                      <TableCell>
                        {getRefundCategoryBadge(refund.refund_category)}
                      </TableCell>
                      <TableCell>
                        {getRefundMethodBadge(refund.refund_method)}
                      </TableCell>
                      <TableCell className='text-right font-semibold text-red-600'>
                        {formatCurrency(refund.refund_amount)}
                      </TableCell>
                      <TableCell className='text-right text-orange-600'>
                        {formatCurrency(refund.processing_fee)}
                      </TableCell>
                      <TableCell className='text-right font-semibold text-green-600'>
                        {formatCurrency(refund.net_refund_amount)}
                      </TableCell>
                      <TableCell>
                        {getRefundStatusBadge(refund.approval_status)}
                      </TableCell>
                      <TableCell>{formatDate(refund.refund_date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </CardContent>
    </Card>
    </div>
  );
}
