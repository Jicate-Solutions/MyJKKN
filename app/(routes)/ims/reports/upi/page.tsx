'use client';

import { useState, useMemo } from 'react';
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsUpiAuditReport } from '@/hooks/ims/use-ims-reports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  IndianRupee,
  Hash,
  TrendingUp,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { useRouter } from 'next/navigation';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);

type DatePreset = 'today' | 'week' | 'month' | 'custom';

export default function UpiAuditReportPage() {
  const router = useRouter();
  const { storeId, institutionId } = useImsStoreContext();

  const [preset, setPreset] = useState<DatePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Compute date range from preset
  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case 'today':
        return {
          dateFrom: startOfDay(now).toISOString(),
          dateTo: endOfDay(now).toISOString(),
        };
      case 'week':
        return {
          dateFrom: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
          dateTo: endOfDay(now).toISOString(),
        };
      case 'month':
        return {
          dateFrom: startOfMonth(now).toISOString(),
          dateTo: endOfDay(now).toISOString(),
        };
      case 'custom':
        return {
          dateFrom: customFrom ? `${customFrom}T00:00:00.000Z` : '',
          dateTo: customTo ? `${customTo}T23:59:59.999Z` : '',
        };
      default:
        return { dateFrom: '', dateTo: '' };
    }
  }, [preset, customFrom, customTo]);

  const { data: report, isLoading } = useImsUpiAuditReport(
    storeId || '',
    dateFrom,
    dateTo,
    institutionId
  );

  return (
    <ContentLayout title="UPI Audit Report">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/ims/reports')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                UPI Audit Report
              </h2>
              <p className="text-muted-foreground">
                Reconcile UPI QR payments against bank statements
              </p>
            </div>
          </div>
        </div>

        {/* Date Range Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex gap-2">
                {(['today', 'week', 'month'] as DatePreset[]).map((p) => (
                  <Button
                    key={p}
                    variant={preset === p ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreset(p)}
                  >
                    {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
                  </Button>
                ))}
                <Button
                  variant={preset === 'custom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreset('custom')}
                >
                  Custom
                </Button>
              </div>
              {preset === 'custom' && (
                <div className="flex gap-2 items-center">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-40"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-40"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <BeatLoader color="hsl(var(--primary))" size={10} />
          </div>
        ) : report ? (
          <>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30">
                      <IndianRupee className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total UPI Collections</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(report.summary.total_upi_amount)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30">
                      <Hash className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Transaction Count</p>
                      <p className="text-2xl font-bold">
                        {report.summary.transaction_count}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30">
                      <TrendingUp className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Amount</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(report.summary.avg_amount)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Transactions Table */}
            <Card>
              <CardHeader>
                <CardTitle>UPI Transactions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sale #</TableHead>
                        <TableHead className="text-right">UPI Amount</TableHead>
                        <TableHead>Transaction Ref</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Cashier</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.transactions.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center py-12 text-muted-foreground"
                          >
                            No UPI transactions found for the selected period
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.transactions.map((txn) => (
                          <TableRow
                            key={txn.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => router.push(`/ims/sales/${txn.id}`)}
                          >
                            <TableCell className="font-mono font-medium">
                              {txn.sale_number}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {formatCurrency(txn.upi_qr_amount)}
                            </TableCell>
                            <TableCell>
                              {txn.upi_qr_transaction_ref ? (
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                  {txn.upi_qr_transaction_ref}
                                </code>
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  No ref
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {txn.customer_name || (
                                <span className="text-muted-foreground">Walk-in</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {txn.cashier_name}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  txn.status === 'completed'
                                    ? 'default'
                                    : txn.status === 'cancelled'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                              >
                                {txn.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {format(new Date(txn.created_at), 'dd MMM yyyy, hh:mm a')}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </ContentLayout>
  );
}
