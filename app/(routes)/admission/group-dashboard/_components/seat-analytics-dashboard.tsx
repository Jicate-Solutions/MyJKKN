'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Settings } from 'lucide-react';
import Link from 'next/link';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useSeatAnalytics } from '@/hooks/admission/use-group-dashboard';
import type { SeatAnalyticsRow } from '@/types/admission-workflow-config';

interface SeatAnalyticsDashboardProps {
  institutionId?: string;
}

function fillColor(pct: number) {
  if (pct >= 90) return '#22c55e';
  if (pct >= 70) return '#f59e0b';
  if (pct >= 50) return '#3b82f6';
  return '#ef4444';
}

function FillBadge({ pct }: { pct: number }) {
  if (pct >= 90) return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{pct}%</Badge>;
  if (pct >= 70) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{pct}%</Badge>;
  if (pct >= 50) return <Badge variant="outline">{pct}%</Badge>;
  return <Badge variant="destructive">{pct}%</Badge>;
}

// Aggregate to institution-level for the bar chart
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

export function SeatAnalyticsDashboard({ institutionId }: SeatAnalyticsDashboardProps) {
  const { data: rows = [], isLoading, isError } = useSeatAnalytics(institutionId);

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

      {/* Summary cards */}
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

      {/* Overall progress */}
      <Card>
        <CardContent className="pt-4 pb-3 px-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Group Fill Progress</span>
            <span className="text-muted-foreground">{totalFilled} / {totalSeats}</span>
          </div>
          <Progress value={Math.min(overallPct, 100)} className="h-3" />
        </CardContent>
      </Card>

      {/* Bar chart — institution fill */}
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
                <Tooltip
                  formatter={(v, name) => [v, name === 'filled' ? 'Filled' : 'Balance']}
                />
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

      {/* Hierarchy table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Admission Year — Seat Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institution</TableHead>
                  <TableHead>Degree</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Admission Year</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="text-right">Filled</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Fill %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-medium max-w-[120px] truncate">{r.institution_name}</TableCell>
                    <TableCell className="text-xs">{r.degree_name}</TableCell>
                    <TableCell className="text-xs">{r.department_name}</TableCell>
                    <TableCell className="text-xs font-medium">{r.program_name}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.admission_year_name}</TableCell>
                    <TableCell className="text-right text-xs">{r.total_seats}</TableCell>
                    <TableCell className="text-right text-xs">{Number(r.filled_seats)}</TableCell>
                    <TableCell className="text-right text-xs">{r.balance_seats}</TableCell>
                    <TableCell className="text-right">
                      <FillBadge pct={Number(r.fill_percentage)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
