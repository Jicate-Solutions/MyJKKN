'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsIndentSummary,
  useImsIndentsByDepartment,
} from '@/hooks/ims/use-ims-reports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BeatLoader } from 'react-spinners';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  PackageCheck,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { ImsIndentSummary, ImsIndentByDepartment } from '@/types/ims';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

function getStatusBadge(status: string, count: number) {
  const variants: Record<string, { color: string; icon: React.ReactNode }> = {
    pending: { color: 'bg-yellow-500', icon: <Clock className='h-3 w-3' /> },
    approved: { color: 'bg-blue-500', icon: <CheckCircle2 className='h-3 w-3' /> },
    rejected: { color: 'bg-red-500', icon: <XCircle className='h-3 w-3' /> },
    issued: { color: 'bg-purple-500', icon: <Truck className='h-3 w-3' /> },
    delivered: { color: 'bg-green-500', icon: <PackageCheck className='h-3 w-3' /> },
  };
  const config = variants[status] || { color: 'bg-gray-500', icon: null };
  return (
    <Badge className={`${config.color} text-white gap-1`}>
      {config.icon}
      {count}
    </Badge>
  );
}

export default function IndentsReportPage() {
  const { isLoading: permissionsLoading } = usePermissions();
  const { storeId, institutionId } = useImsStoreContext();

  const { data: summary, isLoading: summaryLoading } = useImsIndentSummary(storeId || '', institutionId);
  const { data: departments, isLoading: deptsLoading } = useImsIndentsByDepartment(storeId || '', institutionId);

  if (permissionsLoading) {
    return (
      <ContentLayout title='Indent Report'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Compute rates
  const completionRate = summary && summary.total > 0
    ? (((summary.issued + summary.delivered) / summary.total) * 100).toFixed(1)
    : '0.0';

  const approvalRate = summary && summary.total > 0
    ? ((summary.approved / summary.total) * 100).toFixed(1)
    : '0.0';

  const statusCards = summary
    ? [
        { label: 'Total', value: summary.total, icon: FileText, color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-950/30' },
        { label: 'Pending', value: summary.pending, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950/30' },
        { label: 'Approved', value: summary.approved, icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
        { label: 'Rejected', value: summary.rejected, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
        { label: 'Issued', value: summary.issued, icon: Truck, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30' },
        { label: 'Delivered', value: summary.delivered, icon: PackageCheck, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' },
      ]
    : [];

  return (
    <ContentLayout title='Indent Report'>
      <div className='space-y-6'>
        {/* Header */}
        <div>
          <div className='flex items-center gap-2 mb-1'>
            <Link href='/ims/reports'>
              <Button variant='ghost' size='sm'>
                <ArrowLeft className='h-4 w-4 mr-1' />
                Back to Reports
              </Button>
            </Link>
          </div>
          <h1 className='text-2xl font-bold'>Indent Report</h1>
          <p className='text-muted-foreground'>
            Indent request status distribution and department-wise analysis.
          </p>
        </div>

        {/* Summary Status Cards */}
        {summaryLoading ? (
          <div className='flex items-center justify-center py-8'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <>
            <div className='grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6'>
              {statusCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.label}>
                    <CardContent className='pt-6'>
                      <div className='flex items-center gap-3'>
                        <div className={`p-2 rounded-lg ${card.bg}`}>
                          <Icon className={`h-5 w-5 ${card.color}`} />
                        </div>
                        <div>
                          <p className='text-xs text-muted-foreground'>{card.label}</p>
                          <p className='text-xl font-bold'>{card.value}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Computed Metrics */}
            <div className='grid gap-4 md:grid-cols-2'>
              <Card>
                <CardContent className='pt-6'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='text-sm text-muted-foreground'>Completion Rate</p>
                      <p className='text-3xl font-bold'>{completionRate}%</p>
                      <p className='text-xs text-muted-foreground mt-1'>Issued + Delivered / Total</p>
                    </div>
                    <div className='h-16 w-16 rounded-full bg-green-50 dark:bg-green-950/30 flex items-center justify-center'>
                      <PackageCheck className='h-8 w-8 text-green-600' />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className='pt-6'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='text-sm text-muted-foreground'>Approval Rate</p>
                      <p className='text-3xl font-bold'>{approvalRate}%</p>
                      <p className='text-xs text-muted-foreground mt-1'>Approved / Total</p>
                    </div>
                    <div className='h-16 w-16 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center'>
                      <CheckCircle2 className='h-8 w-8 text-blue-600' />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Department Table */}
        <Card>
          <CardHeader>
            <CardTitle>Department-wise Indent Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {deptsLoading ? (
              <div className='flex items-center justify-center py-12'>
                <BeatLoader color='#00e902' />
              </div>
            ) : !departments || departments.length === 0 ? (
              <p className='text-center text-muted-foreground py-8'>No department indent data available.</p>
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead className='text-right'>Total Requests</TableHead>
                      <TableHead className='text-right'>Pending</TableHead>
                      <TableHead className='text-right'>Approved</TableHead>
                      <TableHead className='text-right'>Completed</TableHead>
                      <TableHead className='text-right'>Estimated Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departments.map((dept: ImsIndentByDepartment) => (
                      <TableRow key={dept.department_id}>
                        <TableCell className='font-medium'>{dept.department_name}</TableCell>
                        <TableCell className='text-right font-mono'>{dept.total_requests}</TableCell>
                        <TableCell className='text-right'>
                          {dept.pending > 0
                            ? getStatusBadge('pending', dept.pending)
                            : <span className='font-mono text-muted-foreground'>0</span>}
                        </TableCell>
                        <TableCell className='text-right'>
                          {dept.approved > 0
                            ? getStatusBadge('approved', dept.approved)
                            : <span className='font-mono text-muted-foreground'>0</span>}
                        </TableCell>
                        <TableCell className='text-right'>
                          {dept.completed > 0
                            ? getStatusBadge('delivered', dept.completed)
                            : <span className='font-mono text-muted-foreground'>0</span>}
                        </TableCell>
                        <TableCell className='text-right'>{formatCurrency(dept.estimated_value)}</TableCell>
                      </TableRow>
                    ))}
                    {/* Total Row */}
                    <TableRow className='font-bold bg-muted/50'>
                      <TableCell>Total</TableCell>
                      <TableCell className='text-right'>
                        {departments.reduce((s: number, d: ImsIndentByDepartment) => s + d.total_requests, 0)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {departments.reduce((s: number, d: ImsIndentByDepartment) => s + d.pending, 0)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {departments.reduce((s: number, d: ImsIndentByDepartment) => s + d.approved, 0)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {departments.reduce((s: number, d: ImsIndentByDepartment) => s + d.completed, 0)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatCurrency(departments.reduce((s: number, d: ImsIndentByDepartment) => s + d.estimated_value, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
