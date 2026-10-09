'use client';

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
import { ScholarshipCategoryBadge } from '@/components/billing/scholarship-labels';
import {
  AlertCircle,
  Download,
  ReceiptIndianRupee,
  Percent,
  IndianRupee
} from 'lucide-react';
import {
  useScholarshipReport,
  useReportExport
} from '@/hooks/billing/use-billing-reports';
import { ReportPagination } from './report-pagination';
import type { BillingReportFilters } from '@/types/billing-schedule';

interface ScholarshipReportTabProps {
  filters: BillingReportFilters;
  canExport: boolean;
}

export function ScholarshipReportTab({
  filters,
  canExport
}: ScholarshipReportTabProps) {
  const {
    report,
    totalCount,
    page,
    setPage,
    pageSize,
    loading,
    error,
    refetch
  } = useScholarshipReport(filters);
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
      await exportReport('scholarship', filters, {
        format: 'csv',
        include_summary: true,
        include_charts: false
      });
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // These are derived from the fetched PAGE only — the RPC does not return a
  // true cross-page total for the amount or the approved subset, so both
  // cards below are labelled "(this page)".
  const totalScholarshipAmount = report.reduce(
    (sum, scholarship) => sum + scholarship.scholarship_amount,
    0
  );
  const approvedScholarships = report.filter(
    (scholarship) => scholarship.approval_status === 'approved'
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
              Total Scholarships
            </CardTitle>
            <ReceiptIndianRupee className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalCount.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Approved Scholarships (this page)
            </CardTitle>
            <Percent className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {approvedScholarships}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Amount (this page)</CardTitle>
            <IndianRupee className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {formatCurrency(totalScholarshipAmount)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scholarship Report Table */}
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <ReceiptIndianRupee className='h-5 w-5' />
              Scholarship Report
            </CardTitle>
            {canExport && (
              <div className='flex items-center gap-2'>
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
              <ReceiptIndianRupee className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>No Scholarships</h3>
              <p className='text-muted-foreground'>
                No scholarships found matching the current filters.
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
                    <TableHead>Category / Type</TableHead>
                    <TableHead>Value Mode</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className='text-right'>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.map((scholarship) => (
                    <TableRow key={scholarship.scholarship_id}>
                      <TableCell>
                        <div>
                          <div className='font-medium'>
                            {`${scholarship.first_name} ${
                              scholarship.last_name || ''
                            }`.trim()}
                          </div>
                          {scholarship.roll_number && (
                            <div className='text-sm text-muted-foreground'>
                              {scholarship.roll_number}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{scholarship.institution_name}</TableCell>
                      <TableCell className='max-w-48 truncate'>
                        {scholarship.bill_description}
                      </TableCell>
                      <TableCell>
                        <ScholarshipCategoryBadge
                          category={
                            scholarship.scholarship_category_name
                              ? { name: scholarship.scholarship_category_name }
                              : null
                          }
                          type={
                            scholarship.scholarship_type_name
                              ? { name: scholarship.scholarship_type_name }
                              : null
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant='outline'>
                          {scholarship.value_mode.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {scholarship.value_mode === 'percentage'
                          ? `${scholarship.scholarship_value}%`
                          : formatCurrency(scholarship.scholarship_value)}
                      </TableCell>
                      <TableCell className='text-right font-semibold text-red-600'>
                        {formatCurrency(scholarship.scholarship_amount)}
                      </TableCell>
                      <TableCell>
                        {getApprovalStatusBadge(scholarship.approval_status)}
                      </TableCell>
                      <TableCell>
                        {formatDate(scholarship.effective_date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <ReportPagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
