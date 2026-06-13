'use client';

/**
 * Institution Heatmap — cross-institution command-center view.
 *
 * Two parts:
 *   1) Per-institution summary cards (N projects, M at risk, K red).
 *   2) A matrix: rows = institutions, columns = status buckets, cells colored
 *      by project count (relative intensity).
 *
 * Director's command center (F4): one glance answers "which institution is
 * carrying the most red?".
 */

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertTriangle, Building2 } from 'lucide-react';
import {
  STATUS_BUCKETS,
  STATUS_BUCKET_LABELS,
  type HeatmapCell,
  type InstitutionSummary,
} from '@/lib/services/projects/portfolio-service';
import { heatCellClass } from './portfolio-helpers';

interface InstitutionHeatmapProps {
  institutions: InstitutionSummary[];
  heatmap: HeatmapCell[];
}

export function InstitutionHeatmap({ institutions, heatmap }: InstitutionHeatmapProps) {
  if (institutions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Building2 className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">No institution data</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Projects assigned to institutions will populate the heatmap.
        </p>
      </div>
    );
  }

  // Index cells for O(1) lookup + find the max count for intensity scaling.
  const cellByKey = new Map<string, number>();
  let max = 0;
  for (const c of heatmap) {
    cellByKey.set(`${c.institutionId}::${c.bucket}`, c.count);
    if (c.count > max) max = c.count;
  }

  const totalProjects = institutions.reduce((s, i) => s + i.projectCount, 0);
  const totalAtRisk = institutions.reduce((s, i) => s + i.atRiskCount, 0);
  const totalRed = institutions.reduce((s, i) => s + i.redCount, 0);

  return (
    <div className="space-y-6">
      {/* Portfolio-wide summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Institutions" value={institutions.length} />
        <SummaryStat label="Projects" value={totalProjects} />
        <SummaryStat label="At risk" value={totalAtRisk} accent="amber" />
        <SummaryStat label="Off track" value={totalRed} accent="red" />
      </div>

      {/* Per-institution summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {institutions.map((inst) => (
          <Card key={inst.institutionId}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{inst.institutionName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {inst.projectCount} project{inst.projectCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1 text-right">
                {inst.atRiskCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {inst.atRiskCount} at risk
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    All clear
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Matrix */}
      <Card>
        <CardContent className="overflow-x-auto p-4">
          <table className="w-full border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-xs font-medium text-muted-foreground">
                  Institution
                </th>
                {STATUS_BUCKETS.map((bucket) => (
                  <th
                    key={bucket}
                    className="px-2 py-1 text-center text-xs font-medium text-muted-foreground"
                  >
                    {STATUS_BUCKET_LABELS[bucket]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst) => (
                <tr key={inst.institutionId}>
                  <td className="max-w-[12rem] truncate px-2 py-1 text-xs font-medium">
                    {inst.institutionName}
                  </td>
                  {STATUS_BUCKETS.map((bucket) => {
                    const count = cellByKey.get(`${inst.institutionId}::${bucket}`) ?? 0;
                    return (
                      <td key={bucket} className="px-1 py-1">
                        <div
                          className={cn(
                            'flex h-9 items-center justify-center rounded-md text-xs font-semibold tabular-nums',
                            heatCellClass(count, max)
                          )}
                          title={`${inst.institutionName} — ${STATUS_BUCKET_LABELS[bucket]}: ${count}`}
                        >
                          {count}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'amber' | 'red';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-1 text-2xl font-bold tabular-nums',
            accent === 'amber' && 'text-amber-600',
            accent === 'red' && 'text-red-600'
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
