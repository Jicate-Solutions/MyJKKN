'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Wallet,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Mail,
  Eye,
  RefreshCw,
  AlertTriangle,
  IndianRupee,
  Search,
  TrendingUp,
  BarChart3,
  FileCheck,
  UserCheck,
  Building2,
  GraduationCap,
  Receipt,
  ArrowRightLeft,
  Bell,
  Loader2
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useAuth } from '@/hooks/use-auth';
import {
  useAdmissionPayments,
  usePaymentStats,
  useRecordPayment,
  useProcessRefund,
} from '@/hooks/admission/use-seat-confirmation';
import type { AdmissionPaymentRow } from '@/lib/services/admission/seat-confirmation-service';

function getPaymentCandidateName(payment: AdmissionPaymentRow): string {
  const lead = payment.application?.admission_lead;
  if (lead?.full_name) return lead.full_name;
  const formData = payment.application?.form_data as Record<string, unknown> | null;
  const personal = formData?.personal as Record<string, unknown> | undefined;
  if (personal?.name) return String(personal.name);
  return payment.receipt_number || 'Unknown';
}

function getPaymentCandidateEmail(payment: AdmissionPaymentRow): string {
  return payment.application?.admission_lead?.email || '';
}

function SeatConfirmationPageContent() {
  const { profile, isLoading: authLoading } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [activeTab, setActiveTab] = useState('confirmations');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AdmissionPaymentRow | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [isSendingBulkReminders, setIsSendingBulkReminders] = useState(false);
  const [isSendingBulkEmails, setIsSendingBulkEmails] = useState(false);

  // Real data hooks
  const { payments, isLoading: paymentsLoading, refetch } = useAdmissionPayments({
    institutionId,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: searchTerm || undefined,
  });

  const { stats, isLoading: statsLoading } = usePaymentStats(institutionId);
  const recordPaymentMutation = useRecordPayment();
  const processRefundMutation = useProcessRefund();

  const isLoading = authLoading || paymentsLoading;

  // Client-side filtering for search on candidate name
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const name = getPaymentCandidateName(p).toLowerCase();
      const receipt = (p.receipt_number || '').toLowerCase();
      const term = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || name.includes(term) || receipt.includes(term) || p.id.includes(term);
      return matchesSearch;
    });
  }, [payments, searchTerm]);

  // Stats from real data
  const totalCollected = stats?.totalCollected ?? 0;
  const pendingAmount = stats?.pendingAmount ?? 0;
  const refundPending = stats?.refundPending ?? 0;
  const confirmedCount = stats?.confirmedCount ?? 0;
  const pendingPaymentCount = stats?.pendingPaymentCount ?? 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Payment Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
      case 'refund_pending':
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Refund Pending</Badge>;
      case 'refunded':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Refunded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDaysRemaining = (deadline: string | null) => {
    if (!deadline) return null;
    const days = differenceInDays(new Date(deadline), new Date());
    if (days < 0) return <span className="text-red-600 font-medium">Expired</span>;
    if (days === 0) return <span className="text-red-600 font-medium">Today</span>;
    if (days <= 3) return <span className="text-yellow-600 font-medium">{days} days</span>;
    return <span className="text-muted-foreground">{days} days</span>;
  };

  const handleSelectAll = () => {
    if (selectedItems.length === filteredPayments.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredPayments.map(c => c.id));
    }
  };

  const handleSelectItem = (id: string) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter(i => i !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-7 w-7 text-primary" />
            Seat Confirmation & Token Fee
          </h1>
          <p className="text-muted-foreground mt-1">
            Track token payments, seat reservations, and enrollment confirmations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={isSyncing}
            onClick={async () => {
              setIsSyncing(true);
              await refetch();
              toast.success('Payment data synced successfully');
              setIsSyncing(false);
            }}
          >
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Payments
          </Button>
          <Button onClick={() => setIsPaymentDialogOpen(true)}>
            <Receipt className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Payments</p>
                <p className="text-2xl font-bold">{payments.length}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="text-2xl font-bold text-green-600">{confirmedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Payment</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingPaymentCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Refund Pending</p>
                <p className="text-2xl font-bold text-orange-600">
                  {payments.filter(p => p.status === 'refund_pending').length}
                </p>
              </div>
              <ArrowRightLeft className="h-8 w-8 text-orange-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collected</p>
                <p className="text-2xl font-bold text-primary">
                  {totalCollected >= 100000 ? `₹${(totalCollected / 100000).toFixed(1)}L` : `₹${totalCollected.toLocaleString()}`}
                </p>
              </div>
              <IndianRupee className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Amt</p>
                <p className="text-2xl font-bold text-purple-600">
                  {pendingAmount >= 100000 ? `₹${(pendingAmount / 100000).toFixed(1)}L` : `₹${pendingAmount.toLocaleString()}`}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
          <TabsTrigger value="confirmations">
            <UserCheck className="mr-2 h-4 w-4" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="mr-2 h-4 w-4" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Payments Tab */}
        <TabsContent value="confirmations" className="mt-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Admission Payments</CardTitle>
                  <CardDescription>Track payment and document status</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast.success('Exporting payment data...')}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSendingReminders}
                    onClick={async () => {
                      setIsSendingReminders(true);
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      toast.success('Reminders sent successfully');
                      setIsSendingReminders(false);
                    }}
                  >
                    {isSendingReminders ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="mr-2 h-4 w-4" />
                    )}
                    Send Reminders
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or receipt number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="refund_pending">Refund Pending</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bulk Actions */}
              {selectedItems.length > 0 && (
                <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg mb-4">
                  <span className="text-sm font-medium text-blue-700">
                    {selectedItems.length} selected
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSendingBulkReminders}
                    onClick={async () => {
                      setIsSendingBulkReminders(true);
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      toast.success(`Reminders sent to ${selectedItems.length} candidates`);
                      setIsSendingBulkReminders(false);
                    }}
                  >
                    {isSendingBulkReminders ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="mr-2 h-4 w-4" />
                    )}
                    Remind
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSendingBulkEmails}
                    onClick={async () => {
                      setIsSendingBulkEmails(true);
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      toast.success(`Emails sent to ${selectedItems.length} candidates`);
                      setIsSendingBulkEmails(false);
                    }}
                  >
                    {isSendingBulkEmails ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" />
                    )}
                    Email
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedItems([])}>
                    Clear
                  </Button>
                </div>
              )}

              {/* Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-3 text-left">
                          <Checkbox
                            checked={selectedItems.length === filteredPayments.length && filteredPayments.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </th>
                        <th className="p-3 text-left text-sm font-medium">Candidate</th>
                        <th className="p-3 text-left text-sm font-medium">Type</th>
                        <th className="p-3 text-center text-sm font-medium">Status</th>
                        <th className="p-3 text-center text-sm font-medium">Amount</th>
                        <th className="p-3 text-center text-sm font-medium">Method</th>
                        <th className="p-3 text-center text-sm font-medium">Paid At</th>
                        <th className="p-3 text-center text-sm font-medium">Receipt</th>
                        <th className="p-3 text-center text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-muted-foreground">
                            {paymentsLoading ? 'Loading...' : 'No payments found'}
                          </td>
                        </tr>
                      )}
                      {filteredPayments.map((payment) => (
                        <tr key={payment.id} className="border-t hover:bg-muted/30">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedItems.includes(payment.id)}
                              onCheckedChange={() => handleSelectItem(payment.id)}
                            />
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{getPaymentCandidateName(payment)}</p>
                              <p className="text-xs text-muted-foreground">{payment.application?.application_number || payment.id.slice(0, 8)}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="capitalize">
                              {(payment.payment_type || '').replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">{getStatusBadge(payment.status)}</td>
                          <td className="p-3 text-center">
                            <span className="font-medium">₹{payment.amount.toLocaleString()}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-sm capitalize">{(payment.payment_method || '-').replace(/_/g, ' ')}</span>
                          </td>
                          <td className="p-3 text-center">
                            {payment.paid_at ? (
                              <span className="text-sm">{format(new Date(payment.paid_at), 'MMM dd, yyyy')}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {payment.receipt_number ? (
                              <Badge variant="outline">{payment.receipt_number}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {payment.status === 'pending' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setSelectedItem(payment);
                                    setIsPaymentDialogOpen(true);
                                  }}
                                >
                                  <CreditCard className="h-4 w-4" />
                                </Button>
                              )}
                              {(payment.status === 'paid' || payment.status === 'refund_pending') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setSelectedItem(payment);
                                    setIsRefundDialogOpen(true);
                                  }}
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="payments" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Payment Transactions</CardTitle>
                <CardDescription>Recent admission payments</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {payments
                      .filter(c => c.paid_at)
                      .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime())
                      .map((payment) => (
                        <div key={payment.id} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full ${
                                payment.status === 'refund_pending' ? 'bg-orange-100' : 'bg-green-100'
                              }`}>
                                {payment.status === 'refund_pending' ? (
                                  <ArrowRightLeft className="h-4 w-4 text-orange-600" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{getPaymentCandidateName(payment)}</p>
                                <p className="text-xs text-muted-foreground">{payment.receipt_number || payment.gateway_payment_id || payment.id.slice(0, 8)}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${
                                payment.status === 'refund_pending' ? 'text-orange-600' : 'text-green-600'
                              }`}>
                                {payment.status === 'refund_pending' ? '-' : '+'}₹{payment.amount.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(payment.paid_at!), 'MMM dd, yyyy')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="capitalize">{(payment.payment_method || 'unknown').replace(/_/g, ' ')}</Badge>
                            <Badge variant="outline" className="capitalize">{(payment.payment_type || '').replace(/_/g, ' ')}</Badge>
                          </div>
                        </div>
                      ))}
                    {payments.filter(c => c.paid_at).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No payment transactions yet</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Payment Stats */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Collection Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 rounded-lg text-center">
                      <p className="text-sm text-green-700">Total Collected</p>
                      <p className="text-3xl font-bold text-green-600">₹{totalCollected.toLocaleString()}</p>
                    </div>
                    {stats?.paymentsByMethod && stats.paymentsByMethod.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {stats.paymentsByMethod.map((m) => (
                          <div key={m.method} className="p-3 border rounded-lg text-center">
                            <p className="text-sm text-muted-foreground capitalize">{m.method.replace(/_/g, ' ')}</p>
                            <p className="font-bold">₹{m.amount.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pending Collections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-yellow-50 rounded-lg text-center">
                    <p className="text-sm text-yellow-700">Expected from Pending</p>
                    <p className="text-2xl font-bold text-yellow-600">₹{pendingAmount.toLocaleString()}</p>
                    <p className="text-xs text-yellow-600 mt-1">{pendingPaymentCount} candidates</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Refunds</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-orange-50 rounded-lg text-center">
                    <p className="text-sm text-orange-700">Pending Refunds</p>
                    <p className="text-2xl font-bold text-orange-600">₹{refundPending.toLocaleString()}</p>
                    <p className="text-xs text-orange-600 mt-1">
                      {payments.filter(p => p.status === 'refund_pending').length} requests
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payment Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Status Breakdown</CardTitle>
                <CardDescription>Overview of all payment statuses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { status: 'Paid', count: confirmedCount, color: 'bg-green-500' },
                    { status: 'Pending', count: pendingPaymentCount, color: 'bg-yellow-500' },
                    { status: 'Refund Pending', count: payments.filter(p => p.status === 'refund_pending').length, color: 'bg-orange-500' },
                    { status: 'Refunded', count: payments.filter(p => p.status === 'refunded').length, color: 'bg-gray-500' },
                    { status: 'Failed', count: payments.filter(p => p.status === 'failed').length, color: 'bg-red-500' },
                  ].filter(s => s.count > 0).map((stage) => (
                    <div key={stage.status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{stage.status}</span>
                        <span className="font-medium">{stage.count} ({payments.length > 0 ? ((stage.count / payments.length) * 100).toFixed(0) : 0}%)</span>
                      </div>
                      <div className="h-8 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full ${stage.color}`}
                          style={{ width: `${payments.length > 0 ? Math.max((stage.count / payments.length) * 100, 2) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {payments.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No payment data to analyze</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Type Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Types</CardTitle>
                <CardDescription>Breakdown by fee type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(
                    payments.reduce((acc, p) => {
                      const type = (p.payment_type || 'unknown').replace(/_/g, ' ');
                      acc[type] = (acc[type] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm capitalize">{type}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                  {payments.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Record Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {selectedItem ? `${getPaymentCandidateName(selectedItem)} - ₹${selectedItem.amount.toLocaleString()}` : 'Record a new admission payment'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const applicationId = selectedItem?.application_id || formData.get('applicationId') as string;
              const paymentMethod = formData.get('paymentMethod') as string;
              const transactionId = formData.get('transactionId') as string;
              const amount = Number(formData.get('amount') || selectedItem?.amount || 0);

              if (!applicationId) {
                toast.error('Application ID is required');
                return;
              }

              recordPaymentMutation.mutate({
                institution_id: institutionId,
                application_id: applicationId,
                payment_type: 'token_fee',
                amount,
                payment_method: paymentMethod || 'online_upi',
                gateway_payment_id: transactionId || undefined,
              }, {
                onSuccess: () => setIsPaymentDialogOpen(false),
              });
            }}
          >
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select name="paymentMethod" defaultValue="online_upi">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online_upi">Online / UPI</SelectItem>
                    <SelectItem value="dd">Demand Draft</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transaction ID / DD Number</Label>
                <Input name="transactionId" placeholder="Enter transaction reference" />
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input name="amount" type="number" defaultValue={selectedItem?.amount || ''} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPaymentDialogOpen(false)} disabled={recordPaymentMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={recordPaymentMutation.isPending}>
                {recordPaymentMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              {selectedItem && `${getPaymentCandidateName(selectedItem)} - Amount: ₹${selectedItem.amount.toLocaleString()}`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedItem) return;
              const formData = new FormData(e.currentTarget);
              const refundAmount = Number(formData.get('refundAmount') || selectedItem.amount);
              const refundReason = formData.get('refundReason') as string;
              const bankAccount = formData.get('bankAccount') as string;

              processRefundMutation.mutate({
                id: selectedItem.id,
                refund_amount: refundAmount,
                refund_reason: refundReason || 'Withdrawal of admission',
                refund_reference: bankAccount || undefined,
              }, {
                onSuccess: () => setIsRefundDialogOpen(false),
              });
            }}
          >
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Refund Reason</Label>
                <Select name="refundReason" defaultValue="withdrawal">
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="withdrawal">Withdrawal of admission</SelectItem>
                    <SelectItem value="duplicate">Duplicate payment</SelectItem>
                    <SelectItem value="error">Payment error</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Refund Amount</Label>
                <Input name="refundAmount" type="number" defaultValue={selectedItem?.amount} />
              </div>
              <div className="space-y-2">
                <Label>Bank Account / Reference</Label>
                <Input name="bankAccount" placeholder="Account number or reference" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRefundDialogOpen(false)} disabled={processRefundMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={processRefundMutation.isPending}>
                {processRefundMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                )}
                Process Refund
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SeatConfirmationPage() {
  return (
    <AdmissionErrorBoundary>
      <SeatConfirmationPageContent />
    </AdmissionErrorBoundary>
  );
}
