'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
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
import {
  IndianRupee,
  FileText,
  CalendarDays,
  Plus,
  Download,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useMessBillingPeriods } from '@/hooks/campus-living/use-mess-billing';

export default function MessBillingPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const { data, isLoading } = useMessBillingPeriods(institutionId);

  if (isLoading) {
    return (
      <ContentLayout title="Mess Billing">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const billingPeriods = (data as any)?.data || data || [];

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
      case 'closed':
        return <Badge variant="secondary">Closed</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Mess Billing">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mess Billing</h1>
            <p className="text-muted-foreground">
              Manage billing periods and student-wise mess charges
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Generate Billing
          </Button>
        </div>

        {/* Summary Cards */}
        {(() => {
          const activePeriod = billingPeriods.find((p: any) => p.status === 'active') || billingPeriods[0];
          const collected = activePeriod?.collected ?? 0;
          const totalAmount = activePeriod?.total_amount ?? 0;
          const pending = activePeriod?.pending ?? 0;
          const collectionRate = totalAmount > 0 ? Math.round((collected / totalAmount) * 100) : 0;
          return (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Current Period</CardTitle>
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{activePeriod?.period ?? 'N/A'}</div>
                  <p className="text-xs text-muted-foreground">{activePeriod?.total_students ?? 0} students enrolled</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Collected</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(collected)}</div>
                  <p className="text-xs text-muted-foreground">{collectionRate}% collection rate</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Pending</CardTitle>
                  <Clock className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{formatCurrency(pending)}</div>
                  <p className="text-xs text-muted-foreground">{activePeriod?.total_students ? Math.round(pending / (totalAmount / activePeriod.total_students)) : 0} students with dues</p>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* Billing Periods Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Billing Periods
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Collected</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billingPeriods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell className="font-medium">{period.period}</TableCell>
                    <TableCell>{period.total_students}</TableCell>
                    <TableCell>{formatCurrency(period.total_amount)}</TableCell>
                    <TableCell className="text-green-600">
                      {formatCurrency(period.collected)}
                    </TableCell>
                    <TableCell className={period.pending > 0 ? 'text-yellow-600' : ''}>
                      {formatCurrency(period.pending)}
                    </TableCell>
                    <TableCell>{getStatusBadge(period.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/campus-living/mess/billing/${period.id}`}>View</Link>
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
