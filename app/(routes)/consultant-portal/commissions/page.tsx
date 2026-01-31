// app/(routes)/consultant-portal/commissions/page.tsx
// Commission statement view for consultants

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useCommissionTransactions } from '@/hooks/admission/use-consultants';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { EducationConsultant, CommissionStatus, ConsultantCommissionTransaction } from '@/types/education-consultants';
import { formatCurrency } from '@/lib/utils';
import {
  IndianRupee,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Wallet,
  Hourglass,
} from 'lucide-react';

const statusConfig: Record<
  CommissionStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800',
    icon: <Clock className="h-3 w-3" />,
  },
  earned: {
    label: 'Earned',
    color: 'bg-blue-100 text-blue-800',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-800',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  paid: {
    label: 'Paid',
    color: 'bg-emerald-100 text-emerald-800',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-red-100 text-red-800',
    icon: <XCircle className="h-3 w-3" />,
  },
  clawed_back: {
    label: 'Clawed Back',
    color: 'bg-orange-100 text-orange-800',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export default function ConsultantCommissionsPage() {
  const { profile } = useAuth();
  const [consultant, setConsultant] = useState<EducationConsultant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Load consultant data
  useEffect(() => {
    async function loadConsultant() {
      if (!profile?.id || !profile?.institution_id) {
        setIsLoading(false);
        return;
      }

      try {
        const consultants = await ConsultantService.getConsultants({
          institution_id: profile.institution_id,
          limit: 100,
        });

        const myConsultant = consultants.data.find(
          (c) => c.referrer_user_id === profile.id
        );

        setConsultant(myConsultant || null);
      } catch (err) {
        console.error('Failed to load consultant:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadConsultant();
  }, [profile]);

  // Fetch commission transactions
  const {
    data: transactions,
    isLoading: transactionsLoading,
    refetch,
  } = useCommissionTransactions(
    consultant
      ? {
          institution_id: profile?.institution_id,
          consultant_id: consultant.id,
          status: statusFilter !== 'all' ? (statusFilter as CommissionStatus) : undefined,
          page,
          limit,
        }
      : { institution_id: '', consultant_id: '' }
  );

  // Calculate totals from consultant data
  const totalPaid = consultant?.total_commission_earned || 0;
  const pendingAmount = consultant?.pending_commission || 0;

  // Calculate from transactions if available
  const transactionList = transactions?.data || [];
  const transactionStats = transactionList.reduce(
    (acc: { pending: number; earned: number; approved: number; paid: number }, t: ConsultantCommissionTransaction) => {
      const amount = t.net_amount || t.final_amount || 0;
      if (t.status === 'pending') acc.pending += amount;
      if (t.status === 'earned') acc.earned += amount;
      if (t.status === 'approved') acc.approved += amount;
      if (t.status === 'paid') acc.paid += amount;
      return acc;
    },
    { pending: 0, earned: 0, approved: 0, paid: 0 }
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <p className="text-muted-foreground">Unable to load consultant profile</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <IndianRupee className="h-6 w-6" />
            Commission Statement
          </h1>
          <p className="text-muted-foreground">
            View your commission earnings and payment history
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-full bg-yellow-100">
                <Hourglass className="h-4 w-4 text-yellow-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Pending</span>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(pendingAmount)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-full bg-blue-100">
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Earned (Unpaid)</span>
            </div>
            <div className="text-2xl font-bold">
              {formatCurrency(transactionStats.earned + transactionStats.approved)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-full bg-green-100">
                <Wallet className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Total Paid</span>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(totalPaid)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-full bg-emerald-100">
                <IndianRupee className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Lifetime Total</span>
            </div>
            <div className="text-2xl font-bold">
              {formatCurrency(totalPaid + pendingAmount)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-base">Transaction History</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="earned">Earned</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="clawed_back">Clawed Back</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : transactionList.length === 0 ? (
            <div className="text-center py-12">
              <IndianRupee className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Commissions Yet</h3>
              <p className="text-muted-foreground">
                Commission transactions will appear here when your leads convert.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionList.map((transaction: ConsultantCommissionTransaction) => {
                      const config = statusConfig[transaction.status] || statusConfig.pending;
                      return (
                        <TableRow key={transaction.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(transaction.created_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-sm">
                              {transaction.transaction_code || transaction.id.slice(0, 8)}
                            </div>
                            {transaction.milestone_stage && (
                              <p className="text-xs text-muted-foreground capitalize">
                                {transaction.milestone_stage.replace(/_/g, ' ')}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">
                              {(transaction.lead as { full_name?: string })?.full_name || 'Unknown'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div>{formatCurrency(transaction.final_amount)}</div>
                            {transaction.tds_amount && transaction.tds_amount > 0 && (
                              <p className="text-xs text-muted-foreground">
                                TDS: {formatCurrency(transaction.tds_amount)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(transaction.net_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge className={config.color}>
                              <span className="flex items-center gap-1">
                                {config.icon}
                                {config.label}
                              </span>
                            </Badge>
                            {transaction.status === 'paid' && transaction.paid_at && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Paid: {new Date(transaction.paid_at).toLocaleDateString()}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={transactionList.length < limit}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Information</CardTitle>
          <CardDescription>
            Your bank details for commission payouts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Bank Name</p>
                <p className="font-medium">{consultant.bank_name || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Account Number</p>
                <p className="font-medium font-mono">
                  {consultant.bank_account_number
                    ? '••••' + consultant.bank_account_number.slice(-4)
                    : 'Not provided'}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">IFSC Code</p>
                <p className="font-medium font-mono">{consultant.bank_ifsc || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Account Holder</p>
                <p className="font-medium">{consultant.bank_account_holder || 'Not provided'}</p>
              </div>
            </div>
          </div>
          {(!consultant.bank_name || !consultant.bank_account_number) && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Please update your bank details in your profile to receive commission payouts.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
