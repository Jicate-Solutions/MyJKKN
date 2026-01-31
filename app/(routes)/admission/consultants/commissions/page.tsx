// app/(routes)/admission/consultants/commissions/page.tsx
// Commission Tracking - View and manage commission transactions

'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Search,
  Filter,
  RefreshCw,
  Download,
  Eye,
  Check,
  X,
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  TrendingUp,
  Receipt,
  CreditCard,
  Ban,
} from 'lucide-react';
import { format } from 'date-fns';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useAuth } from '@/hooks/use-auth';
import {
  useCommissionTransactions,
  useUpdateCommissionTransactionStatus,
  useProcessClawback,
  useConsultantsForDropdown,
} from '@/hooks/admission/use-consultants';
import type {
  CommissionTransactionFilters,
  ConsultantCommissionTransaction,
  CommissionStatus,
} from '@/types/education-consultants';
import { toast } from 'sonner';

// Status badge configuration
const statusConfig: Record<CommissionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  earned: { label: 'Earned', variant: 'outline', icon: TrendingUp },
  approved: { label: 'Approved', variant: 'default', icon: Check },
  paid: { label: 'Paid', variant: 'default', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: X },
  clawed_back: { label: 'Clawed Back', variant: 'destructive', icon: AlertTriangle },
};

export default function CommissionTrackingPage() {
  const { profile, isLoading: isAuthLoading } = useAuth();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions[0]?.institution_id;
  const userId = profile?.id;

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<CommissionStatus | 'all'>('all');
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Dialogs
  const [viewTransaction, setViewTransaction] = useState<ConsultantCommissionTransaction | null>(null);
  const [statusChangeDialog, setStatusChangeDialog] = useState<{
    transaction: ConsultantCommissionTransaction;
    newStatus: CommissionStatus;
  } | null>(null);
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [clawbackDialog, setClawbackDialog] = useState<ConsultantCommissionTransaction | null>(null);
  const [clawbackReason, setClawbackReason] = useState('');

  // Build filters
  const filters: CommissionTransactionFilters = useMemo(() => ({
    institution_id: institutionId || undefined,
    consultant_id: selectedConsultant !== 'all' ? selectedConsultant : undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    limit,
    sort_by: 'created_at',
    sort_order: 'desc',
  }), [institutionId, selectedConsultant, selectedStatus, dateFrom, dateTo, page, limit]);

  // Queries
  const {
    data: transactionsData,
    isLoading: isLoadingTransactions,
    refetch,
  } = useCommissionTransactions(filters);

  const { data: consultantsDropdown } = useConsultantsForDropdown(institutionId || '');

  // Mutations
  const updateStatusMutation = useUpdateCommissionTransactionStatus();
  const clawbackMutation = useProcessClawback();

  // Filter transactions by search term
  const filteredTransactions = useMemo(() => {
    if (!transactionsData?.data) return [];
    if (!searchTerm.trim()) return transactionsData.data;

    const term = searchTerm.toLowerCase();
    return transactionsData.data.filter((t) =>
      t.transaction_code?.toLowerCase().includes(term) ||
      t.consultant?.name?.toLowerCase().includes(term) ||
      t.lead?.full_name?.toLowerCase().includes(term)
    );
  }, [transactionsData?.data, searchTerm]);

  // Calculate stats
  const stats = useMemo(() => {
    const data = transactionsData?.data || [];
    return {
      pending: data.filter((t) => t.status === 'pending').reduce((sum, t) => sum + t.net_amount, 0),
      earned: data.filter((t) => t.status === 'earned').reduce((sum, t) => sum + t.net_amount, 0),
      approved: data.filter((t) => t.status === 'approved').reduce((sum, t) => sum + t.net_amount, 0),
      paid: data.filter((t) => t.status === 'paid').reduce((sum, t) => sum + t.net_amount, 0),
      pendingCount: data.filter((t) => t.status === 'pending').length,
      earnedCount: data.filter((t) => t.status === 'earned').length,
      approvedCount: data.filter((t) => t.status === 'approved').length,
      paidCount: data.filter((t) => t.status === 'paid').length,
    };
  }, [transactionsData?.data]);

  // Handlers
  const handleStatusChange = async () => {
    if (!statusChangeDialog || !userId) return;

    try {
      await updateStatusMutation.mutateAsync({
        id: statusChangeDialog.transaction.id,
        status: statusChangeDialog.newStatus,
        changedBy: userId,
        reason: statusChangeReason || undefined,
      });
      toast.success(`Commission status updated to ${statusConfig[statusChangeDialog.newStatus].label}`);
      setStatusChangeDialog(null);
      setStatusChangeReason('');
    } catch (error) {
      console.error('[admission/consultants/commissions] Status update error:', error);
      toast.error('Failed to update commission status');
    }
  };

  const handleClawback = async () => {
    if (!clawbackDialog || !userId || !clawbackReason.trim()) return;

    try {
      await clawbackMutation.mutateAsync({
        id: clawbackDialog.id,
        reason: clawbackReason,
        processedBy: userId,
      });
      toast.success('Clawback processed successfully');
      setClawbackDialog(null);
      setClawbackReason('');
    } catch (error) {
      console.error('[admission/consultants/commissions] Clawback error:', error);
      toast.error('Failed to process clawback');
    }
  };

  const handleExport = () => {
    // TODO: Implement CSV export
    toast.info('Export feature coming soon');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedStatus('all');
    setSelectedConsultant('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  if (isAuthLoading) {
    return (
      <ContentLayout title="Commission Tracking">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Commission Tracking">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Commission Tracking</h1>
            <p className="text-muted-foreground">
              View and manage commission transactions for all consultants
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.pending)}</div>
              <p className="text-xs text-muted-foreground">
                {stats.pendingCount} transactions awaiting verification
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Earned</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(stats.earned)}</div>
              <p className="text-xs text-muted-foreground">
                {stats.earnedCount} verified commissions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.approved)}</div>
              <p className="text-xs text-muted-foreground">
                {stats.approvedCount} ready for payout
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <CreditCard className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(stats.paid)}</div>
              <p className="text-xs text-muted-foreground">
                {stats.paidCount} completed payouts
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by code, name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as CommissionStatus | 'all')}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="earned">Earned</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="clawed_back">Clawed Back</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
                <SelectTrigger>
                  <SelectValue placeholder="All Consultants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Consultants</SelectItem>
                  {consultantsDropdown?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                placeholder="From Date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />

              <div className="flex gap-2">
                <Input
                  type="date"
                  placeholder="To Date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
                <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear Filters">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Commission Transactions
            </CardTitle>
            <CardDescription>
              {transactionsData?.total || 0} total transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTransactions ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No commission transactions found</p>
                <p className="text-sm">Transactions will appear when consultants earn commissions</p>
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transaction</TableHead>
                        <TableHead>Consultant</TableHead>
                        <TableHead>Lead/Student</TableHead>
                        <TableHead className="text-right">Fee Amount</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((transaction) => {
                        const config = statusConfig[transaction.status];
                        const StatusIcon = config.icon;
                        return (
                          <TableRow key={transaction.id}>
                            <TableCell className="font-mono text-sm">
                              {transaction.transaction_code || transaction.id.slice(0, 8)}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {transaction.consultant?.name || 'Unknown'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {transaction.consultant?.code}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {transaction.lead?.full_name || 'Unknown'}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(transaction.fee_amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-medium text-primary">
                                {formatCurrency(transaction.net_amount)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {transaction.rate_type === 'percentage'
                                  ? `${transaction.commission_rate}%`
                                  : 'Flat'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={config.variant} className="gap-1">
                                <StatusIcon className="h-3 w-3" />
                                {config.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(transaction.created_at), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setViewTransaction(transaction)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>

                                  {/* Status transitions */}
                                  {transaction.status === 'pending' && (
                                    <DropdownMenuItem
                                      onClick={() => setStatusChangeDialog({
                                        transaction,
                                        newStatus: 'earned',
                                      })}
                                    >
                                      <TrendingUp className="mr-2 h-4 w-4 text-blue-500" />
                                      Mark as Earned
                                    </DropdownMenuItem>
                                  )}

                                  {transaction.status === 'earned' && (
                                    <DropdownMenuItem
                                      onClick={() => setStatusChangeDialog({
                                        transaction,
                                        newStatus: 'approved',
                                      })}
                                    >
                                      <Check className="mr-2 h-4 w-4 text-green-500" />
                                      Approve
                                    </DropdownMenuItem>
                                  )}

                                  {(transaction.status === 'pending' || transaction.status === 'earned') && (
                                    <DropdownMenuItem
                                      onClick={() => setStatusChangeDialog({
                                        transaction,
                                        newStatus: 'cancelled',
                                      })}
                                      className="text-destructive"
                                    >
                                      <X className="mr-2 h-4 w-4" />
                                      Cancel
                                    </DropdownMenuItem>
                                  )}

                                  {transaction.status === 'paid' && (
                                    <DropdownMenuItem
                                      onClick={() => setClawbackDialog(transaction)}
                                      className="text-destructive"
                                    >
                                      <AlertTriangle className="mr-2 h-4 w-4" />
                                      Process Clawback
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {transactionsData && transactionsData.total > limit && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, transactionsData.total)} of {transactionsData.total} transactions
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page * limit >= transactionsData.total}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* View Transaction Dialog */}
      <Dialog open={!!viewTransaction} onOpenChange={() => setViewTransaction(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Commission Transaction Details</DialogTitle>
            <DialogDescription>
              Transaction {viewTransaction?.transaction_code || viewTransaction?.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          {viewTransaction && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Consultant</Label>
                  <p className="font-medium">{viewTransaction.consultant?.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Lead/Student</Label>
                  <p className="font-medium">{viewTransaction.lead?.full_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Fee Amount</Label>
                  <p className="font-medium">{formatCurrency(viewTransaction.fee_amount)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Commission Rate</Label>
                  <p className="font-medium">
                    {viewTransaction.rate_type === 'percentage'
                      ? `${viewTransaction.commission_rate}%`
                      : formatCurrency(viewTransaction.commission_rate)}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Calculated Amount</Label>
                  <p className="font-medium">{formatCurrency(viewTransaction.calculated_amount)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Final Amount</Label>
                  <p className="font-medium">{formatCurrency(viewTransaction.final_amount)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Net Amount (Payable)</Label>
                  <p className="text-xl font-bold text-primary">{formatCurrency(viewTransaction.net_amount)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={statusConfig[viewTransaction.status].variant}>
                      {statusConfig[viewTransaction.status].label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="font-medium">{format(new Date(viewTransaction.created_at), 'PPpp')}</p>
                </div>
                {viewTransaction.status_changed_at && (
                  <div>
                    <Label className="text-muted-foreground">Status Changed</Label>
                    <p className="font-medium">{format(new Date(viewTransaction.status_changed_at), 'PPpp')}</p>
                  </div>
                )}
              </div>
              {viewTransaction.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{viewTransaction.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTransaction(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={!!statusChangeDialog} onOpenChange={() => setStatusChangeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusChangeDialog?.newStatus === 'cancelled' ? 'Cancel' : 'Update'} Commission
            </DialogTitle>
            <DialogDescription>
              {statusChangeDialog?.newStatus === 'cancelled'
                ? 'Are you sure you want to cancel this commission?'
                : `Change status to "${statusChangeDialog?.newStatus ? statusConfig[statusChangeDialog.newStatus].label : ''}"`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Consultant:</span>
                <span className="font-medium">{statusChangeDialog?.transaction.consultant?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-medium">{formatCurrency(statusChangeDialog?.transaction.net_amount || 0)}</span>
              </div>
            </div>
            <div>
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for status change..."
                value={statusChangeReason}
                onChange={(e) => setStatusChangeReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChangeDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={updateStatusMutation.isPending}
              variant={statusChangeDialog?.newStatus === 'cancelled' ? 'destructive' : 'default'}
            >
              {updateStatusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clawback Dialog */}
      <Dialog open={!!clawbackDialog} onOpenChange={() => setClawbackDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Process Clawback
            </DialogTitle>
            <DialogDescription>
              This will reverse a paid commission and deduct it from the consultant&apos;s balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Consultant:</span>
                <span className="font-medium">{clawbackDialog?.consultant?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount to Recover:</span>
                <span className="font-bold text-destructive">{formatCurrency(clawbackDialog?.net_amount || 0)}</span>
              </div>
            </div>
            <div>
              <Label htmlFor="clawbackReason">Reason (Required)</Label>
              <Textarea
                id="clawbackReason"
                placeholder="Enter reason for clawback..."
                value={clawbackReason}
                onChange={(e) => setClawbackReason(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClawbackDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleClawback}
              disabled={clawbackMutation.isPending || !clawbackReason.trim()}
              variant="destructive"
            >
              {clawbackMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Process Clawback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
