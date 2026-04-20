// hooks/accreditation/use-pci-dashboard.ts
// ============================================================================
// PR-A13 — PCI (Pharmacy Council of India) dashboard hooks
//
// JKKN has ONE PCI-regulated institution: JKKN College of Pharmacy.
// PCI applies to programs D.Pharm, B.Pharm, Pharm.D, M.Pharm.
//
// All hooks read PR-A2 substrate tables (sh_accreditation_metrics +
// quality_evidence_mappings). No writes. Auto-detects the pharmacy
// institution by iqac_code='PHAR' OR name ILIKE '%pharmacy%'.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface PCIMetric {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
  calculation_method: string | null;
  notes: string | null;
}

export interface PCIInstitution {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string | null;
}

export const pciKeys = {
  all: ['accreditation', 'pci'] as const,
  institution: () => [...pciKeys.all, 'institution'] as const,
  metrics: () => [...pciKeys.all, 'metrics'] as const,
  evidenceCounts: (institutionId: string | null) =>
    [...pciKeys.all, 'evidence-counts', institutionId ?? 'none'] as const,
};

/**
 * Auto-detect the pharmacy institution. Tries iqac_code='PHAR' first, falls
 * back to name ILIKE '%pharmacy%'. Returns null if not found — caller should
 * render an explanatory empty state.
 */
export function usePharmacyInstitution() {
  return useQuery({
    queryKey: pciKeys.institution(),
    queryFn: async (): Promise<PCIInstitution | null> => {
      const sb = createClientSupabaseClient() as any;

      // Try by iqac_code first
      const { data: byCode, error: codeErr } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .eq('iqac_code', 'PHAR')
        .maybeSingle();
      if (codeErr) throw codeErr;
      if (byCode) return byCode as PCIInstitution;

      // Fallback: name match
      const { data: byName, error: nameErr } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .ilike('name', '%pharmacy%')
        .limit(1);
      if (nameErr) throw nameErr;
      return ((byName ?? [])[0] as PCIInstitution | undefined) ?? null;
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * PCI metrics from the substrate. Filter metric_type='PCI', active only.
 */
export function usePCIMetrics() {
  return useQuery({
    queryKey: pciKeys.metrics(),
    queryFn: async (): Promise<PCIMetric[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score, calculation_method, notes')
        .eq('metric_type', 'PCI')
        .eq('is_active', true)
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as PCIMetric[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Per-metric evidence counts, scoped to the pharmacy institution_id.
 * Returns empty object when institutionId is null (e.g. pharmacy college not
 * found in the DB yet).
 */
export function usePCIEvidenceCounts(institutionId: string | null) {
  return useQuery({
    queryKey: pciKeys.evidenceCounts(institutionId),
    queryFn: async (): Promise<Record<string, number>> => {
      if (!institutionId) return {};
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('quality_evidence_mappings')
        .select('metric_code')
        .eq('body_code', 'PCI')
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
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: institutionId !== null,
  });
}
