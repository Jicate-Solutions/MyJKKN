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
import { AlertCircle, Download, TrendingUp, Receipt } from 'lucide-react';
import {
  useCollectionReport,
  useReportExport
} from '@/hooks/billing/use-billing-reports';
import { ReportPagination } from './report-pagination';
import type { BillingReportFilters } from '@/types/billing-schedule';

interface CollectionReportTabProps {
  filters: BillingReportFilters;
  canExport: boolean;
}

export function CollectionReportTab({
  filters,
  canExport
}: CollectionReportTabProps) {
  const {
    report,
    totalCount,
    page,
    setPage,
    pageSize,
    loading,
    error,
    refetch
  } = useCollectionReport(filters);
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

  const getPaymentModeBadge = (mode: string) => {
    const modeConfig = {
      cash: { label: 'Cash', className: 'bg-green-100 text-green-800' },
      online: { label: 'Online', className: 'bg-blue-100 text-blue-800' },
      bank_transfer: {
        label: 'Bank Transfer',
        className: 'bg-purple-100 text-purple-800'
      },
      dd: { label: 'DD', className: 'bg-orange-100 text-orange-800' },
      cheque: { label: 'Cheque', className: 'bg-gray-100 text-gray-800' }
    };

    const config =
      modeConfig[mode as keyof typeof modeConfig] || modeConfig.cash;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const handleExport = async () => {
    try {
      await exportReport('collection', filters, {
        format: 'csv',
        include_summary: true,
        include_charts: false
      });
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // These are sums over the fetched PAGE only — the RPC does not return a
  // true cross-page total, so the money cards below are labelled "(this
  // page)" rather than implying they cover all `totalCount` records.
  const totalCollected = report.reduce(
    (sum, collection) => sum + collection.net_amount,
    0
  );
  const totalRefunds = report.reduce(
    (sum, collection) => sum + collection.total_refunds,
    0
  );

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
              Total Transactions
            </CardTitle>
            <Receipt className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalCount.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Net Collected (this page)</CardTitle>
            <TrendingUp className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {formatCurrency(totalCollected)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Refunds (this page)</CardTitle>
            <AlertCircle className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {formatCurrency(totalRefunds)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Collection Report Table */}
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <TrendingUp className='h-5 w-5' />
              Collection Report
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
              <TrendingUp className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>No Collections</h3>
              <p className='text-muted-foreground'>
                No collections found matching the current filters.
              </p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Payment Mode</TableHead>
                    <TableHead className='text-right'>Receipt Amount</TableHead>
                    <TableHead className='text-right'>Refunds</TableHead>
                    <TableHead className='text-right'>Net Amount</TableHead>
                    <TableHead>Accountant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.map((collection) => (
                    <TableRow key={collection.receipt_id}>
                      <TableCell className='font-medium'>
                        #{collection.receipt_number}
                      </TableCell>
                      <TableCell>
                        {formatDate(collection.receipt_date)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className='font-medium'>
                            {`${collection.first_name} ${
                              collection.last_name || ''
                            }`.trim()}
                          </div>
                          {collection.roll_number && (
                            <div className='text-sm text-muted-foreground'>
                              {collection.roll_number}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{collection.institution_name}</TableCell>
                      <TableCell>
                        {getPaymentModeBadge(collection.payment_mode)}
                      </TableCell>
                      <TableCell className='text-right'>
                        <span
                          className={`font-semibold ${
                            collection.has_refunds
                              ? 'text-muted-foreground line-through'
                              : 'text-blue-600'
                          }`}
                        >
                          {formatCurrency(collection.payment_amount)}
                        </span>
                      </TableCell>
                      <TableCell className='text-right'>
                        {collection.has_refunds ? (
                          <span className='font-semibold text-red-600'>
                            -{formatCurrency(collection.total_refunds)}
                          </span>
                        ) : (
                          <span className='text-muted-foreground'>-</span>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <span
                          className={`font-semibold ${
                            collection.has_refunds
                              ? 'text-green-600'
                              : 'text-blue-600'
                          }`}
                        >
                          {formatCurrency(collection.net_amount)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {collection.accountant_name || 'N/A'}
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
