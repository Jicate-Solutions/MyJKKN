'use client';

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useSourceAnalytics } from '@/hooks/admission/use-group-dashboard';
import type { SourceAnalyticsRow } from '@/types/admission-workflow-config';

interface SourceAnalyticsTabProps {
  /** Institution scope passed from the page; undefined => RLS-resolved super-admin all-access. */
  institutionIds?: string[];
  /** Selected admission year (cohort). When null the query is disabled until resolved. */
  programStartYear: number | null;
}

const SOURCE_COLORS: Record<string, string> = {
  referral: '#8b5cf6',
  agent: '#f59e0b',
  walk_in: '#22c55e',
  website: '#3b82f6',
  social_media: '#ec4899',
  newspaper: '#14b8a6',
  education_fair: '#f97316',
  google_ads: '#ef4444',
  facebook_ads: '#6366f1',
  admission_form: '#84cc16',
  publisher: '#0ea5e9',
  other: '#9ca3af',
  unknown: '#d1d5db',
};

const REFERRAL_LABELS: Record<string, string> = {
  consultant: 'Consultant',
  student: 'Student Referral',
  faculty: 'Faculty Referral',
};

function sourceLabel(source: string | null): string {
  if (!source) return 'Direct';
  return source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Aggregate enrolled counts by source across all institutions
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

// Aggregate by referral_type (consultant/student/faculty) for enrolled
function aggregateByReferralType(rows: SourceAnalyticsRow[]) {
  const map = new Map<string, { leads: number; enrolled: number }>();
  for (const r of rows) {
    if (!r.referral_type) continue;
    const cur = map.get(r.referral_type) ?? { leads: 0, enrolled: 0 };
    cur.leads += Number(r.lead_count);
    cur.enrolled += Number(r.enrolled_count);
    map.set(r.referral_type, cur);
  }
  return [...map.entries()].map(([type, v]) => ({
    name: REFERRAL_LABELS[type] ?? type,
    leads: v.leads,
    enrolled: v.enrolled,
    rate: v.leads > 0 ? Math.round((v.enrolled / v.leads) * 100) : 0,
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

export function SourceAnalyticsTab({ institutionIds, programStartYear }: SourceAnalyticsTabProps) {
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

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No lead source data for the selected admission year.
        </CardContent>
      </Card>
    );
  }

  const pieData = aggregateBySource(rows);
  const referralData = aggregateByReferralType(rows);
  const { institutions, sources } = buildMatrix(rows);

  const totalLeads = rows.reduce((s, r) => s + Number(r.lead_count), 0);
  const totalEnrolled = rows.reduce((s, r) => s + Number(r.enrolled_count), 0);
  const overallConversion = totalLeads > 0 ? Math.round((totalEnrolled / totalLeads) * 100 * 10) / 10 : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Leads', value: totalLeads.toLocaleString() },
          { label: 'Enrolled', value: totalEnrolled.toLocaleString() },
          { label: 'Conversion', value: `${overallConversion}%` },
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
        {/* Pie chart: enrolled by source */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Enrollments by Source</CardTitle>
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
                <Tooltip formatter={(v) => [v, 'Enrolled']} />
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
                  <Bar dataKey="leads" name="Leads" fill="#e5e7eb" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="enrolled" name="Enrolled" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
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
            <CardTitle className="text-sm font-medium">Enrollment Matrix: Institution × Source</CardTitle>
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
    </div>
  );
}
