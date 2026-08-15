'use client';

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, Loader2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useSourceAnalytics } from '@/hooks/admission/use-group-dashboard';
import type { SourceAnalyticsRow } from '@/types/admission-workflow-config';
import { SOURCE_COLORS, formatSourceName } from './source-display';
import { AdmittedSourcePanel } from './admitted-source-panel';

interface SourceAnalyticsTabProps {
  /** Institution scope passed from the page; undefined => RLS-resolved super-admin all-access. */
  institutionIds?: string[];
  /** Selected admission year (cohort). When null the query is disabled until resolved. */
  programStartYear: number | null;
  /**
   * Total admitted learners for the same cohort, from the profile-anchored KPI
   * (`data.totals.total_admitted`). Passed down rather than re-queried so the
   * coverage line below cannot disagree with the KPI strip.
   *
   * This tab's own "Admitted" number is LEAD-anchored, so it is necessarily
   * ≤ this value — every admitted learner with no lead row is invisible to it.
   * Without this prop the two numbers just silently differ on screen.
   */
  totalAdmittedAllPaths?: number | null;
}

const REFERRAL_LABELS: Record<string, string> = {
  consultant: 'Consultant',
  student: 'Student Referral',
  faculty: 'Faculty Referral',
};

/**
 * Label for a LEAD's source. `null` here means "a lead that carries no source
 * value" — which is different from the drill-down's "no lead at all". See the
 * note at the top of ./source-display.
 */
function sourceLabel(source: string | null): string {
  if (!source) return 'Direct';
  return formatSourceName(source);
}

// 2026-05-20: All aggregations renamed from 'enrolled' → 'admitted' to track
// the new workflow semantics. The underlying RPC's enrolled_count column was
// narrowed to lifecycle_status IN ('admitted', 'active') in the same rollout.

// Aggregate admitted counts by source across all institutions
function aggregateBySource(rows: SourceAnalyticsRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.source ?? 'direct';
    map.set(key, (map.get(key) ?? 0) + Number(r.enrolled_count));
  }
  return [...map.entries()]
    .map(([source, value]) => ({ source, name: sourceLabel(source), value }))
    .sort((a, b) => b.value - a.value);
}

// Aggregate by referral_type (consultant/student/faculty) for admitted
function aggregateByReferralType(rows: SourceAnalyticsRow[]) {
  const map = new Map<string, { leads: number; admitted: number }>();
  for (const r of rows) {
    if (!r.referral_type) continue;
    const cur = map.get(r.referral_type) ?? { leads: 0, admitted: 0 };
    cur.leads += Number(r.lead_count);
    cur.admitted += Number(r.enrolled_count);
    map.set(r.referral_type, cur);
  }
  return [...map.entries()].map(([type, v]) => ({
    name: REFERRAL_LABELS[type] ?? type,
    leads: v.leads,
    admitted: v.admitted,
    rate: v.leads > 0 ? Math.round((v.admitted / v.leads) * 100) : 0,
  }));
}

// Per-institution source breakdown for the matrix table
function buildMatrix(rows: SourceAnalyticsRow[]) {
  const instMap = new Map<string, { name: string; bySource: Map<string, number> }>();
  const sources = new Set<string>();
  for (const r of rows) {
    const src = r.source ?? 'direct';
    sources.add(src);
    const cur = instMap.get(r.institution_id) ?? { name: r.institution_name, bySource: new Map() };
    cur.bySource.set(src, (cur.bySource.get(src) ?? 0) + Number(r.enrolled_count));
    instMap.set(r.institution_id, cur);
  }
  return {
    institutions: [...instMap.values()],
    sources: [...sources].sort(),
  };
}

