// hooks/accreditation/use-nirf-dashboard.ts
// ============================================================================
// React Query hooks for /accreditation/nirf dashboard (PR-A9 — Unification 9/15).
//
// NIRF (National Institutional Ranking Framework) is the MoE annual ranking.
// At JKKN it applies cluster-wide (all 8 colleges) — college switcher needed.
// The 5 canonical NIRF parameters: TLR, RPC, GO, OI, PR.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export const nirfKeys = {
  all: ['accreditation', 'nirf'] as const,
  metrics: () => [...nirfKeys.all, 'metrics'] as const,
  evidenceCounts: (institutionId: string | 'cluster') =>
    [...nirfKeys.all, 'evidence-counts', institutionId] as const,
};

export interface NIRFMetric {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
  calculation_method: string | null;
  notes: string | null;
}

export function useNIRFMetrics() {
  return useQuery({
    queryKey: nirfKeys.metrics(),
    queryFn: async (): Promise<NIRFMetric[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score, calculation_method, notes')
        .eq('metric_type', 'NIRF')
        .eq('is_active', true)
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as NIRFMetric[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useNIRFEvidenceCounts(institutionId: string | 'cluster') {
  return useQuery({
    queryKey: nirfKeys.evidenceCounts(institutionId),
    queryFn: async (): Promise<Record<string, number>> => {
      const sb = createClientSupabaseClient() as any;
      let query = sb
        .from('quality_evidence_mappings')
        .select('metric_code')
        .eq('body_code', 'NIRF');
      if (institutionId !== 'cluster') {
        query = query.eq('institution_id', institutionId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((acc, row: any) => {
        acc[row.metric_code] = (acc[row.metric_code] ?? 0) + 1;
        return acc;
      }, {});
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface JKKNInstitution {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string | null;
}

export function useJKKNInstitutionsNIRF() {
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
  });
}
