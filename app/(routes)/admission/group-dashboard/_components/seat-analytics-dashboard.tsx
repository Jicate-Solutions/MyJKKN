'use client';

import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Settings, Download } from 'lucide-react';
import Link from 'next/link';
import { useSeatAnalytics, useSeatDailyPivot } from '@/hooks/admission/use-group-dashboard';
import type { SeatAnalyticsRow, SeatPivotRow } from '@/types/admission-workflow-config';
import { SeatDetailsTable } from './seat-details-table';
import { SeatPivotGrid } from './seat-pivot-grid';

interface SeatAnalyticsDashboardProps {
  /** Institution scope passed from the page; undefined means RLS-resolved (super-admin all-access). */
  institutionIds?: string[];
  /** Selected admission year (program_start_year). Drives the Daily Pivot. */
  programStartYear: number | null;
}

function fillColor(pct: number) {
  if (pct >= 90) return '#22c55e';
  if (pct >= 70) return '#f59e0b';
  if (pct >= 50) return '#3b82f6';
  return '#ef4444';
}

function aggregateByInstitution(rows: SeatAnalyticsRow[]) {
  const map = new Map<string, { name: string; total: number; filled: number }>();
  for (const r of rows) {
    const cur = map.get(r.institution_id) ?? { name: r.institution_name, total: 0, filled: 0 };
    cur.total += r.total_seats;
    cur.filled += Number(r.filled_seats);
    map.set(r.institution_id, cur);
  }
  return [...map.values()].map((v) => ({
    name: v.name.length > 18 ? v.name.slice(0, 16) + '…' : v.name,
    filled: v.filled,
    balance: Math.max(0, v.total - v.filled),
    pct: v.total > 0 ? Math.round((v.filled / v.total) * 100) : 0,
  }));
}

