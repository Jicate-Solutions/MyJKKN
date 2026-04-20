// hooks/accreditation/use-dci-dashboard.ts
// ============================================================================
// PR-A12 — React Query hooks for the DCI (Dental Council of India) dashboard.
//
// DCI scope is single-institution: JKKN Dental College only. The dental
// institution is resolved from `institutions` by `iqac_code='DENT'` with an
// ILIKE name fallback. All metric + evidence queries are scoped to DCI via
// `metric_type='DCI'` / `body_code='DCI'` respectively. Evidence is further
// scoped by the resolved dental institution_id.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
export interface DCIMetric {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
}

export interface DentalInstitution {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string | null;
}

// ----------------------------------------------------------------------------
// Query keys
// ----------------------------------------------------------------------------
export const dciKeys = {
  all: ['accreditation', 'dci'] as const,
  institution: () => [...dciKeys.all, 'institution'] as const,
  metrics: () => [...dciKeys.all, 'metrics'] as const,
  evidenceCounts: (institutionId: string | null) =>
    [...dciKeys.all, 'evidence-counts', institutionId ?? 'none'] as const,
};

// ----------------------------------------------------------------------------
// Hooks
// ----------------------------------------------------------------------------

/**
 * Resolve the JKKN Dental College institution row.
 * Primary match: iqac_code='DENT'. Fallback: name ILIKE '%dental%'.
 */
export function useDentalInstitution() {
  return useQuery({
    queryKey: dciKeys.institution(),
    queryFn: async (): Promise<DentalInstitution | null> => {
      const sb = createClientSupabaseClient() as any;

      // Primary: iqac_code='DENT'
      const { data: byCode, error: codeError } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .eq('iqac_code', 'DENT')
        .limit(1)
        .maybeSingle();
      if (codeError) throw codeError;
      if (byCode) return byCode as DentalInstitution;

      // Fallback: name ILIKE '%dental%'
      const { data: byName, error: nameError } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .ilike('name', '%dental%')
        .limit(1)
        .maybeSingle();
      if (nameError) throw nameError;
      return (byName as DentalInstitution) ?? null;
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * All DCI metrics seeded in `sh_accreditation_metrics`. These drive the
 * drill-down lists under each DCI category card.
 */
export function useDCIMetrics() {
  return useQuery({
    queryKey: dciKeys.metrics(),
    queryFn: async (): Promise<DCIMetric[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score')
        .eq('metric_type', 'DCI')
        .eq('is_active', true)
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as DCIMetric[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Count of evidence rows per metric_code for DCI, scoped to the dental
 * college institution. Returns a { metric_code: count } map.
 */
export function useDCIEvidenceCounts(institutionId: string | null) {
  return useQuery({
    queryKey: dciKeys.evidenceCounts(institutionId),
    queryFn: async (): Promise<Record<string, number>> => {
      if (!institutionId) return {};
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('quality_evidence_mappings')
        .select('metric_code')
        .eq('body_code', 'DCI')
        .eq('institution_id', institutionId);
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>(
        (acc: Record<string, number>, row: any) => {
          acc[row.metric_code] = (acc[row.metric_code] ?? 0) + 1;
          return acc;
        },
        {},
      );
    },
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
