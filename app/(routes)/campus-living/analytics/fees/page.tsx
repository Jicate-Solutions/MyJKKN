'use client';

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IndianRupee, TrendingUp, Users, AlertTriangle, Loader2 } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAuth } from '@/hooks/use-auth';
import { useFeeCollectionReport } from '@/hooks/campus-living/use-campus-living-reports';
import { PreviewBanner } from '../../_components/preview-banner';

const formatINR = (amount: number) =>
  amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(220 70% 50%)',
  'hsl(142 71% 45%)',
  'hsl(38 92% 50%)',
];

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

export default function FeeAnalyticsPage() {
  const [period, setPeriod] = useState('current');
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const { data: report, isLoading, error } = useFeeCollectionReport(institutionId);
  const r = report as FeeCollectionReport | undefined;

  const allocationStatusData = useMemo(() => {
    if (!r?.hostel_fees) return [];
    return [
      { name: 'Paid', value: r.hostel_fees.paid },
      { name: 'Pending', value: r.hostel_fees.pending },
      { name: 'Partial', value: r.hostel_fees.partial },
      { name: 'Waived', value: r.hostel_fees.waived },
    ].filter((d) => d.value > 0);
  }, [r]);

  const depositByTypeData = useMemo(() => {
    if (!r?.deposits.by_type) return [];
    return Object.entries(r.deposits.by_type).map(([name, data]) => ({
      name,
      Amount: (data as { count: number; amount: number }).amount,
      Count: (data as { count: number; amount: number }).count,
    }));
  }, [r]);

  if (isLoading) {
    return (
      <ContentLayout title="Fee Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Fee Analytics">
        <div className="p-6 text-sm text-destructive">
          Failed to load fee analytics: {(error as Error).message}
        </div>
      </ContentLayout>
    );
  }

  const totalAlloc = r?.hostel_fees.total_active_allocations ?? 0;
  const paid = r?.hostel_fees.paid ?? 0;
  const pending = r?.hostel_fees.pending ?? 0;
  const partial = r?.hostel_fees.partial ?? 0;
  const defaulters = pending + partial;
  const collectionRate = totalAlloc > 0 ? Math.round((paid / totalAlloc) * 100) : 0;
  const depositsTotal = r?.hostel_fees.total_deposits_collected ?? 0;
  const messBilled = r?.mess_billing.total_billed ?? 0;
  const messOverdue = r?.mess_billing.overdue ?? 0;

  return (
    <ContentLayout title="Fee Analytics">
      <div className="space-y-6">
        <PreviewBanner
          feature="fee collection analytics"
          note="Hostel-allocation status, deposit totals, and mess-billing summary are now live via generateFeeCollectionReport. Time-series collection trend stays a placeholder pending a monthly aggregation."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Fee Collection Analytics</h1>
            <p className="text-muted-foreground">Revenue tracking, collection rates, and defaulter analysis</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Semester</SelectItem>
              <SelectItem value="previous">Previous Semester</SelectItem>
              <SelectItem value="1y">Full Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Active Allocations</CardTitle><IndianRupee className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAlloc}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Collection Rate</CardTitle><TrendingUp className="h-4 w-4 text-green-600" /></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${collectionRate >= 80 ? 'text-green-600' : collectionRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                {collectionRate}%
              </div>
              <p className="text-xs text-muted-foreground">{paid} of {totalAlloc} paid</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Deposits Collected</CardTitle><AlertTriangle className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatINR(depositsTotal)}</div>
              <p className="text-xs text-muted-foreground">{r?.deposits.total ?? 0} records</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Defaulters</CardTitle><Users className={`h-4 w-4 ${defaulters > 0 ? 'text-red-600' : 'text-muted-foreground'}`} /></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${defaulters > 0 ? 'text-red-600' : 'text-green-600'}`}>{defaulters}</div>
              <p className="text-xs text-muted-foreground">pending + partial</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Mess Billing Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <p className="text-xs text-muted-foreground">Total Billed</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatINR(messBilled)}</p>
              </div>
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-300">{r?.mess_billing.paid ?? 0}</p>
              </div>
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{r?.mess_billing.pending ?? 0}</p>
              </div>
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30">
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-300">{messOverdue}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Allocation Fee Status</CardTitle></CardHeader>
            <CardContent>
              {allocationStatusData.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">No allocation data.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={allocationStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {allocationStatusData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--popover-foreground))',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Deposits by Type</CardTitle></CardHeader>
            <CardContent>
              {depositByTypeData.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">No deposit data.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {depositByTypeData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <div>
                        <p className="font-medium capitalize text-sm">{d.name.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{d.Count} records</p>
                      </div>
                      <p className="font-semibold">{formatINR(d.Amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Collection Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-sm">
                Monthly collection trend requires a time-bucketed aggregation (queued).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