// XLSX export of the daily pivot — preserves group rows + per-day columns.
function exportPivotToXlsx(rows: SeatPivotRow[], programStartYear: number | null) {
  if (rows.length === 0) return;

  const dateSet = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.daily_counts)) dateSet.add(k);
  const dates = Array.from(dateSet).sort();

  const groups = new Map<string, SeatPivotRow[]>();
  const groupOrder: string[] = [];
  for (const r of rows) {
    if (!groups.has(r.group_label)) {
      groups.set(r.group_label, []);
      groupOrder.push(r.group_label);
    }
    groups.get(r.group_label)!.push(r);
  }

  const aoa: (string | number)[][] = [];
  const header = ['S NO', 'COURSE NAME', 'INTAKE', 'TOTAL', 'BALANCE', '%', ...dates];
  aoa.push(header);

  let serial = 0;
  for (const groupLabel of groupOrder) {
    aoa.push([groupLabel, ...new Array(header.length - 1).fill('')]);
    const groupRows = groups.get(groupLabel)!;
    let gIntake = 0, gFilled = 0;
    const gDaily: Record<string, number> = {};

    for (const r of groupRows) {
      serial += 1;
      gIntake += r.intake;
      gFilled += r.filled;
      for (const [d, c] of Object.entries(r.daily_counts)) gDaily[d] = (gDaily[d] ?? 0) + c;

      const row: (string | number)[] = [
        serial,
        r.course_short,
        r.intake,
        r.filled,
        r.balance,
        `${r.fill_percentage}%`,
        ...dates.map((d) => r.daily_counts[d] ?? ''),
      ];
      aoa.push(row);
    }

    aoa.push([
      '',
      'TOTAL',
      gIntake,
      gFilled,
      Math.max(gIntake - gFilled, 0),
      gIntake > 0 ? `${Math.round((gFilled / gIntake) * 10000) / 100}%` : '0%',
      ...dates.map((d) => gDaily[d] ?? ''),
    ]);
  }

  // Grand total
  const grandIntake = rows.reduce((s, r) => s + r.intake, 0);
  const grandFilled = rows.reduce((s, r) => s + r.filled, 0);
  const grandDaily: Record<string, number> = {};
  for (const r of rows) for (const [d, c] of Object.entries(r.daily_counts)) grandDaily[d] = (grandDaily[d] ?? 0) + c;
  aoa.push([
    '',
    'GRAND TOTAL',
    grandIntake,
    grandFilled,
    Math.max(grandIntake - grandFilled, 0),
    grandIntake > 0 ? `${Math.round((grandFilled / grandIntake) * 10000) / 100}%` : '0%',
    ...dates.map((d) => grandDaily[d] ?? ''),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Pivot');
  const yearLabel = programStartYear ? `${programStartYear}-${(programStartYear + 1).toString().slice(2)}` : 'unknown';
  XLSX.writeFile(wb, `admission-daily-pivot-${yearLabel}.xlsx`);
}

export function SeatAnalyticsDashboard({ institutionIds, programStartYear }: SeatAnalyticsDashboardProps) {
  const { data: rows = [], isLoading, isError } = useSeatAnalytics(undefined);
  const {
    data: pivotRows = [],
    isLoading: pivotLoading,
    isError: pivotError,
  } = useSeatDailyPivot(institutionIds, programStartYear);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {isError ? 'Failed to load seat analytics.' : 'No admission year data found. Configure admission years and seat intake first.'}
          </p>
          <Link href="/admission/settings/seat-config">
            <Button size="sm" variant="outline">
              <Settings className="h-4 w-4 mr-1" />
              Configure Seats
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const totalSeats = rows.reduce((s, r) => s + r.total_seats, 0);
  const totalFilled = rows.reduce((s, r) => s + Number(r.filled_seats), 0);
  const totalBalance = rows.reduce((s, r) => s + r.balance_seats, 0);
  const overallPct = totalSeats > 0 ? Math.round((totalFilled / totalSeats) * 100) : 0;
  const chartData = aggregateByInstitution(rows);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/admission/settings/seat-config">
          <Button size="sm" variant="outline">
            <Settings className="h-4 w-4 mr-1" />
            Configure Seats
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
          <TabsTrigger value="daily-pivot" className="text-xs">Daily Pivot</TabsTrigger>
        </TabsList>

        {/* Summary — existing dashboard */}
        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Seats', value: totalSeats.toLocaleString() },
              { label: 'Filled', value: totalFilled.toLocaleString() },
              { label: 'Balance', value: totalBalance.toLocaleString() },
              { label: 'Fill Rate', value: `${overallPct}%` },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="pt-4 pb-3 px-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Group Fill Progress</span>
                <span className="text-muted-foreground">{totalFilled} / {totalSeats}</span>
              </div>
              <Progress value={Math.min(overallPct, 100)} className="h-3" />
            </CardContent>
          </Card>

          {chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Seat Fill by Institution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [v, name === 'filled' ? 'Filled' : 'Balance']} />
                    <Bar dataKey="filled" stackId="a" name="filled" radius={[0, 0, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={fillColor(entry.pct)} />
                      ))}
                    </Bar>
                    <Bar dataKey="balance" stackId="a" name="balance" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Admission Year — Seat Details</CardTitle>
            </CardHeader>
            <CardContent>
              <SeatDetailsTable rows={rows} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Daily Pivot — new tab */}
        <TabsContent value="daily-pivot" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Daily admissions per program for {programStartYear ?? '—'}–
              {programStartYear ? (programStartYear + 1).toString().slice(2) : '—'}.
              SH (first-year shared) sections are merged into their base programs.
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pivotRows.length === 0}
              onClick={() => exportPivotToXlsx(pivotRows, programStartYear)}
            >
              <Download className="h-4 w-4 mr-1" />
              Export XLSX
            </Button>
          </div>

          {pivotLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pivotError ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Failed to load daily pivot.
              </CardContent>
            </Card>
          ) : (
            <SeatPivotGrid rows={pivotRows} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
