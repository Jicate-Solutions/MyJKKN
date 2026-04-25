'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useGeographyAnalytics } from '@/hooks/admission/use-group-dashboard';
import type { GeographyAnalyticsRow } from '@/types/admission-workflow-config';

interface GeographyAnalyticsTabProps {
  institutionId?: string;
}

function buildDistrictSummary(rows: GeographyAnalyticsRow[]) {
  const map = new Map<string, { district: string; state: string | null; count: number }>();
  for (const r of rows) {
    if (!r.district) continue;
    const key = `${r.state ?? ''}__${r.district}`;
    const cur = map.get(key) ?? { district: r.district, state: r.state, count: 0 };
    cur.count += Number(r.active_learners);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function buildTalukSummary(rows: GeographyAnalyticsRow[], district: string) {
  const filtered = rows.filter((r) => r.district === district && r.taluk);
  const map = new Map<string, number>();
  for (const r of filtered) {
    map.set(r.taluk!, (map.get(r.taluk!) ?? 0) + Number(r.active_learners));
  }
  return [...map.entries()]
    .map(([taluk, count]) => ({ taluk, count }))
    .sort((a, b) => b.count - a.count);
}

// Institution breakdown per district
function buildInstitutionByDistrict(rows: GeographyAnalyticsRow[]) {
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.district) continue;
    const distMap = map.get(r.district) ?? new Map<string, number>();
    distMap.set(r.institution_name, (distMap.get(r.institution_name) ?? 0) + Number(r.active_learners));
    map.set(r.district, distMap);
  }
  return map;
}

export function GeographyAnalyticsTab({ institutionId }: GeographyAnalyticsTabProps) {
  const { data: rows = [], isLoading, isError } = useGeographyAnalytics(institutionId);

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
          {isError
            ? 'Failed to load geography data.'
            : 'No address data available. Ensure learner profiles have permanent_address_district filled.'}
        </CardContent>
      </Card>
    );
  }

  const districts = buildDistrictSummary(rows);
  const top10Districts = districts.slice(0, 10);
  const totalActive = districts.reduce((s, d) => s + d.count, 0);
  const instByDistrict = buildInstitutionByDistrict(rows);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Active Learners', value: totalActive.toLocaleString() },
          { label: 'Districts', value: districts.length.toString() },
          {
            label: 'Top District',
            value: districts[0]?.district ?? '—',
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-base font-bold truncate">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top-10 districts bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            Top Districts by Active Learners
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={top10Districts} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="district" width={90} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v, 'Learners']} />
              <Bar dataKey="count" name="Learners" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* District × Taluk detail table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">District & Taluk Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Top Taluks</TableHead>
                  <TableHead className="text-right">Learners</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {districts.map((d, i) => {
                  const taluks = buildTalukSummary(rows, d.district).slice(0, 3);
                  const pct = totalActive > 0 ? ((d.count / totalActive) * 100).toFixed(1) : '0';
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{d.state ?? '—'}</TableCell>
                      <TableCell className="text-xs font-medium">{d.district}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {taluks.length > 0
                          ? taluks.map((t) => `${t.taluk} (${t.count})`).join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">{d.count}</TableCell>
                      <TableCell className="text-right text-xs">{pct}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Institution × District breakdown (if multi-institution) */}
      {instByDistrict.size > 0 && !institutionId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">District Overlap Across Institutions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[280px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>District</TableHead>
                    {[...new Set(rows.map((r) => r.institution_name))].map((n) => (
                      <TableHead key={n} className="text-right text-xs">{n}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top10Districts.map((d, i) => {
                    const instMap = instByDistrict.get(d.district);
                    const instNames = [...new Set(rows.map((r) => r.institution_name))];
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{d.district}</TableCell>
                        {instNames.map((n) => (
                          <TableCell key={n} className="text-right text-xs">
                            {instMap?.get(n) ?? '—'}
                          </TableCell>
                        ))}
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
