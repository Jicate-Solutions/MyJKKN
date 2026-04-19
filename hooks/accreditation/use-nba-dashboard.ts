// hooks/accreditation/use-nba-dashboard.ts
// ============================================================================
// React Query hooks for /accreditation/nba dashboard (PR-A10 — Unification 10/15).
//
// NBA (National Board of Accreditation) is per-PROGRAM (not per-college),
// Tier-I/II cycle. At JKKN, NBA applies to engineering programs under
// JKKN College of Engineering. Tier-II rubric totals 1000 pts across 10 criteria.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export const nbaKeys = {
  all: ['accreditation', 'nba'] as const,
  metrics: () => [...nbaKeys.all, 'metrics'] as const,
  evidenceCounts: () => [...nbaKeys.all, 'evidence-counts'] as const,
  engineeringPrograms: () => [...nbaKeys.all, 'engineering-programs'] as const,
};

export interface NBAMetric {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
  calculation_method: string | null;
}

export interface EngineeringProgram {
  id: string;
  program_name: string | null;
  program_code: string | null;
  institution_id: string;
  institution_name: string | null;
}

export function useNBAMetrics() {
  return useQuery({
    queryKey: nbaKeys.metrics(),
    queryFn: async (): Promise<NBAMetric[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score, calculation_method')
        .eq('metric_type', 'NBA')
        .eq('is_active', true)
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as NBAMetric[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useNBAEvidenceCounts() {
  return useQuery({
    queryKey: nbaKeys.evidenceCounts(),
    queryFn: async (): Promise<Record<string, number>> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('quality_evidence_mappings')
        .select('metric_code')
        .eq('body_code', 'NBA');
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((acc, row: any) => {
        acc[row.metric_code] = (acc[row.metric_code] ?? 0) + 1;
        return acc;
      }, {});
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Engineering programs at JKKN — query `programs` joined to engineering
 * institutions (name ILIKE '%engineering%' or iqac_code='ENGG').
 */
export function useEngineeringPrograms() {
  return useQuery({
    queryKey: nbaKeys.engineeringPrograms(),
    queryFn: async (): Promise<EngineeringProgram[]> => {
      const sb = createClientSupabaseClient() as any;
      // 1. Find engineering institutions
      const { data: insts, error: iErr } = await sb
        .from('institutions')
        .select('id, name')
        .or('iqac_code.eq.ENGG,name.ilike.%engineering%');
      if (iErr) throw iErr;
      const engIds = (insts ?? []).map((i: any) => i.id);
      if (engIds.length === 0) return [];

      const { data: progs, error: pErr } = await sb
        .from('programs')
        .select('id, program_name, program_code, institution_id')
        .in('institution_id', engIds);
      if (pErr) throw pErr;

      const instMap: Record<string, string> = (insts ?? []).reduce(
        (acc: Record<string, string>, i: any) => {
          acc[i.id] = i.name;
          return acc;
        },
        {},
      );

      return (progs ?? []).map((p: any) => ({
        id: p.id,
        program_name: p.program_name ?? null,
        program_code: p.program_code ?? null,
        institution_id: p.institution_id,
        institution_name: instMap[p.institution_id] ?? null,
      }));
    },
    staleTime: 30 * 60 * 1000,
  });
}
