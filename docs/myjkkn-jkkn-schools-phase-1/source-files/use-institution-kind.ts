'use client';

/**
 * useInstitutionKind — detects whether the current institution is a
 * college (higher ed) or a school (K-12), and returns a label map.
 *
 * This is the primary hook for conditional UI rendering in MyJKKN.
 *
 * Usage:
 *   const { kind, labels, isSchool, isCollege } = useInstitutionKind();
 *   <Label>{labels.program}</Label>  // "Program" or "Class"
 *   {isCollege && <DegreeSelector />}
 *
 * See docs/SPEC-jkkn-schools.md for the architectural rationale.
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  INSTITUTION_KIND_LABELS,
  HIDDEN_SIDEBAR_HREFS,
  type InstitutionKind,
  type InstitutionKindLabels,
} from '@/lib/constants/institution-kind-labels';

interface UseInstitutionKindResult {
  kind: InstitutionKind;
  labels: InstitutionKindLabels;
  hiddenHrefs: readonly string[];
  isSchool: boolean;
  isCollege: boolean;
  isLoading: boolean;
}

export function useInstitutionKind(): UseInstitutionKindResult {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  const { data, isLoading } = useQuery({
    queryKey: ['institution-kind', institutionId],
    queryFn: async () => {
      if (!institutionId) return null;
      const supabase = createClientSupabaseClient();
      // NOTE: institution_kind column is added in migration 20260411_add_institution_kind.sql
      // Regenerate Supabase types after applying the migration for proper typing.
      const { data, error } = await supabase
        .from('institutions')
        .select('institution_kind')
        .eq('id', institutionId)
        .single();
      if (error) {
        console.error('[useInstitutionKind] Failed to fetch institution kind', error);
        return null;
      }
      return data as { institution_kind?: string } | null;
    },
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000, // 5 min — institution kind rarely changes
  });

  // Super admins default to college view unless they're actively viewing a school.
  // (Phase 2 will add a view switcher for super admins.)
  const rawKind = (data?.institution_kind as InstitutionKind | undefined) ?? 'college';
  const kind: InstitutionKind = rawKind === 'school' ? 'school' : 'college';

  return {
    kind,
    labels: INSTITUTION_KIND_LABELS[kind],
    hiddenHrefs: HIDDEN_SIDEBAR_HREFS[kind],
    isSchool: kind === 'school',
    isCollege: kind === 'college',
    isLoading,
  };
}
