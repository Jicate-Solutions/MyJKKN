'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Receipt,
  Clock,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import {
  useCurrentClient,
  useClientPayments,
  useClientPaymentSummary,
} from '@/hooks/solutions';
import { format } from 'date-fns';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  invoiced: 'bg-blue-100 text-blue-700',
  received: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  invoiced: 'Invoiced',
  received: 'Paid',
  overdue: 'Overdue',
};

export default function ClientInvoicesPage() {
  const [activeTab, setActiveTab] = useState('all');

  const { data: client, isLoading: clientLoading, error: clientError } = useCurrentClient();
  const clientId = client?.id;

  const { data: payments, isLoading: paymentsLoading } = useClientPayments(clientId ?? '');
  const { data: summary, isLoading: summaryLoading } = useClientPaymentSummary(clientId ?? '');

  // Only consider other queries loading if we have a client
  const isLoading = clientLoading || (!!clientId && (paymentsLoading || summaryLoading));
  const paymentsList = useMemo(() => payments || [], [payments]);

  // Filter payments by tab
  const filteredPayments = useMemo(() => {
    return paymentsList.filter((payment) => {
      if (activeTab === 'all') return true;
      if (activeTab === 'pending') {
        return payment.status === 'pending' || payment.status === 'processing';
      }
      if (activeTab === 'paid') return payment.status === 'completed';
      if (activeTab === 'overdue') return payment.status === 'failed';
      return true;
    });
  }, [paymentsList, activeTab]);

  const counts = useMemo(() => ({
    all: paymentsList.length,
    pending: paymentsList.filter(
      (p) => p.status === 'pending' || p.status === 'processing'
    ).length,
    paid: paymentsList.filter((p) => p.status === 'completed').length,
    overdue: paymentsList.filter((p) => p.status === 'failed').length,
  }), [paymentsList]);

  // Error state
  if (clientError) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Error Loading Invoices</h2>
            <p className="text-muted-foreground mb-4">
              {clientError instanceof Error ? clientError.message : 'Failed to load data'}
            </p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground">
          View your payment history and outstanding invoices
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Billed</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.total || 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(summary?.paid || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(summary?.pending || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary?.overdue || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue warning */}
      {counts.overdue > 0 && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <p className="text-sm text-red-800">
                You have <strong>{counts.overdue}</strong> overdue invoice
                {counts.overdue !== 1 ? 's' : ''}. Please make payment as soon as
                possible.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <Receipt className="h-4 w-4" />
            All ({counts.all})
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending ({counts.pending})
          </TabsTrigger>
          <TabsTrigger value="paid" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Paid ({counts.paid})
          </TabsTrigger>
          {counts.overdue > 0 && (
            <TabsTrigger value="overdue" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Overdue ({counts.overdue})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredPayments.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Solution</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {payment.created_at ? format(new Date(payment.created_at), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{payment.solution?.title || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {payment.solution?.solution_code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.payment_type.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        {payment.due_date
                          ? format(new Date(payment.due_date), 'MMM d, yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[payment.status]}>
                          {statusLabels[payment.status] || payment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {(payment as any).invoice_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={(payment as any).invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Invoice
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {activeTab === 'pending'
                    ? 'No pending invoices'
                    : activeTab === 'paid'
                    ? 'No paid invoices'
                    : 'No invoices found'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
