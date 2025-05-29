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
  Receipt,
  Percent,
  DollarSign
} from 'lucide-react';
import {
  useDiscountReport,
  useReportExport
} from '@/hooks/billing/use-billing-reports';
import type { BillingReportFilters } from '@/types/billing-schedule';

interface DiscountReportTabProps {
  filters: BillingReportFilters;
  canExport: boolean;
}

export function DiscountReportTab({
  filters,
  canExport
}: DiscountReportTabProps) {
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>(
    'pdf'
  );

  const { report, loading, error, refetch } = useDiscountReport(filters);
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

  const getDiscountCategoryBadge = (category: string) => {
    const categoryConfig = {
      merit_scholarship: {
        label: 'Merit Scholarship',
        className: 'bg-green-100 text-green-800'
      },
      financial_aid: {
        label: 'Financial Aid',
        className: 'bg-blue-100 text-blue-800'
      },
      staff_quota: {
        label: 'Staff Quota',
        className: 'bg-purple-100 text-purple-800'
      },
      sports_quota: {
        label: 'Sports Quota',
        className: 'bg-orange-100 text-orange-800'
      },
      special_circumstances: {
        label: 'Special',
        className: 'bg-gray-100 text-gray-800'
      }
    };

    const config =
      categoryConfig[category as keyof typeof categoryConfig] ||
      categoryConfig.financial_aid;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getApprovalStatusBadge = (status: string) => {
    const statusConfig = {
      approved: {
        label: 'Approved',
        className: 'bg-green-100 text-green-800'
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
      await exportReport('discount', filters, {
        format: exportFormat,
        include_summary: true,
        include_charts: false
      });
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const totalDiscounts = report.length;
  const totalDiscountAmount = report.reduce(
    (sum, discount) => sum + discount.discount_amount,
    0
  );
  const approvedDiscounts = report.filter(
    (discount) => discount.approval_status === 'approved'
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
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Total Discounts
            </CardTitle>
            <Receipt className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalDiscounts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Approved Discounts
            </CardTitle>
            <Percent className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {approvedDiscounts}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Amount</CardTitle>
            <DollarSign className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {formatCurrency(totalDiscountAmount)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Discount Report Table */}
      <Card>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle className='flex items-center gap-2'>
              <Receipt className='h-5 w-5' />
              Discount Report
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
              <Receipt className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>No Discounts</h3>
              <p className='text-muted-foreground'>
                No discounts found matching the current filters.
              </p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Bill Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className='text-right'>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.map((discount) => (
                    <TableRow key={discount.discount_id}>
                      <TableCell>
                        <div>
                          <div className='font-medium'>
                            {discount.student_name}
                          </div>
                          {discount.roll_number && (
                            <div className='text-sm text-muted-foreground'>
                              {discount.roll_number}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{discount.institution_name}</TableCell>
                      <TableCell className='max-w-48 truncate'>
                        {discount.bill_description}
                      </TableCell>
                      <TableCell>
                        {getDiscountCategoryBadge(discount.discount_category)}
                      </TableCell>
                      <TableCell>
                        <Badge variant='outline'>
                          {discount.discount_type.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {discount.discount_type === 'percentage'
                          ? `${discount.discount_value}%`
                          : formatCurrency(discount.discount_value)}
                      </TableCell>
                      <TableCell className='text-right font-semibold text-red-600'>
                        {formatCurrency(discount.discount_amount)}
                      </TableCell>
                      <TableCell>
                        {getApprovalStatusBadge(discount.approval_status)}
                      </TableCell>
                      <TableCell>
                        {formatDate(discount.effective_date)}
                      </TableCell>
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
