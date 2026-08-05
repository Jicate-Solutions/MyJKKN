// hooks/accreditation/use-iqac-framework.ts
// ============================================================================
// Reads for the IQAC dashboard: the 107-row master framework, the evidence
// filed against it, and the 48 → 107 mapping registry.
//
// All three go through the browser Supabase client, so every read is the
// signed-in reader's own — RLS decides what comes back, and a reader without
// `accreditation.metrics.view` sees the refusal the page states rather than a
// silently empty grid.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  IqacMetricMapService,
  type IqacMetricMapReadout,
} from '@/lib/services/accreditation/iqac-metric-map-service';
import {
  evidenceKey,
  type FrameworkMetricRow,
} from '@/app/(routes)/accreditation/iqac/_lib/metric-framework';

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Every active row of the master framework — all bodies at once, which is the
 * whole point: the per-body dashboards each read their own slice, and nothing
 * before this read the framework as one thing.
 *
 * `weightage` is selected even though it is NULL on all 107 rows in production
 * (verified 2026-08-01). The page reports that absence rather than hiding the
 * column, because "the framework carries no weights" is a fact an IQAC
 * coordinator needs and a missing column would conceal.
 */
export function useFrameworkMetrics() {
  return useQuery({
    queryKey: ['accreditation', 'iqac', 'framework'],
    queryFn: async (): Promise<FrameworkMetricRow[]> => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase
        .from('sh_accreditation_metrics')
        .select('metric_type, metric_code, metric_name, category, max_score, weightage')
        .eq('is_active', true)
        .order('metric_type')
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as FrameworkMetricRow[];
    },
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });
}

/**
 * How many evidence records are filed against each framework metric, keyed by
 * body and code together — `metric_code` alone repeats across bodies, so a
 * single-key map would credit one body's evidence to another's metric.
 */
export function useFrameworkEvidenceCounts() {
  return useQuery({
    queryKey: ['accreditation', 'iqac', 'evidence-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase
        .from('quality_evidence_mappings')
        .select('body_code, metric_code');
      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { body_code: string; metric_code: string }[]) {
        if (!row.body_code || !row.metric_code) continue;
        const key = evidenceKey(row.body_code, row.metric_code);
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });
}

/**
 * The 48 → 107 mapping registry.
 *
 * Never throws on a missing table: until the registry migration is applied the
 * readout carries `registryAvailable: false`, which the page reports as an
 * un-provisioned registry instead of an error.
 */
export function useIqacMetricMap() {
  return useQuery({
    queryKey: ['accreditation', 'iqac', 'metric-map'],
    queryFn: async (): Promise<IqacMetricMapReadout> => IqacMetricMapService.list(),
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });
}
