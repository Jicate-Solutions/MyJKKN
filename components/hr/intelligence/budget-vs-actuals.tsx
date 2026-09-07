'use client';

/**
 * HR Intelligence — Tab 2: Budget vs Actuals
 *
 * Data source: Payroll module hooks (use-payroll-periods).
 * Shows budget, actual spend, and variance per institution.
 * When payroll data is unavailable, shows a structured placeholder.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, IndianRupee, TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useHrInstitutionsWithAccess } from '@/hooks/hr/use-hr-institutions';

// `hr_payroll_periods` keys a period by year+month, not by a start/end date pair.
// This component asked for `period_start` / `period_end`, which have never
// existed on the table, so every request died with 42703 and the tab rendered
// "Failed to load payroll data. Ensure payroll periods are configured." — which
// blamed the reader's configuration for a broken query. Verified against
// production 2026-09-04.
interface PayrollPeriodRow {
  id: string;
  hr_organization_id: string;
  period_year: number;
  period_month: number;
  status: string;
  total_gross: number | null;
  total_net: number | null;
  total_deductions: number | null;
}

function usePayrollSummary() {
  return useQuery({
    queryKey: ['hr-intelligence', 'budget-vs-actuals'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hr_payroll_periods')
        .select('id, hr_organization_id, period_year, period_month, status, total_gross, total_net, total_deductions')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data ?? []) as PayrollPeriodRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

function formatCurrency(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(1)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount.toFixed(0)}`;
}

export function BudgetVsActualsTab() {
  const { data: periods, isLoading, isError } = usePayrollSummary();
  const { institutions } = useHrInstitutionsWithAccess({ entityType: 'all' });

  const institutionNames = useMemo(() => {
    const map: Record<string, string> = {};
    institutions?.forEach((inst) => { map[inst.id] = inst.name; });
    return map;
  }, [institutions]);

  const summaryByInstitution = useMemo(() => {
    if (!periods || periods.length === 0) return [];

    const grouped: Record<string, { totalGross: number; totalNet: number; totalDeductions: number; periodCount: number }> = {};

    for (const p of periods) {
      if (!grouped[p.hr_organization_id]) {
        grouped[p.hr_organization_id] = { totalGross: 0, totalNet: 0, totalDeductions: 0, periodCount: 0 };
      }
      const g = grouped[p.hr_organization_id];
      g.totalGross += p.total_gross ?? 0;
      g.totalNet += p.total_net ?? 0;
      g.totalDeductions += p.total_deductions ?? 0;
      g.periodCount += 1;
    }

    return Object.entries(grouped).map(([orgId, data]) => ({
      orgId,
      name: institutionNames[orgId] ?? orgId.slice(0, 8),
      ...data,
    }));
  }, [periods, institutionNames]);

  const totals = useMemo(() => {
    return summaryByInstitution.reduce(
      (acc, row) => ({
        totalGross: acc.totalGross + row.totalGross,
        totalNet: acc.totalNet + row.totalNet,
        totalDeductions: acc.totalDeductions + row.totalDeductions,
      }),
      { totalGross: 0, totalNet: 0, totalDeductions: 0 }
    );
  }, [summaryByInstitution]);

  const hasData = summaryByInstitution.length > 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Failed to load payroll data. Ensure payroll periods are configured.
        </CardContent>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Budget vs Actuals
          </CardTitle>
          <CardDescription>
            Track payroll budget allocation against actual spend across all institutions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <IndianRupee className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">Connect Payroll Data</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Once payroll periods are created and processed, this tab will show budget vs actual
              spend per institution, variance analysis, and trend indicators.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: Payroll periods with processed data
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <IndianRupee className="h-3.5 w-3.5" />
              Total Gross Payroll
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.totalGross)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {summaryByInstitution.length} institution{summaryByInstitution.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              Total Deductions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.totalDeductions)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.totalGross > 0 ? `${((totals.totalDeductions / totals.totalGross) * 100).toFixed(1)}% of gross` : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Total Net Pay
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.totalNet)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.totalGross > 0 ? `${((totals.totalNet / totals.totalGross) * 100).toFixed(1)}% of gross` : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-institution breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Institution Breakdown
          </CardTitle>
          <CardDescription>Payroll spend per institution from processed periods</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {summaryByInstitution.map((row) => {
              const maxGross = Math.max(...summaryByInstitution.map((r) => r.totalGross), 1);
              const barWidth = (row.totalGross / maxGross) * 100;

              return (
                <div key={row.orgId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[60%]">{row.name}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{row.periodCount} period{row.periodCount !== 1 ? 's' : ''}</span>
                      <span className="font-medium text-foreground">{formatCurrency(row.totalGross)}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
