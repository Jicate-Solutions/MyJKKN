import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TrendingUp, Users, Building2, GraduationCap, Wallet, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'Earnings Ledger | Solutions Hub',
  description: 'Track revenue splits and earnings distribution',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function EarningsPage() {
  // Placeholder data
  const earnings = [
    {
      id: '1',
      payment: { id: '1', solution: { code: 'JKKN-SOL-2026-001', title: 'Student Portal' }, amount: 150000 },
      recipient_type: 'builder',
      recipient_name: 'John Doe',
      department: null,
      amount: 60000,
      percentage: 40,
      status: 'paid',
      processed_at: '2026-01-20',
    },
    {
      id: '2',
      payment: { id: '1', solution: { code: 'JKKN-SOL-2026-001', title: 'Student Portal' }, amount: 150000 },
      recipient_type: 'department',
      recipient_name: 'Computer Science',
      department: { name: 'Computer Science' },
      amount: 45000,
      percentage: 30,
      status: 'paid',
      processed_at: '2026-01-20',
    },
    {
      id: '3',
      payment: { id: '1', solution: { code: 'JKKN-SOL-2026-001', title: 'Student Portal' }, amount: 150000 },
      recipient_type: 'jicate',
      recipient_name: 'JICATE',
      department: null,
      amount: 22500,
      percentage: 15,
      status: 'paid',
      processed_at: '2026-01-20',
    },
    {
      id: '4',
      payment: { id: '2', solution: { code: 'JKKN-SOL-2026-002', title: 'AI Workshop' }, amount: 100000 },
      recipient_type: 'cohort_member',
      recipient_name: 'Dr. Sarah Wilson',
      department: null,
      amount: 60000,
      percentage: 60,
      status: 'pending',
      processed_at: null,
    },
  ];

  const stats = {
    totalDistributed: earnings.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amount, 0),
    totalPending: earnings.filter((e) => e.status === 'pending').reduce((s, e) => s + e.amount, 0),
    buildersEarned: earnings.filter((e) => e.recipient_type === 'builder' && e.status === 'paid').reduce((s, e) => s + e.amount, 0),
    cohortEarned: earnings.filter((e) => e.recipient_type === 'cohort_member' && e.status === 'paid').reduce((s, e) => s + e.amount, 0),
  };

  const recipientConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    builder: { label: 'Builder', icon: Users, color: 'bg-blue-100 text-blue-800' },
    cohort_member: { label: 'Cohort', icon: GraduationCap, color: 'bg-green-100 text-green-800' },
    production_learner: { label: 'Production', icon: Users, color: 'bg-purple-100 text-purple-800' },
    department: { label: 'Department', icon: Building2, color: 'bg-orange-100 text-orange-800' },
    jicate: { label: 'JICATE', icon: Building2, color: 'bg-indigo-100 text-indigo-800' },
    institution: { label: 'Institution', icon: Building2, color: 'bg-gray-100 text-gray-800' },
  };

  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'secondary' },
    processed: { label: 'Processed', variant: 'outline' },
    paid: { label: 'Paid', variant: 'default' },
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

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingUp className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalDistributed)}</p>
                <p className="text-sm text-muted-foreground">Total Distributed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Wallet className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalPending)}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.buildersEarned)}</p>
                <p className="text-sm text-muted-foreground">Builders Earned</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <GraduationCap className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.cohortEarned)}</p>
                <p className="text-sm text-muted-foreground">Cohort Earned</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Earnings History</CardTitle>
            <CardDescription>Revenue distribution to stakeholders</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
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
                  const recipient = recipientConfig[earning.recipient_type];
                  const RecipientIcon = recipient?.icon || Users;
                  const status = statusConfig[earning.status];

                  return (
                    <TableRow key={earning.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{earning.payment.solution.title}</p>
                          <p className="text-sm text-muted-foreground">{earning.payment.solution.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={recipient.color}>
                            <RecipientIcon className="mr-1 h-3 w-3" />
                            {recipient.label}
                          </Badge>
                          <span>{earning.recipient_name}</span>
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
                        {earning.processed_at ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(earning.processed_at), 'dd MMM yyyy')}
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
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
