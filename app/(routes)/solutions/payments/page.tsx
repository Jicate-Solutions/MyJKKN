import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { Plus, DollarSign, Clock, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'Payments | Solutions Hub',
  description: 'Track payments and revenue',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PaymentsPage() {
  // Placeholder data
  const payments = [
    {
      id: '1',
      solution: { code: 'JKKN-SOL-2026-001', title: 'Student Portal' },
      amount: 150000,
      payment_type: 'advance',
      status: 'received',
      due_date: '2026-01-20',
      paid_at: '2026-01-18',
      reference: 'UTR123456789',
    },
    {
      id: '2',
      solution: { code: 'JKKN-SOL-2026-002', title: 'HR System' },
      amount: 75000,
      payment_type: 'milestone',
      status: 'pending',
      due_date: '2026-02-15',
      paid_at: null,
      reference: null,
    },
    {
      id: '3',
      solution: { code: 'JKKN-SOL-2026-001', title: 'Student Portal' },
      amount: 200000,
      payment_type: 'milestone',
      status: 'invoiced',
      due_date: '2026-03-01',
      paid_at: null,
      reference: 'INV-2026-003',
    },
    {
      id: '4',
      solution: { code: 'JKKN-SOL-2026-003', title: 'Marketing Package' },
      amount: 50000,
      payment_type: 'completion',
      status: 'overdue',
      due_date: '2026-01-30',
      paid_at: null,
      reference: 'INV-2026-001',
    },
  ];

  const stats = {
    totalReceived: payments.filter((p) => p.status === 'received').reduce((s, p) => s + p.amount, 0),
    totalPending: payments.filter((p) => p.status === 'pending' || p.status === 'invoiced').reduce((s, p) => s + p.amount, 0),
    totalOverdue: payments.filter((p) => p.status === 'overdue').reduce((s, p) => s + p.amount, 0),
  };

  const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    invoiced: { label: 'Invoiced', color: 'bg-blue-100 text-blue-800', icon: DollarSign },
    received: { label: 'Received', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
    overdue: { label: 'Overdue', color: 'bg-red-100 text-red-800', icon: AlertCircle },
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

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="p-3 rounded-full bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalReceived)}</p>
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
                <p className="text-2xl font-bold text-yellow-600">{formatCurrency(stats.totalPending)}</p>
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
                <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.totalOverdue)}</p>
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
                  const status = statusConfig[payment.status];
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{payment.solution.title}</p>
                          <p className="text-sm text-muted-foreground">{payment.solution.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{typeLabels[payment.payment_type]}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge className={status.color}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(payment.due_date), 'dd MMM yyyy')}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.reference || '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
