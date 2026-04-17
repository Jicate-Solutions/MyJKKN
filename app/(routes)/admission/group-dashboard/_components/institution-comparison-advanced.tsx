'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, Users, Target } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useInstitutionComparison } from '@/hooks/admission/use-group-dashboard';
import type { InstitutionComparisonRow } from '@/types/admission-workflow-config';

interface InstitutionComparisonAdvancedProps {
  academicYearId?: string;
}

function FillBadge({ pct }: { pct: number }) {
  if (pct >= 90) return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{pct}%</Badge>;
  if (pct >= 70) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{pct}%</Badge>;
  if (pct >= 50) return <Badge variant="outline">{pct}%</Badge>;
  return <Badge variant="destructive">{pct}%</Badge>;
}

function scorecard(row: InstitutionComparisonRow) {
  const score =
    Math.min(row.fill_percentage, 100) * 0.5 +
    Math.min(row.conversion_rate, 100) * 0.3 +
    (row.total_leads > 0 ? Math.min((row.enrolled_count / row.total_leads) * 100, 100) * 0.2 : 0);
  return Math.round(score);
}

export function InstitutionComparisonAdvanced({ academicYearId }: InstitutionComparisonAdvancedProps) {
  const { data: rows = [], isLoading, isError } = useInstitutionComparison(academicYearId);

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
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {isError ? 'Failed to load comparison data.' : 'No data available for comparison.'}
        </CardContent>
      </Card>
    );
  }

  // Scorecards for top performers
  const ranked = [...rows].sort((a, b) => scorecard(b) - scorecard(a));

  // Chart data: fill vs conversion side-by-side
  const chartData = rows
    .slice(0, 8)
    .map((r) => ({
      name: r.institution_name.length > 14 ? r.institution_name.slice(0, 12) + '…' : r.institution_name,
      'Fill %': r.fill_percentage,
      'Conv %': r.conversion_rate,
    }));

  return (
    <div className="space-y-4">
      {/* Top-3 scorecards */}
      {ranked.length >= 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ranked.slice(0, 3).map((r, i) => (
            <Card key={r.institution_id} className={i === 0 ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-900/10' : ''}>
              <CardHeader className="pb-1 pt-3 px-4">
                <div className="flex items-center gap-2">
                  {i === 0 && <span className="text-amber-500 text-lg">🏆</span>}
                  {i === 1 && <span className="text-slate-400 text-lg">🥈</span>}
                  {i === 2 && <span className="text-orange-400 text-lg">🥉</span>}
                  <CardTitle className="text-sm font-semibold truncate">{r.institution_name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
                    <Target className="h-3 w-3" /> Fill
                  </p>
                  <FillBadge pct={r.fill_percentage} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
                    <TrendingUp className="h-3 w-3" /> Conv
                  </p>
                  <p className="text-sm font-bold">{r.conversion_rate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
                    <Users className="h-3 w-3" /> Active
                  </p>
                  <p className="text-sm font-bold">{r.active_learners}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Grouped bar: fill % vs conversion % */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Fill % vs Conversion Rate by Institution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip formatter={(v) => [`${v}%`]} />
                <Legend />
                <Bar dataKey="Fill %" fill="#22c55e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Conv %" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Full comparison table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Full Institution Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="text-right">Filled</TableHead>
                  <TableHead className="text-right">Fill %</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">Conv %</TableHead>
                  <TableHead>Top Source</TableHead>
                  <TableHead>Top District</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map((r, i) => (
                  <TableRow key={r.institution_id}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">{r.institution_name}</TableCell>
                    <TableCell className="text-right text-xs">{r.total_seats || '—'}</TableCell>
                    <TableCell className="text-right text-xs">{r.filled_seats}</TableCell>
                    <TableCell className="text-right">
                      {r.total_seats > 0 ? <FillBadge pct={r.fill_percentage} /> : <span className="text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.total_leads || '—'}</TableCell>
                    <TableCell className="text-right text-xs">{r.enrolled_count}</TableCell>
                    <TableCell className="text-right text-xs">{r.conversion_rate || '—'}%</TableCell>
                    <TableCell className="text-xs capitalize">
                      {r.top_source?.replace(/_/g, ' ') ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">{r.top_district ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="text-xs">{scorecard(r)}</Badge>
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