export function SourceAnalyticsTab({
  institutionIds,
  programStartYear,
  totalAdmittedAllPaths,
}: SourceAnalyticsTabProps) {
  const { data: rows = [], isLoading, isError } = useSourceAnalytics(institutionIds, programStartYear);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Failed to load source analytics.
        </CardContent>
      </Card>
    );
  }

  // No LEAD rows does not mean no ADMITTED learners. For AY 2025 and earlier
  // there are zero leads but thousands of admits (1,647 in 2025), all of them
  // direct. Returning early here would hide the admitted panel for exactly the
  // cohorts where "where did they come from?" has the starkest answer — so the
  // panel renders alongside the empty-state, not instead of it.
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No lead source data for the selected admission year — no enquiry in this
            cohort came through the leads pipeline.
          </CardContent>
        </Card>
        <AdmittedSourcePanel
          institutionIds={institutionIds}
          admissionYear={programStartYear}
        />
      </div>
    );
  }

  const pieData = aggregateBySource(rows);
  const referralData = aggregateByReferralType(rows);
  const { institutions, sources } = buildMatrix(rows);

  const totalLeads = rows.reduce((s, r) => s + Number(r.lead_count), 0);
  // 2026-05-20: totalAdmitted sums enrolled_count which the RPC now defines as
  // lifecycle_status IN ('admitted','active') — i.e., the cohort that "got admitted".
  const totalAdmitted = rows.reduce((s, r) => s + Number(r.enrolled_count), 0);
  const overallConversion = totalLeads > 0 ? Math.round((totalAdmitted / totalLeads) * 100 * 10) / 10 : 0;

  // ── Attribution coverage ──────────────────────────────────────────────────
  // The numbers on this tab are LEAD-anchored: they describe what the leads
  // pipeline produced. The "Admitted" KPI is PROFILE-anchored and counts every
  // admitted learner, including direct admissions that never had a lead. The
  // two therefore differ by design — for AY 2026, 551 vs 1,515.
  //
  // That difference used to be invisible, which made the tab look wrong rather
  // than narrow. Showing it turns a "which number is right?" question into a
  // real finding: how much of admissions the leads pipeline actually touches.
  const showCoverage =
    typeof totalAdmittedAllPaths === 'number' && totalAdmittedAllPaths > totalAdmitted;
  const unattributed = showCoverage ? totalAdmittedAllPaths! - totalAdmitted : 0;
  const coveragePct = showCoverage && totalAdmittedAllPaths! > 0
    ? Math.round((totalAdmitted / totalAdmittedAllPaths!) * 100)
    : 100;

  return (
    <div className="space-y-4">
      {showCoverage && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-900/60 dark:bg-amber-950/20">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-muted-foreground">
            Source data covers{' '}
            <span className="font-medium text-foreground">
              {totalAdmitted.toLocaleString()} of {totalAdmittedAllPaths!.toLocaleString()}
            </span>{' '}
            admitted learners ({coveragePct}%).{' '}
            <span className="font-medium text-foreground">
              {unattributed.toLocaleString()}
            </span>{' '}
            were direct admissions with no lead record, so they have no source.{' '}
            <Link
              href="#admitted-by-source"
              className="font-medium text-primary hover:underline"
            >
              See all admitted by source ↓
            </Link>
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Leads', value: totalLeads.toLocaleString() },
          { label: 'Admitted',    value: totalAdmitted.toLocaleString() },
          { label: 'Conversion',  value: `${overallConversion}%` },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie chart: admitted by source */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Admitted by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={SOURCE_COLORS[entry.source] ?? '#9ca3af'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [v, 'Admitted']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bar chart: consultant/student/faculty breakdown */}
        {referralData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Referral Type Conversion</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={referralData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="leads"    name="Leads"    fill="#e5e7eb" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="admitted" name="Admitted" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-3 justify-center mt-2">
                {referralData.map((r) => (
                  <div key={r.name} className="text-center">
                    <p className="text-xs text-muted-foreground">{r.name}</p>
                    <Badge variant="outline" className="text-xs">{r.rate}% CVR</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Institution × Source matrix */}
      {institutions.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Admitted Matrix: Institution × Source</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[320px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institution</TableHead>
                    {sources.map((src) => (
                      <TableHead key={src} className="text-right text-xs">{sourceLabel(src)}</TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {institutions.map((inst, i) => {
                    const total = [...inst.bySource.values()].reduce((s, v) => s + v, 0);
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{inst.name}</TableCell>
                        {sources.map((src) => (
                          <TableCell key={src} className="text-right text-xs">
                            {inst.bySource.get(src) ?? '—'}
                          </TableCell>
                        ))}
                        <TableCell className="text-right text-xs font-semibold">{total}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Everything above is LEAD-anchored ("what did the leads pipeline
          produce?"). This panel is PROFILE-anchored ("who got admitted, and
          where from?") and so equals the Admitted KPI, direct admissions
          included. Target of the KPI card's drill-down. */}
      <AdmittedSourcePanel
        institutionIds={institutionIds}
        admissionYear={programStartYear}
      />
    </div>
  );
}
