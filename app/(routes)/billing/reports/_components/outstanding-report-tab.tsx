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
import {
  AlertCircle,
  Download,
  FileText,
  Users,
  DollarSign
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useOutstandingReport,
  useReportExport
} from '@/hooks/billing/use-billing-reports';
import type { BillingReportFilters } from '@/types/billing-schedule';

interface OutstandingReportTabProps {
  filters: BillingReportFilters;
  canExport: boolean;
}

export function OutstandingReportTab({
  filters,
  canExport
}: OutstandingReportTabProps) {
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>(
    'pdf'
  );

  const { report, loading, error, refetch } = useOutstandingReport(filters);
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

  const handleExport = async () => {
    try {
      await exportReport('outstanding', filters, {
        format: exportFormat,
        include_summary: true,
        include_charts: false
      });
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const totalOutstanding = report.reduce(
    (sum, student) => sum + student.total_outstanding,
    0
  );
  const totalOverdue = report.reduce(
    (sum, student) => sum + student.overdue_amount,
    0
  );
  const totalStudents = report.length;

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
              Students with Outstanding
            </CardTitle>
            <Users className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalStudents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Total Outstanding
            </CardTitle>
            <DollarSign className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>
              {formatCurrency(totalOutstanding)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Overdue</CardTitle>
            <AlertCircle className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {formatCurrency(totalOverdue)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Table */}
      <Card>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle>Outstanding Report</CardTitle>
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
              <h3 className='text-lg font-semibold mb-2'>
                No Outstanding Bills
              </h3>
              <p className='text-muted-foreground'>
                No students have outstanding bills matching the current filters.
              </p>
            </div>
          ) : (
            <div className='space-y-4'>
              {report.map((student) => (
                <div
                  key={student.student_id}
                  className='border rounded-lg overflow-hidden'
                >
                  {/* Student Header */}
                  <div className='bg-muted/50 p-4 border-b'>
                    <div className='flex justify-between items-start'>
                      <div>
                        <h4 className='font-semibold text-lg'>
                          {`${student.first_name} ${
                            student.last_name || ''
                          }`.trim()}
                        </h4>
                        <div className='flex items-center gap-4 text-sm text-muted-foreground mt-1'>
                          {student.roll_number && (
                            <span>Roll: {student.roll_number}</span>
                          )}
                          <span>{student.institution_name}</span>
                          {student.department_name && (
                            <span>{student.department_name}</span>
                          )}
                        </div>
                      </div>
                      <div className='text-right'>
                        <div className='text-lg font-bold text-orange-600'>
                          {formatCurrency(student.total_outstanding)}
                        </div>
                        {student.overdue_amount > 0 && (
                          <div className='text-sm text-red-600'>
                            Overdue: {formatCurrency(student.overdue_amount)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bills Table */}
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bill Description</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {student.bills.map((bill) => (
                          <TableRow key={bill.id}>
                            <TableCell className='font-medium'>
                              {bill.bill_description}
                            </TableCell>
                            <TableCell>
                              <div
                                className={`
                                ${
                                  new Date(bill.due_date) < new Date() &&
                                  bill.status !== 'paid'
                                    ? 'text-red-600'
                                    : 'text-muted-foreground'
                                }
                              `}
                              >
                                {formatDate(bill.due_date)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className='font-semibold'>
                                {formatCurrency(bill.amount)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  bill.status === 'overdue'
                                    ? 'destructive'
                                    : bill.status === 'partially_paid'
                                    ? 'secondary'
                                    : 'outline'
                                }
                              >
                                {bill.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
