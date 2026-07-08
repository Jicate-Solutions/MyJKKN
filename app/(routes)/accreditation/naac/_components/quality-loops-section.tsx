// app/(routes)/accreditation/naac/_components/quality-loops-section.tsx
// ============================================================================
// "Quality Loops — Metric 7.3 Quality Assurance System" section on the NAAC
// IQAC dashboard (Loop → accreditation bridge, PR-2 of 2).
//
// Renders the rows PR-1's loop evidence rollup writes into
// quality_evidence_mappings (body_code='NAAC', metric_code 7.3.d/7.3.e/7.3.f
// per the NAAC Reforms 2024 Binary Accreditation Framework, is_auto=true)
// grouped by metadata->>'loop_key': one tile per loop with cycles measured,
// last measured, and a delta breakdown. The pre-existing 7.3.1 row (meeting
// frequency) is excluded. Read path uses the same RLS-governed browser client
// the rest of the page uses.
//
// Until PR-1's migration + first cron run, all queries legitimately return
// zero rows — the section shows a designed empty state, not an error.
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, RefreshCw, Repeat2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { LoopEvidenceService } from '@/lib/services/accreditation/loop-evidence-service';
import type { LoopEvidenceRow, LoopMetricCode } from '@/lib/types/accreditation';
import { LOOP_METRIC_LABELS } from '@/lib/types/accreditation';

// ----------------------------------------------------------------------------
// Data hook — all periods for the selected scope; period filter applied
// client-side so the period selector can list the periods that actually exist.
// ----------------------------------------------------------------------------
function useQualityLoopEvidence(institutionId: string | 'cluster') {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'loop-evidence', institutionId],
    queryFn: async (): Promise<LoopEvidenceRow[]> => {
      const sb = createClientSupabaseClient() as any;
      return LoopEvidenceService.getLoopEvidenceRows(sb, {
        institutionId: institutionId === 'cluster' ? null : institutionId,
      });
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

function metricChipClass(code: string): string {
  switch (code) {
    case '7.3.d':
      return 'border-slate-300 text-slate-700 dark:text-slate-300';
    case '7.3.e':
      return 'border-amber-300 text-amber-700 dark:text-amber-300';
    case '7.3.f':
      return 'border-cyan-300 text-cyan-700 dark:text-cyan-300';
    default:
      return '';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ----------------------------------------------------------------------------
// Section component
// ----------------------------------------------------------------------------
export function QualityLoopsSection({
  selectedInstitution,
}: {
  selectedInstitution: string | 'cluster';
}) {
  const { data: rows, isLoading, isError } = useQualityLoopEvidence(selectedInstitution);
  const { canAccess, isSuperAdmin } = usePermissions();

  const currentAY = useMemo(() => LoopEvidenceService.currentAcademicYearLabel(), []);

  // Distinct AY labels present in the data, newest label first, always
  // including the current AY so the export is reachable pre-rollup.
  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows ?? []) {
      if (row.period_label) set.add(row.period_label);
    }
    set.add(currentAY);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows, currentAY]);

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  // Default: newest period that has data, else current AY.
  const effectivePeriod = selectedPeriod ?? periods[0] ?? currentAY;

  const periodRows = useMemo(
    () => (rows ?? []).filter((r) => (r.period_label ?? currentAY) === effectivePeriod),
    [rows, effectivePeriod, currentAY],
  );
  const loops = useMemo(() => LoopEvidenceService.groupByLoop(periodRows), [periodRows]);

  const canExport = isSuperAdmin || canAccess('accreditation', 'naac.dcf_export');
  const exportHref = `/api/accreditation/naac/qas-73-draft?period=${encodeURIComponent(effectivePeriod)}${
    selectedInstitution !== 'cluster'
      ? `&institutionId=${encodeURIComponent(selectedInstitution)}`
      : ''
  }`;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Repeat2 className="h-5 w-5 text-cyan-600" />
              Quality Loops — Metric 7.3 Quality Assurance System
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Self-improving platform loops auto-tagged to NAAC Metric 7.3
              (Attribute 7 · Binary Accreditation Framework 2024) — one
              evidence row per measured cycle, with outcomes compared to the
              previous cycle&apos;s baseline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={effectivePeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[150px] bg-card">
                <SelectValue placeholder="Academic year" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canExport && (
              <Button asChild variant="outline" size="sm">
                <a href={exportHref} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download 7.3 evidence draft
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load loop evidence. Try refreshing the page.
          </div>
        ) : loops.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
            <RefreshCw className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              Loop evidence rollup not yet activated — awaiting first cron run.
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Once the rollup runs, every measured cycle of the platform&apos;s
              quality loops (SCF teaching feedback, mess menu, induction) appears
              here as Metric 7.3 evidence for {effectivePeriod}.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {loops.map((loop) => (
              <div key={loop.loop_key} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{loop.loop_name}</div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] ${metricChipClass(loop.metric_code)}`}
                  >
                    {loop.metric_code}
                    {LOOP_METRIC_LABELS[loop.metric_code as LoopMetricCode]
                      ? ` · ${LOOP_METRIC_LABELS[loop.metric_code as LoopMetricCode]}`
                      : ''}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Cycles measured</div>
                    <div className="text-lg font-semibold">{loop.cycles}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last measured</div>
                    <div className="text-sm font-medium">
                      {formatDate(loop.last_measured_at)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px] text-emerald-700 dark:text-emerald-300">
                    ▲ {loop.deltas.improved} improved
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    ▬ {loop.deltas.no_change} no change
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] text-rose-700 dark:text-rose-300">
                    ▼ {loop.deltas.worse} worse
                  </Badge>
                  {loop.deltas.na > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {loop.deltas.na} n/a
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
