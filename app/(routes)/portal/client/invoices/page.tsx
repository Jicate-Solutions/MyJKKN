'use client';

import { useEffect, useState } from 'react';
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
  Download,
  ExternalLink,
} from 'lucide-react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
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

interface Payment {
  id: string;
  amount: number;
  payment_type: string;
  status: string;
  due_date: string | null;
  received_date: string | null;
  invoice_url: string | null;
  created_at: string;
  solution?: {
    id: string;
    title: string;
    solution_code: string;
  };
}

interface PaymentSummary {
  total: number;
  pending: number;
  paid: number;
  overdue: number;
}

export default function ClientInvoicesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({
    total: 0,
    pending: 0,
    paid: 0,
    overdue: 0,
  });
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    async function fetchPayments() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: client } = await (supabase as any).from('sh_clients')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!client) {
        setIsLoading(false);
        return;
      }

      // Get solutions for this client
      const { data: solutions } = await (supabase as any).from('sh_solutions')
        .select('id, title, solution_code')
        .eq('client_id', client.id);

      if (!solutions || solutions.length === 0) {
        setIsLoading(false);
        return;
      }

      const solutionIds = solutions.map(s => s.id);

      // Get payments
      const { data: paymentsData } = await (supabase as any).from('sh_payments')
        .select('id, amount, payment_type, status, due_date, received_date, invoice_url, created_at, solution_id')
        .in('solution_id', solutionIds)
        .order('created_at', { ascending: false });

      // Map payments with solution info
      const mappedPayments = (paymentsData || []).map(p => ({
        ...p,
        solution: solutions.find(s => s.id === p.solution_id),
      }));

      setPayments(mappedPayments);

      // Calculate summary
      let total = 0;
      let pending = 0;
      let paid = 0;
      let overdue = 0;

      mappedPayments.forEach(p => {
        total += p.amount;
        if (p.status === 'received') {
          paid += p.amount;
        } else if (p.status === 'overdue') {
          overdue += p.amount;
        } else {
          pending += p.amount;
        }
      });

      setSummary({ total, pending, paid, overdue });
      setIsLoading(false);
    }

    fetchPayments();
  }, []);

  // Filter payments by tab
  const filteredPayments = payments.filter((payment) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') {
      return payment.status === 'pending' || payment.status === 'invoiced';
    }
    if (activeTab === 'paid') return payment.status === 'received';
    if (activeTab === 'overdue') return payment.status === 'overdue';
    return true;
  });

  const counts = {
    all: payments.length,
    pending: payments.filter(
      (p) => p.status === 'pending' || p.status === 'invoiced'
    ).length,
    paid: payments.filter((p) => p.status === 'received').length,
    overdue: payments.filter((p) => p.status === 'overdue').length,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
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
            <div className="text-2xl font-bold">{formatCurrency(summary.total)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(summary.paid)}
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
              {formatCurrency(summary.pending)}
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
              {formatCurrency(summary.overdue)}
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
                        {format(new Date(payment.created_at), 'MMM d, yyyy')}
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
                        {payment.invoice_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={payment.invoice_url}
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
