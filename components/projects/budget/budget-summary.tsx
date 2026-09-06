'use client';

/**
 * Budget Summary Card
 *
 * Shows totals: planned vs actual vs forecast, overall variance (planned -
 * actual), and a simple burn indicator (actual / planned %).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F6.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, IndianRupee } from 'lucide-react';
import type { ProjectBudget } from '@/types/projects';

function fmtINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function BurnBadge({ burnPct }: { burnPct: number }) {
  if (burnPct >= 100) {
    return (
      <Badge variant="destructive" className="gap-1">
        <TrendingUp className="h-3 w-3" />
        {burnPct.toFixed(0)}% burned — over budget
      </Badge>
    );
  }
  if (burnPct >= 80) {
    return (
      <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800">
        <TrendingUp className="h-3 w-3" />
        {burnPct.toFixed(0)}% burned — near limit
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-800">
      <TrendingDown className="h-3 w-3" />
      {burnPct.toFixed(0)}% burned
    </Badge>
  );
}

interface BudgetSummaryProps {
  lines: ProjectBudget[];
}

export function BudgetSummary({ lines }: BudgetSummaryProps) {
  const totalPlanned = lines.reduce((s, l) => s + (l.planned_amount_inr ?? 0), 0);
  const totalActual = lines.reduce((s, l) => s + (l.actual_amount_inr ?? 0), 0);
  const totalForecast = lines.reduce(
    (s, l) => s + (l.forecast_amount_inr ?? l.planned_amount_inr ?? 0),
    0
  );

  const variance = totalPlanned - totalActual;
  const burnPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const forecastVariance = totalPlanned - totalForecast;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Planned
          </CardTitle>
          <IndianRupee className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{fmtINR(totalPlanned)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Approved budget</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Actual Spend
          </CardTitle>
          <IndianRupee className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{fmtINR(totalActual)}</p>
          <div className="mt-1">
            <BurnBadge burnPct={burnPct} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Forecast
          </CardTitle>
          <IndianRupee className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{fmtINR(totalForecast)}</p>
          <p
            className={`mt-1 text-xs font-medium ${
              forecastVariance < 0 ? 'text-destructive' : 'text-emerald-600'
            }`}
          >
            {forecastVariance >= 0 ? '+' : ''}
            {fmtINR(forecastVariance)} vs plan
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Variance (Plan − Actual)
          </CardTitle>
          <IndianRupee className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p
            className={`text-2xl font-bold ${
              variance < 0 ? 'text-destructive' : 'text-emerald-600'
            }`}
          >
            {variance >= 0 ? '+' : ''}
            {fmtINR(variance)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lines.length} line{lines.length !== 1 ? 's' : ''}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
