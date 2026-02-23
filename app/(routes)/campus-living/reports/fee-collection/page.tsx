'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, ArrowLeft, IndianRupee, TrendingUp, AlertCircle, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useFeeCollectionReport, useExportReport } from '@/hooks/campus-living/use-campus-living-reports';

export default function FeeCollectionReportPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const { data: report, isLoading, isError } = useFeeCollectionReport(institutionId);
  const exportReport = useExportReport();

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  const hostelFees = report?.hostel_fees;
  const deposits = report?.deposits;
  const messBilling = report?.mess_billing;

  const totalAllocations = hostelFees?.total_active_allocations ?? 0;
  const paidCount = hostelFees?.paid ?? 0;
  const collectionRate = totalAllocations > 0 ? Math.round((paidCount / totalAllocations) * 100) : 0;

  return (
    <ContentLayout title="Fee Collection Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/campus-living/reports">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Fee Collection Report</h1>
              <p className="text-muted-foreground">Hostel and mess fee collection summary</p>
            </div>
          </div>
          <Button
            disabled={exportReport.isPending}
            onClick={() => exportReport.mutate({
              institutionId,
              reportType: 'fee-collection',
              format: 'json',
            })}
          >
            {exportReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Report
          </Button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">Failed to load fee collection data.</p>
          </div>
        )}

        {!isLoading && !isError && report && (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <IndianRupee className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Allocations</p>
                    <p className="text-2xl font-bold">{totalAllocations}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fully Paid</p>
                    <p className="text-2xl font-bold">{paidCount}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pending / Partial</p>
                    <p className="text-2xl font-bold">{(hostelFees?.pending ?? 0) + (hostelFees?.partial ?? 0)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Collection Rate</p>
                    <p className="text-2xl font-bold">{collectionRate}%</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Hostel Fees Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IndianRupee className="h-5 w-5" />
                  Hostel Fee Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="text-xl font-bold text-green-600">{hostelFees?.paid ?? 0}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-xl font-bold text-yellow-600">{hostelFees?.pending ?? 0}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Partial</p>
                    <p className="text-xl font-bold text-orange-600">{hostelFees?.partial ?? 0}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Waived</p>
                    <p className="text-xl font-bold text-gray-600">{hostelFees?.waived ?? 0}</p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Total Deposits Collected</p>
                  <p className="text-xl font-bold">{formatCurrency(hostelFees?.total_deposits_collected ?? 0)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Deposits Breakdown */}
            {deposits && Object.keys(deposits.by_type ?? {}).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Deposit Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {Object.entries(deposits.by_type).map(([type, info]) => (
                      <div key={type} className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground capitalize">{type.replace(/_/g, ' ')}</p>
                        <p className="text-lg font-bold">{formatCurrency(info.amount)}</p>
                        <p className="text-xs text-muted-foreground">{info.count} deposits</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 mt-4">
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                      Paid: {deposits.paid}
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                      Refunded: {deposits.refunded}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Mess Billing */}
            {messBilling && (
              <Card>
                <CardHeader>
                  <CardTitle>Mess Billing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Total Billed</p>
                      <p className="text-xl font-bold">{formatCurrency(messBilling.total_billed)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Paid</p>
                      <p className="text-xl font-bold text-green-600">{messBilling.paid}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="text-xl font-bold text-yellow-600">{messBilling.pending}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Overdue</p>
                      <p className="text-xl font-bold text-red-600">{messBilling.overdue}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
