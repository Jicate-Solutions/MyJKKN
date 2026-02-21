'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { Plus, DollarSign, Clock, CheckCircle2, AlertCircle, Calendar, Download } from 'lucide-react';
import { format } from 'date-fns';
import { downloadCsv, formatDateForCsv, formatCurrencyForCsv, type CsvColumn } from '@/lib/utils/csv-export';
import { usePayments, usePaymentStats, type PaymentWithDetails } from '@/hooks/solutions/use-payments';
import type { PaymentStatus } from '@/lib/services/solutions/types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Extract solution title from payment (tries direct join, then phase/program/order) */
function getSolutionTitle(payment: PaymentWithDetails): string {
  // Direct solution join (from solution_id FK)
  const sol = Array.isArray(payment.solution) ? payment.solution[0] : payment.solution;
  if (sol?.title) return sol.title;
  // Fallback: derive from phase -> solution
  const phase = Array.isArray(payment.phase) ? payment.phase[0] : payment.phase;
  const phaseSol = Array.isArray(phase?.solution) ? phase?.solution[0] : phase?.solution;
  if (phaseSol?.title) return phaseSol.title;
  // Fallback: derive from program -> solution
  const program = Array.isArray(payment.program) ? payment.program[0] : payment.program;
  const progSol = Array.isArray(program?.solution) ? program?.solution[0] : program?.solution;
  if (progSol?.title) return progSol.title;
  // Fallback: derive from order -> solution
  const order = Array.isArray(payment.order) ? payment.order[0] : payment.order;
  const orderSol = Array.isArray(order?.solution) ? order?.solution[0] : order?.solution;
  if (orderSol?.title) return orderSol.title;
  return 'Unknown Solution';
}

/** Extract solution code from payment */
function getSolutionCode(payment: PaymentWithDetails): string {
  const sol = Array.isArray(payment.solution) ? payment.solution[0] : payment.solution;
  if (sol?.solution_code) return sol.solution_code;
  const phase = Array.isArray(payment.phase) ? payment.phase[0] : payment.phase;
  const phaseSol = Array.isArray(phase?.solution) ? phase?.solution[0] : phase?.solution;
  if (phaseSol?.solution_code) return phaseSol.solution_code;
  const program = Array.isArray(payment.program) ? payment.program[0] : payment.program;
  const progSol = Array.isArray(program?.solution) ? program?.solution[0] : program?.solution;
  if (progSol?.solution_code) return progSol.solution_code;
  const order = Array.isArray(payment.order) ? payment.order[0] : payment.order;
  const orderSol = Array.isArray(order?.solution) ? order?.solution[0] : order?.solution;
  if (orderSol?.solution_code) return orderSol.solution_code;
  return 'N/A';
}

const statusConfig: Record<PaymentStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: DollarSign },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: AlertCircle },
  refunded: { label: 'Refunded', color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
};

const typeLabels: Record<string, string> = {
  advance: 'Advance',
  milestone: 'Milestone',
  completion: 'Completion',
  mou_signing: 'MoU Signing',
  deployment: 'Deployment',
  acceptance: 'Acceptance',
  amc: 'AMC',
};

export default function PaymentsPage() {
  // Fetch real data from hooks
  const { data: paymentsData, isLoading, error } = usePayments({ limit: 50 });
  const { data: stats, isLoading: statsLoading } = usePaymentStats();

  const payments = paymentsData?.data || [];

  // Calculate stats from real data
  const totalReceived = stats?.total_received || 0;
  const totalPending = stats?.total_pending || 0;
  const totalFailed = payments.filter(p => p.status === 'failed').reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <ContentLayout title="Payments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Payments' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Payments</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track payments and revenue
            </p>
          </div>
          <Button asChild>
            <Link href="/solutions/payments/new">
              <Plus className="mr-2 h-4 w-4" />
              Record Payment
            </Link>
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load payments. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="p-3 rounded-full bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(totalReceived)}</p>
                )}
                <p className="text-sm text-muted-foreground">Received</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="p-3 rounded-full bg-yellow-100">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold text-yellow-600">{formatCurrency(totalPending)}</p>
                )}
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="p-3 rounded-full bg-red-100">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(totalFailed)}</p>
                )}
                <p className="text-sm text-muted-foreground">Overdue</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-10">
                <DollarSign className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 font-semibold">No payments found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Record your first payment to get started
                </p>
                <Button asChild className="mt-4">
                  <Link href="/solutions/payments/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payment
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Solution</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
                    const status = statusConfig[payment.status as PaymentStatus] || statusConfig.pending;
                    return (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{getSolutionTitle(payment)}</p>
                            <p className="text-sm text-muted-foreground">{getSolutionCode(payment)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{typeLabels[payment.payment_type] || payment.payment_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(payment.amount || 0)}
                        </TableCell>
                        <TableCell>
                          <Badge className={status.color}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {payment.due_date ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(payment.due_date), 'dd MMM yyyy')}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {payment.reference_number || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
