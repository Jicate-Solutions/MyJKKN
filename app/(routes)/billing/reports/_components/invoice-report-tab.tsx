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
import { AlertCircle, Download, FileText, Eye } from 'lucide-react';
import Link from 'next/link';
import {
  useInvoiceReport,
  useReportExport
} from '@/hooks/billing/use-billing-reports';
import type { BillingReportFilters } from '@/types/billing-schedule';

interface InvoiceReportTabProps {
  filters: BillingReportFilters;
  canExport: boolean;
}

export function InvoiceReportTab({
  filters,
  canExport
}: InvoiceReportTabProps) {
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>(
    'pdf'
  );

  const { report, loading, error, refetch } = useInvoiceReport(filters);
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

  const getInvoiceTypeBadge = (type: string) => {
    const typeConfig = {
      individual: {
        label: 'Individual',
        className: 'bg-blue-100 text-blue-800'
      },
      consolidated: {
        label: 'Consolidated',
        className: 'bg-purple-100 text-purple-800'
      }
    };

    const config =
      typeConfig[type as keyof typeof typeConfig] || typeConfig.individual;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const handleExport = async () => {
    try {
      await exportReport('invoice', filters, {
        format: exportFormat,
        include_summary: true,
        include_charts: false
      });
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const totalInvoices = report.length;
  const totalAmount = report.reduce(
    (sum, invoice) => sum + invoice.grand_total,
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
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Total Invoices
            </CardTitle>
            <FileText className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalInvoices}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Amount</CardTitle>
            <FileText className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {formatCurrency(totalAmount)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Report Table */}
      <Card>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle className='flex items-center gap-2'>
              <FileText className='h-5 w-5' />
              Invoice Report
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
              <FileText className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>No Invoices</h3>
              <p className='text-muted-foreground'>
                No invoices found matching the current filters.
              </p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Billing Period</TableHead>
                    <TableHead className='text-right'>Amount</TableHead>
                    <TableHead className='w-12'></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.map((invoice) => (
                    <TableRow key={invoice.invoice_id}>
                      <TableCell className='font-medium'>
                        #{invoice.invoice_number}
                      </TableCell>
                      <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                      <TableCell>
                        <div>
                          <div className='font-medium'>
                            {invoice.student_name}
                          </div>
                          {invoice.roll_number && (
                            <div className='text-sm text-muted-foreground'>
                              {invoice.roll_number}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{invoice.institution_name}</TableCell>
                      <TableCell>
                        {getInvoiceTypeBadge(invoice.invoice_type)}
                      </TableCell>
                      <TableCell>
                        {invoice.billing_period_from &&
                        invoice.billing_period_to
                          ? `${formatDate(
                              invoice.billing_period_from
                            )} - ${formatDate(invoice.billing_period_to)}`
                          : 'N/A'}
                      </TableCell>
                      <TableCell className='text-right font-semibold text-blue-600'>
                        {formatCurrency(invoice.grand_total)}
                      </TableCell>
                      <TableCell>
                        <Button variant='ghost' size='sm' asChild>
                          <Link
                            href={`/billing/invoices/${invoice.invoice_id}`}
                          >
                            <Eye className='h-4 w-4' />
                          </Link>
                        </Button>
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
