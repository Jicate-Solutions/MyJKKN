// hooks/accreditation/use-institution-bodies.ts
// ============================================================================
// Reads `institution_accreditation_bodies` — which awarding bodies apply to
// one institution — and the `accreditation_bodies` registry that names them.
//
// Migration 20260816010000 is APPLIED to production (2026-08-06), so both
// tables exist and these reads succeed. The failure path below is still
// load-bearing and must not be removed: a failed read — RLS denial, or an
// environment where the migration has not run — resolves to the
// `unprovisioned` scope, which shows every body exactly as the page did
// before. The code half was safe to deploy before the migration, and filters
// it is, with no second deploy.
//
// Failing OPEN is the correct direction and not laziness. A scope filter that
// failed closed would hide 96 real metrics from a college that has them, and
// would do it silently — RLS denial and a missing table both come back as
// "nothing", and neither is the same fact as "no body applies".
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  scopeFromRows,
  UNPROVISIONED_SCOPE,
  type InstitutionBodyScope,
  type InstitutionBodyRow,
} from '@/app/(routes)/accreditation/_lib/institution-body-scope';

export interface AccreditationBodyRow {
  code: string;
  name: string;
  short_name: string | null;
  kind: string;
  source_url: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
}

export const institutionBodyKeys = {
  all: ['accreditation', 'institution-bodies'] as const,
  registry: () => [...institutionBodyKeys.all, 'registry'] as const,
  scope: (institutionId: string | null) =>
    [...institutionBodyKeys.all, 'scope', institutionId] as const,
  mappings: (institutionId: string | null) =>
    [...institutionBodyKeys.all, 'mappings', institutionId] as const,
};

/**
 * The awarding-body registry. Returns an EMPTY array when the table is absent
 * rather than throwing — a screen that cannot name a body should still render
 * the code, which is what every screen did before the registry existed.
 */
export function useAccreditationBodyRegistry() {
  return useQuery({
    queryKey: institutionBodyKeys.registry(),
    queryFn: async (): Promise<AccreditationBodyRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('accreditation_bodies')
        .select('code, name, short_name, kind, source_url, notes, is_active, sort_order')
        .order('sort_order');
      if (error) return [];
      return (data ?? []) as AccreditationBodyRow[];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Which bodies apply to one institution.
 *
 * `enabled` is false without an institution id, and the hook then reports
 * `unprovisioned` — "no campus chosen" is another form of "we do not know",
 * and it must not narrow anything either.
 */
export function useInstitutionBodyScope(institutionId: string | null) {
  const query = useQuery({
    queryKey: institutionBodyKeys.scope(institutionId),
    enabled: !!institutionId,
    queryFn: async (): Promise<InstitutionBodyScope> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institution_accreditation_bodies')
        .select('body_code, is_active')
        .eq('institution_id', institutionId)
        .eq('is_active', true);
      // Table absent (42P01 / PGRST205 before the migration is applied), or any
      // other refusal: we do not know, so we do not narrow.
      if (error) return UNPROVISIONED_SCOPE;
      return scopeFromRows((data ?? []) as InstitutionBodyRow[]);
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    scope: query.data ?? UNPROVISIONED_SCOPE,
    isLoading: query.isLoading,
  };
}

export interface InstitutionBodyMapping {
  id: string;
  institution_id: string;
  body_code: string;
  is_active: boolean;
  notes: string | null;
}

/**
 * Every mapping row for one institution, active or not — what the admin screen
 * edits. Distinct from {@link useInstitutionBodyScope}, which answers the
 * narrower read-only question every other screen asks.
 */
export function useInstitutionBodyMappings(institutionId: string | null) {
  return useQuery({
    queryKey: institutionBodyKeys.mappings(institutionId),
    enabled: !!institutionId,
    queryFn: async (): Promise<InstitutionBodyMapping[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institution_accreditation_bodies')
        .select('id, institution_id, body_code, is_active, notes')
        .eq('institution_id', institutionId);
      if (error) throw error;
      return (data ?? []) as InstitutionBodyMapping[];
    },
    staleTime: 15 * 1000,
  });
}
