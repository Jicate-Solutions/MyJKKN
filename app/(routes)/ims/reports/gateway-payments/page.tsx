'use client';

// Gateway Payments — every verified counter collection, whatever became of it.
//
// The UPI Audit Report next door reads ims_sales, so it can only show a payment that
// already became a sale. This reads ims_gateway_payments, so it also shows the ones
// that did not: failed, cancelled, expired, the wrong amount, or paid-but-not-yet-
// booked. Those are the rows somebody actually has to act on, and until now there
// was nowhere to see them.

import { useState, useMemo } from 'react';
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsGatewayPaymentsReport } from '@/hooks/ims/use-ims-reports';
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
  ShieldCheck,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { useRouter } from 'next/navigation';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);

type DatePreset = 'today' | 'week' | 'month' | 'custom';

/** Status → how it should read at a glance. */
const STATUS_STYLE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  paid:            { label: 'Paid',           variant: 'default' },
  initiated:       { label: 'Waiting',        variant: 'secondary' },
  expired:         { label: 'Expired',        variant: 'outline' },
  failed:          { label: 'Failed',         variant: 'destructive' },
  cancelled:       { label: 'Cancelled',      variant: 'outline' },
  amount_mismatch: { label: 'Wrong amount',   variant: 'destructive' },
};

export default function GatewayPaymentsReportPage() {
  return (
    <ImsPageGuard module="ims.reports" action="view">
      <GatewayPaymentsReportPageInner />
    </ImsPageGuard>
  );
}

function GatewayPaymentsReportPageInner() {
  const router = useRouter();
  const { storeId, institutionId } = useImsStoreContext();

  const [preset, setPreset] = useState<DatePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case 'today':
        return { dateFrom: startOfDay(now).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'week':
        return {
          dateFrom: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
          dateTo: endOfDay(now).toISOString(),
        };
      case 'month':
        return { dateFrom: startOfMonth(now).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'custom':
        return {
          dateFrom: customFrom ? `${customFrom}T00:00:00.000Z` : '',
          dateTo: customTo ? `${customTo}T23:59:59.999Z` : '',
        };
      default:
        return { dateFrom: '', dateTo: '' };
    }
  }, [preset, customFrom, customTo]);

  const { data: report, isLoading } = useImsGatewayPaymentsReport(
    storeId || '',
    dateFrom,
    dateTo,
    institutionId
  );

  return (
    <ContentLayout title="Gateway Payments">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/ims/reports')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Gateway Payments</h2>
            <p className="text-muted-foreground">
              Verified counter collections — who paid, from where, and the bank reference
            </p>
          </div>
        </div>

        {/* Date Range Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-wrap gap-2">
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
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full sm:w-40"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full sm:w-40"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <BeatLoader color="hsl(var(--primary))" size={10} />
          </div>
        ) : report ? (
          <>
            {/* Summary */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                icon={<IndianRupee className="h-5 w-5 text-teal-600" />}
                label="Collected"
                value={formatCurrency(report.summary.collected_amount)}
              />
              <SummaryCard
                icon={<ShieldCheck className="h-5 w-5 text-teal-600" />}
                label="Verified payments"
                value={String(report.summary.collected_count)}
              />
              <SummaryCard
                icon={<XCircle className="h-5 w-5 text-muted-foreground" />}
                label="Not completed"
                value={String(report.summary.failed_count)}
              />
              {/* Called out separately because it is the only figure here that
                  requires somebody to DO something. */}
              <SummaryCard
                icon={
                  <AlertTriangle
                    className={
                      report.summary.needs_attention_count > 0
                        ? 'h-5 w-5 text-amber-600'
                        : 'h-5 w-5 text-muted-foreground'
                    }
                  />
                }
                label="Needs attention"
                value={String(report.summary.needs_attention_count)}
                highlight={report.summary.needs_attention_count > 0}
              />
            </div>

            {report.summary.gateway_fee > 0 && (
              <p className="text-xs text-muted-foreground">
                Razorpay charged {formatCurrency(report.summary.gateway_fee)} in fees on
                these collections.
              </p>
            )}

            {/* Transactions */}
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Paid from</TableHead>
                        <TableHead>Bank ref</TableHead>
                        <TableHead>Razorpay payment</TableHead>
                        <TableHead>Sale</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Cashier</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            No gateway payments for the selected period
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.transactions.map((txn) => {
                          const style = STATUS_STYLE[txn.status] ?? {
                            label: txn.status,
                            variant: 'secondary' as const,
                          };
                          const stranded = txn.status === 'paid' && !txn.sale_id;

                          return (
                            <TableRow
                              key={txn.id}
                              className={
                                txn.sale_id
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'hover:bg-muted/50'
                              }
                              onClick={() =>
                                txn.sale_id && router.push(`/ims/sales/${txn.sale_id}`)
                              }
                            >
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <Badge variant={style.variant}>{style.label}</Badge>
                                  {txn.late_credit && (
                                    <span className="text-[10px] text-muted-foreground">
                                      late credit
                                    </span>
                                  )}
                                </div>
                              </TableCell>

                              <TableCell className="text-right font-mono font-medium">
                                {formatCurrency(txn.amount)}
                                {/* Show what actually arrived only when it differs —
                                    that difference is the whole point of the row. */}
                                {txn.captured_amount != null &&
                                  txn.captured_amount !== txn.amount && (
                                    <div className="text-xs text-destructive">
                                      got {formatCurrency(txn.captured_amount)}
                                    </div>
                                  )}
                              </TableCell>

                              <TableCell>
                                {txn.payer_vpa ? (
                                  <div className="flex flex-col">
                                    <code className="text-xs">{txn.payer_vpa}</code>
                                    <span className="text-[10px] text-muted-foreground uppercase">
                                      {txn.gateway_method}
                                    </span>
                                  </div>
                                ) : txn.gateway_method ? (
                                  <span className="text-xs uppercase">{txn.gateway_method}</span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>

                              <TableCell>
                                {txn.bank_rrn ? (
                                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                    {txn.bank_rrn}
                                  </code>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>

                              <TableCell>
                                {txn.razorpay_payment_id ? (
                                  <code className="text-xs">{txn.razorpay_payment_id}</code>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>

                              <TableCell>
                                {txn.sale_number ? (
                                  <span className="font-mono text-xs font-medium">
                                    {txn.sale_number}
                                  </span>
                                ) : stranded ? (
                                  <span className="text-xs text-amber-600">not booked</span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
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

                              <TableCell className="text-muted-foreground whitespace-nowrap">
                                {format(new Date(txn.created_at), 'dd MMM yyyy, hh:mm a')}
                              </TableCell>
                            </TableRow>
                          );
                        })
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

function SummaryCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-amber-500/50' : undefined}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30">{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
