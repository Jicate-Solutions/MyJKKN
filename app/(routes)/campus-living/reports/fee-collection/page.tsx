'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Download,
  ArrowLeft,
  IndianRupee,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Receipt,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useExportReport,
  useFeeCollectionReport,
} from '@/hooks/campus-living/use-campus-living-reports';
import { PreviewBanner } from '../../_components/preview-banner';

// Shape of generateFeeCollectionReport — aggregates only, no per-student rows.
type FeeCollectionReport = {
  report_type: 'fee_collection';
  generated_at: string;
  hostel_fees: {
    total_active_allocations: number;
    paid: number;
    pending: number;
    partial: number;
    waived: number;
    total_deposits_collected: number;
  };
  deposits: {
    total: number;
    by_type: Record<string, { count: number; amount: number }>;
    paid: number;
    refunded: number;
  };
  mess_billing: {
    total_billed: number;
    paid: number;
    pending: number;
    overdue: number;
  };
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

export default function FeeCollectionReportPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const exportReport = useExportReport();
  // Academic-year filter — the underlying RPC accepts an optional year id; we
  // keep this as a free-text field for now since institution academic-year
  // selection is owned by a separate workstream.
  const [academicYearId, setAcademicYearId] = useState<string>('');

  const { data: report, isLoading, error } = useFeeCollectionReport(
    institutionId,
    academicYearId || undefined,
  );
  const r = report as FeeCollectionReport | undefined;

  const hostelTotal = r?.hostel_fees.total_active_allocations ?? 0;
  const collectionRate =
    hostelTotal > 0
      ? Math.round(((r?.hostel_fees.paid ?? 0) / hostelTotal) * 100)
      : 0;

  const summaryStats = useMemo(
    () => [
      {
        label: 'Active Allocations',
        value: String(hostelTotal),
        icon: Receipt,
        color: 'text-blue-600',
      },
      {
        label: 'Hostel Fees Paid',
        value: String(r?.hostel_fees.paid ?? 0),
        icon: CheckCircle2,
        color: 'text-green-600',
      },
      {
        label: 'Mess Billed (Total)',
        value: formatCurrency(r?.mess_billing.total_billed ?? 0),
        icon: IndianRupee,
        color: 'text-indigo-600',
      },
      {
        label: 'Hostel Collection Rate',
        value: `${collectionRate}%`,
        icon: TrendingUp,
        color: 'text-primary',
      },
    ],
    [r, hostelTotal, collectionRate],
  );

  const depositRows = useMemo(() => {
    if (!r?.deposits.by_type) return [];
    return Object.entries(r.deposits.by_type).map(([type, info]) => ({
      type,
      count: info.count,
      amount: info.amount,
    }));
  }, [r]);

  if (isLoading) {
    return (
      <ContentLayout title="Fee Collection Report">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Fee Collection Report">
      <div className="space-y-6">
        <PreviewBanner
          feature="fee collection report"
          note="Summary cards and aggregate tables now read live from hostel_allocations, hostel_deposits, and mess_student_billing. Per-student drill-down remains a future enhancement."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/campus-living/reports">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Fee Collection Report</h1>
              <p className="text-muted-foreground">
                Hostel allocation fee status, deposits, and mess billing summary
              </p>
            </div>
          </div>
          <Button
            disabled={exportReport.isPending}
            onClick={() =>
              exportReport.mutate({
                institutionId,
                reportType: 'fee-collection',
                format: 'json',
                filters: { academicYearId: academicYearId || undefined },
              })
            }
          >
            {exportReport.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Report
          </Button>
        </div>

        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load fee data:{' '}
              {error instanceof Error ? error.message : 'unknown error'}
            </CardContent>
          </Card>
        ) : null}

        {/* Academic year filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">
                  Academic Year ID (optional — leave blank for current snapshot)
                </p>
                <Input
                  type="text"
                  placeholder="e.g. 2025-26 academic year UUID"
                  value={academicYearId}
                  onChange={(e) => setAcademicYearId(e.target.value)}
                  className="w-full sm:w-[420px]"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryStats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Hostel fees breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Hostel Fee Status (Active Allocations)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{hostelTotal}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-2xl font-bold text-green-600">
                  {r?.hostel_fees.paid ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Partial</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {r?.hostel_fees.partial ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-red-600">
                  {r?.hostel_fees.pending ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Waived</p>
                <p className="text-2xl font-bold text-muted-foreground">
                  {r?.hostel_fees.waived ?? 0}
                </p>
              </div>
            </div>
            <div className="mt-4 text-sm">
              Total deposits collected:{' '}
              <span className="font-semibold">
                {formatCurrency(r?.hostel_fees.total_deposits_collected ?? 0)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Deposits by type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              Deposits by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {depositRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <IndianRupee className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-medium">No deposit records found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No deposits have been recorded for this institution.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deposit Type</TableHead>
                    <TableHead className="text-center">Count</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depositRows.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="font-medium capitalize">{row.type}</TableCell>
                      <TableCell className="text-center">{row.count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="mt-4 flex gap-2 text-sm">
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                Paid: {r?.deposits.paid ?? 0}
              </Badge>
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                Refunded: {r?.deposits.refunded ?? 0}
              </Badge>
              <Badge variant="outline">Total: {r?.deposits.total ?? 0}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Mess billing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Mess Billing Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Billed (₹)</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(r?.mess_billing.total_billed ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paid (invoices)</p>
                <p className="text-2xl font-bold text-green-600">
                  {r?.mess_billing.paid ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {r?.mess_billing.pending ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">
                  {r?.mess_billing.overdue ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
