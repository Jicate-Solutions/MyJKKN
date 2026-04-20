// hooks/accreditation/use-body-dashboard.ts
// ============================================================================
// Shared React Query hooks for per-body dashboard pages (PR-A15 and onward).
//
// Each body dashboard calls:
//   - useBodyMetrics(bodyCode)          → seeded metrics from PR-A2 substrate
//   - useBodyEvidenceCounts(body, scope)→ evidence counts grouped by metric
//   - useJKKNInstitutions()             → college switcher (UGC + similar)
//
// Used by PR-A15 NCTE + AICTE + UGC dashboards. Extracted to keep each
// page body-specific-content only.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AccreditationBodyCode } from '@/lib/types/accreditation';

export interface BodyMetricRow {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
}

export interface JKKNInstitution {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string | null;
}

/**
 * Seeded metrics for a body from sh_accreditation_metrics.
 * Filters on is_active=true and orders by metric_code for stable UI.
 */
export function useBodyMetrics(bodyCode: AccreditationBodyCode) {
  return useQuery({
    queryKey: ['accreditation', 'metrics-by-body', bodyCode],
    queryFn: async (): Promise<BodyMetricRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score')
        .eq('metric_type', bodyCode)
        .eq('is_active', true)
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as BodyMetricRow[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Evidence row counts grouped by metric_code for a body.
 * `scope` can be:
 *   - 'cluster' — all institutions (no filter)
 *   - a specific institution_id string
 *   - an array of institution_ids (for fixed-scope bodies, e.g. AICTE = eng+pharm)
 */
export function useBodyEvidenceCounts(
  bodyCode: AccreditationBodyCode,
  scope: 'cluster' | string | string[],
) {
  const scopeKey = Array.isArray(scope) ? scope.slice().sort().join(',') : scope;
  return useQuery({
    queryKey: ['accreditation', 'evidence-counts', bodyCode, scopeKey],
    queryFn: async (): Promise<Record<string, number>> => {
      const sb = createClientSupabaseClient() as any;
      let query = sb
        .from('quality_evidence_mappings')
        .select('metric_code')
        .eq('body_code', bodyCode);
      if (Array.isArray(scope)) {
        if (scope.length === 0) return {};
        query = query.in('institution_id', scope);
      } else if (scope !== 'cluster') {
        query = query.eq('institution_id', scope);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((acc, row: any) => {
        acc[row.metric_code] = (acc[row.metric_code] ?? 0) + 1;
        return acc;
      }, {});
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * All JKKN institutions (8 colleges) with iqac_code. Used by UGC college
 * switcher and by fixed-scope bodies (NCTE + AICTE) to auto-detect target
 * institutions by name or iqac_code.
 */
export function useJKKNInstitutions() {
  return useQuery({
    queryKey: ['institutions', 'jkkn-iqac'],
    queryFn: async (): Promise<JKKNInstitution[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .not('iqac_code', 'is', null)
        .order('iqac_code');
      if (error) throw error;
      return (data ?? []) as JKKNInstitution[];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
