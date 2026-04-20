// hooks/accreditation/use-inc-dashboard.ts
// ============================================================================
// React Query hooks for /accreditation/inc dashboard (PR-A14 — Unification 14/15).
//
// INC (Indian Nursing Council) conducts annual inspections under INC Regulations
// 2021. At JKKN, INC applies only to JKKN College of Nursing (single-institution
// scope auto-resolved by iqac_code='NURS' OR name ILIKE '%nursing%').
//
// Reads only — writes land via fan-out triggers (faculty, clinical placement,
// curriculum modules wire up in future PRs) or manual tagging by IQAC / nursing
// coordinators.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export const incKeys = {
  all: ['accreditation', 'inc'] as const,
  institution: () => [...incKeys.all, 'institution'] as const,
  metrics: () => [...incKeys.all, 'metrics'] as const,
  evidenceCounts: (institutionId: string | null) =>
    [...incKeys.all, 'evidence-counts', institutionId ?? 'none'] as const,
};

export interface NursingInstitution {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string | null;
}

export interface INCMetric {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
  calculation_method: string | null;
  notes: string | null;
}

/**
 * Resolve JKKN College of Nursing institution (fixed scope for INC).
 * Preference order: iqac_code='NURS' → name ILIKE '%nursing%'.
 * Returns null if no nursing college is provisioned yet (display guards).
 */
export function useNursingInstitution() {
  return useQuery({
    queryKey: incKeys.institution(),
    queryFn: async (): Promise<NursingInstitution | null> => {
      const sb = createClientSupabaseClient() as any;

      // Primary: iqac_code='NURS' (deterministic)
      const byCode = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .eq('iqac_code', 'NURS')
        .limit(1)
        .maybeSingle();
      if (byCode.error) throw byCode.error;
      if (byCode.data) return byCode.data as NursingInstitution;

      // Fallback: name match (handles pre-iqac_code provisioning windows)
      const byName = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .ilike('name', '%nursing%')
        .limit(1)
        .maybeSingle();
      if (byName.error) throw byName.error;
      return (byName.data ?? null) as NursingInstitution | null;
    },
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * INC metrics from sh_accreditation_metrics (metric_type='INC', is_active=true).
 * Currently 2 seeded rows (FAC + CLN) per PR-A2; expand via future PR seeding.
 */
export function useINCMetrics() {
  return useQuery({
    queryKey: incKeys.metrics(),
    queryFn: async (): Promise<INCMetric[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score, calculation_method, notes')
        .eq('metric_type', 'INC')
        .eq('is_active', true)
        .order('category')
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as INCMetric[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Evidence row counts per metric_code for INC, scoped to nursing institution.
 * Returns {} when institutionId is null (no nursing college found) — UI guards.
 */
export function useINCEvidenceCounts(institutionId: string | null) {
  return useQuery({
    queryKey: incKeys.evidenceCounts(institutionId),
    queryFn: async (): Promise<Record<string, number>> => {
      if (!institutionId) return {};
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('quality_evidence_mappings')
        .select('metric_code')
        .eq('body_code', 'INC')
        .eq('institution_id', institutionId);
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((acc: Record<string, number>, row: any) => {
        acc[row.metric_code] = (acc[row.metric_code] ?? 0) + 1;
        return acc;
      }, {});
    },
    staleTime: 5 * 60 * 1000,
    enabled: institutionId !== null,
  });
}
