'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

const supabase = createClientSupabaseClient();

export interface HrOrgMapping {
  institution_id: string;
  hr_organization_id: string;
  organization_name: string;
}

/**
 * Accessible institution ↔ HR organization mapping.
 *
 * Backed by the SECURITY DEFINER RPC fn_hr_orgs_for_institutions —
 * hr_organizations RLS only exposes the caller's own org row, so this mapping
 * cannot be built from a plain table read. The RPC self-authorizes via
 * role_has_institution_access(), so callers only ever see institutions they
 * can access.
 */
export function useHrOrgMappings() {
  const query = useQuery({
    queryKey: ['hr-org-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_hr_orgs_for_institutions');
      if (error) throw error;
      return (data ?? []) as HrOrgMapping[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const orgIdByInstitution = useMemo(
    () => new Map((query.data ?? []).map((m) => [m.institution_id, m.hr_organization_id])),
    [query.data],
  );
  const institutionIdByOrg = useMemo(
    () => new Map((query.data ?? []).map((m) => [m.hr_organization_id, m.institution_id])),
    [query.data],
  );
  /**
   * Display name for an hr_organization_id.
   *
   * hr_organizations.name is maintained identical to institutions.name for
   * every mapped org, so this doubles as the institution label — HR-scoped
   * tables key on hr_organization_id and would otherwise need a second join
   * just to render a name.
   */
  const orgNameById = useMemo(
    () => new Map((query.data ?? []).map((m) => [m.hr_organization_id, m.organization_name])),
    [query.data],
  );

  return {
    mappings: query.data ?? [],
    orgIdByInstitution,
    institutionIdByOrg,
    orgNameById,
    isLoading: query.isLoading,
    error: query.error,
  };
}
