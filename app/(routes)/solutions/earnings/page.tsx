'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Button } from '@/components/ui/button';
import { TrendingUp, Users, Building2, GraduationCap, Wallet, Calendar, AlertCircle, Download } from 'lucide-react';
import { downloadCsv, formatDateForCsv, formatCurrencyForCsv, type CsvColumn } from '@/lib/utils/csv-export';
import { format } from 'date-fns';
import {
  useEarnings,
  useEarningsStats,
  getRecipientTypeDisplayName,
} from '@/hooks/solutions/use-earnings';
import type { EarningsWithPayment } from '@/lib/services/solutions/earnings-service';
import type { RecipientType, EarningsStatus } from '@/lib/services/solutions/types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Extract solution title from an earning entry (solution is nested under phase/program/order) */
function getEarningSolutionTitle(earning: EarningsWithPayment): string {
  const payment = earning.payment;
  if (!payment) return 'Unknown Solution';
  // Try phase -> solution
  const phase = Array.isArray(payment.phase) ? payment.phase[0] : payment.phase;
  const phaseSol = Array.isArray(phase?.solution) ? phase?.solution[0] : phase?.solution;
  if (phaseSol?.title) return phaseSol.title;
  // Try program -> solution
  const program = Array.isArray(payment.program) ? payment.program[0] : payment.program;
  const progSol = Array.isArray(program?.solution) ? program?.solution[0] : program?.solution;
  if (progSol?.title) return progSol.title;
  // Try order -> solution
  const order = Array.isArray(payment.order) ? payment.order[0] : payment.order;
  const orderSol = Array.isArray(order?.solution) ? order?.solution[0] : order?.solution;
  if (orderSol?.title) return orderSol.title;
  return 'Unknown Solution';
}

/** Extract solution code from an earning entry */
function getEarningSolutionCode(earning: EarningsWithPayment): string {
  const payment = earning.payment;
  if (!payment) return 'N/A';
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

const recipientConfig: Record<RecipientType, { label: string; icon: React.ElementType; color: string }> = {
  builder: { label: 'Builder', icon: Users, color: 'bg-blue-100 text-blue-800' },
  cohort_member: { label: 'Cohort', icon: GraduationCap, color: 'bg-green-100 text-green-800' },
  production_learner: { label: 'Production', icon: Users, color: 'bg-purple-100 text-purple-800' },
  department: { label: 'Department', icon: Building2, color: 'bg-orange-100 text-orange-800' },
  jicate: { label: 'JICATE', icon: Building2, color: 'bg-indigo-100 text-indigo-800' },
  institution: { label: 'Institution', icon: Building2, color: 'bg-gray-100 text-gray-800' },
  council: { label: 'Council', icon: Building2, color: 'bg-teal-100 text-teal-800' },
  infrastructure: { label: 'Infrastructure', icon: Building2, color: 'bg-slate-100 text-slate-800' },
  referral_bonus: { label: 'Referral', icon: Users, color: 'bg-amber-100 text-amber-800' },
};

const statusConfig: Record<EarningsStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  calculated: { label: 'Calculated', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'outline' },
  paid: { label: 'Paid', variant: 'default' },
};

export default function EarningsPage() {
  // Fetch real data from hooks
  const { data: earningsData, isLoading, error } = useEarnings({ limit: 50 });
  const { data: stats, isLoading: statsLoading } = useEarningsStats();

  const earnings = earningsData?.data || [];

  // Calculate stats from real data
  const totalDistributed = stats?.total_paid || 0;
  const totalPending = stats?.total_approved || 0;
  const buildersEarned = stats?.by_recipient_type?.builder?.paid || 0;
  const cohortEarned = stats?.by_recipient_type?.cohort_member?.paid || 0;

  const csvColumns: CsvColumn<EarningsWithPayment>[] = [
    { header: 'Solution', accessor: (row) => getEarningSolutionTitle(row) },
    { header: 'Solution Code', accessor: (row) => getEarningSolutionCode(row) },
    { header: 'Recipient Type', accessor: (row) => getRecipientTypeDisplayName(row.recipient_type as RecipientType) },
    { header: 'Amount', accessor: (row) => formatCurrencyForCsv(row.amount) },
    { header: 'Percentage', accessor: (row) => row.percentage },
    { header: 'Status', accessor: (row) => row.status },
    { header: 'Paid Date', accessor: (row) => formatDateForCsv(row.paid_at) },
  ];

  const handleExport = () => {
    downloadCsv(earnings, csvColumns, 'earnings');
  };

  return (
    <ContentLayout title="Earnings Ledger">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Earnings' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Earnings Ledger</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track revenue splits and earnings distribution
          </p>
        </div>

        {/* Error State */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load earnings. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingUp className="h-8 w-8 text-green-500" />
              <div>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold">{formatCurrency(totalDistributed)}</p>
                )}
                <p className="text-sm text-muted-foreground">Total Distributed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Wallet className="h-8 w-8 text-yellow-500" />
              <div>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold">{formatCurrency(totalPending)}</p>
                )}
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold">{formatCurrency(buildersEarned)}</p>
                )}
                <p className="text-sm text-muted-foreground">Builders Earned</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <GraduationCap className="h-8 w-8 text-green-500" />
              <div>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold">{formatCurrency(cohortEarned)}</p>
                )}
                <p className="text-sm text-muted-foreground">Cohort Earned</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Earnings History</CardTitle>
              <CardDescription>Revenue distribution to stakeholders</CardDescription>
            </div>
            {earnings.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />Export
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : earnings.length === 0 ? (
              <div className="text-center py-10">
                <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 font-semibold">No earnings found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Earnings will appear here when payments are processed
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Solution</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Processed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {earnings.map((earning) => {
                    const recipientType = earning.recipient_type as RecipientType;
                    const recipient = recipientConfig[recipientType] || recipientConfig.builder;
                    const RecipientIcon = recipient?.icon || Users;
                    const status = statusConfig[earning.status as EarningsStatus] || statusConfig.calculated;

                    return (
                      <TableRow key={earning.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{getEarningSolutionTitle(earning)}</p>
                            <p className="text-sm text-muted-foreground">
                              {getEarningSolutionCode(earning)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={recipient.color}>
                              <RecipientIcon className="mr-1 h-3 w-3" />
                              {recipient.label}
                            </Badge>
                            <span>{getRecipientTypeDisplayName(recipientType)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(earning.amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          {earning.percentage}%
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {earning.paid_at ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(earning.paid_at), 'dd MMM yyyy')}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
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
