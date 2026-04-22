// app/(routes)/audit/_components/coverage-heatmap-mini.tsx
// Compact per-body framework coverage rollup for the Audit Dashboard home.
// Reuses AuditParameterCatalogService.countByFramework() until a dedicated
// /api/audit/coverage endpoint lands (Agent 1 scope). Intentionally read-only
// and resilient: shows what we can, degrades gracefully when data is absent.

'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BarChart3, ArrowRight, Inbox } from 'lucide-react';
import {
  useAttestationRollup,
  useParameterCountByFramework,
} from '@/hooks/audit';

interface CoverageHeatmapMiniProps {
  /** Optional active cycle for attestation progress per body. When null, shows parameter distribution only. */
  activeCycleId?: string | null;
}

const BODY_COLOR: Record<string, string> = {
  NAAC: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200',
  NBA: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200',
  NIRF: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200',
  UGC: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200',
  QS: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200',
  AICTE: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200',
  NCTE: 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-200',
  DCI: 'bg-pink-50 text-pink-800 border-pink-200 dark:bg-pink-950 dark:text-pink-200',
  PCI: 'bg-lime-50 text-lime-800 border-lime-200 dark:bg-lime-950 dark:text-lime-200',
  INC: 'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-200',
};

export function CoverageHeatmapMini({
  activeCycleId,
}: CoverageHeatmapMiniProps) {
  const { data: frameworkCounts, isLoading: countsLoading } =
    useParameterCountByFramework();
  const { data: rollup, isLoading: rollupLoading } = useAttestationRollup(
    activeCycleId ?? undefined,
  );

  const entries = Object.entries(frameworkCounts ?? {}).sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  const totalCatalogParams = Array.from(new Set(entries.map((e) => e[0])))
    .reduce((sum, key) => sum + (frameworkCounts?.[key] ?? 0), 0);

  const attestedTotal =
    (rollup?.compliant ?? 0) + (rollup?.partial ?? 0) + (rollup?.non_compliant ?? 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-primary" />
            Framework coverage
          </CardTitle>
          <Link href="/accreditation/coverage">
            <Button variant="ghost" size="sm">
              Full matrix
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {countsLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center text-xs text-muted-foreground">
            <Inbox className="h-6 w-6 mb-2" />
            <p>No parameters mapped to frameworks yet.</p>
            <p>Seed the audit catalog to populate body counts.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {entries.map(([body, count]) => (
              <div
                key={body}
                className={`rounded-md border p-3 ${
                  BODY_COLOR[body] ??
                  'bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-900 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{body}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {count}
                  </Badge>
                </div>
                <div className="text-[11px] mt-1 opacity-70">
                  {count === 1 ? 'parameter' : 'parameters'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cycle attestation rollup (when an active cycle is selected) */}
        {activeCycleId && (
          <div className="mt-4 rounded-md border bg-muted/40 p-3 text-xs">
            <div className="font-medium mb-2">Current cycle progress</div>
            {rollupLoading ? (
              <Skeleton className="h-4 w-full" />
            ) : (
              <div className="flex flex-wrap gap-3">
                <span>Total attestations: <strong>{rollup?.total ?? 0}</strong></span>
                <span className="text-emerald-700 dark:text-emerald-300">
                  Compliant: <strong>{rollup?.compliant ?? 0}</strong>
                </span>
                <span className="text-amber-700 dark:text-amber-300">
                  Partial: <strong>{rollup?.partial ?? 0}</strong>
                </span>
                <span className="text-rose-700 dark:text-rose-300">
                  Non-compliant: <strong>{rollup?.non_compliant ?? 0}</strong>
                </span>
                <span className="text-muted-foreground">
                  Pending: <strong>{rollup?.pending ?? 0}</strong>
                </span>
                <span className="text-muted-foreground">
                  Catalog: <strong>{totalCatalogParams}</strong> framework-mappings across{' '}
                  {entries.length} bodies; {attestedTotal} attestations signed.
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
