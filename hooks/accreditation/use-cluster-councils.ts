// hooks/accreditation/use-cluster-councils.ts
// ============================================================================
// The Cluster Academic Council page reads councils, not a body's scorecard.
//
// Why this is not `useNAACCommittees`: that hook filters `body_code = 'NAAC'`.
// A cluster council is JKKN's own body, but `accreditation_committees.body_code`
// only accepts the ten external regulators (live CHECK, verified 2026-07-27:
// NAAC | NIRF | NBA | QS | DCI | PCI | INC | AICTE | NCTE | UGC). There is no
// 'CAC' value to file it under, so wherever a council gets created it lands on
// one of those ten codes — today the committees hub creates it as NAAC. Filtering
// by body_code would therefore hide a council the moment it is filed anywhere
// else. So: filter on committee_type = 'cluster' and no body at all.
//
// Read-only. Forming a council stays on the committees hub (PR #2482), which
// already has the create dialog, the roster picker and the ≥2-member rule.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AccreditationCommittee } from '@/lib/services/accreditation/accreditation-committee-service';
import type { SpanInstitution } from '@/app/(routes)/accreditation/cac/_lib/cluster-scope';

export type ClusterCouncil = AccreditationCommittee & { member_count: number };

export const clusterCouncilKeys = {
  all: ['accreditation', 'cluster-councils'] as const,
  list: () => [...clusterCouncilKeys.all, 'list'] as const,
  institutions: () => [...clusterCouncilKeys.all, 'institutions'] as const,
  profileNames: (userIds: string[]) =>
    [...clusterCouncilKeys.all, 'profile-names', [...userIds].sort().join(',')] as const,
};

/**
 * Every active cluster council the viewer's RLS lets through, newest first,
 * each with its live member count.
 */
export function useClusterCouncils() {
  return useQuery({
    queryKey: clusterCouncilKeys.list(),
    queryFn: async (): Promise<ClusterCouncil[]> => {
      const sb = createClientSupabaseClient() as any;

      const { data: councils, error } = await sb
        .from('accreditation_committees')
        .select('*')
        .eq('committee_type', 'cluster')
        .eq('is_active', true)
        .order('formed_at', { ascending: false });
      if (error) throw error;

      const rows = (councils ?? []) as AccreditationCommittee[];
      if (rows.length === 0) return [];

      const { data: members, error: memberError } = await sb
        .from('accreditation_committee_members')
        .select('committee_id')
        .in(
          'committee_id',
          rows.map((c) => c.id),
        )
        .eq('is_active', true);
      if (memberError) throw memberError;

      const counts = (
        (members ?? []) as Array<{ committee_id: string }>
      ).reduce<Record<string, number>>((acc, m) => {
        acc[m.committee_id] = (acc[m.committee_id] ?? 0) + 1;
        return acc;
      }, {});

      return rows.map((c) => ({ ...c, member_count: counts[c.id] ?? 0 }));
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Every institution, including the ones with no iqac_code.
 *
 * A cluster council spans the colleges AND the two schools AND is filed at Main
 * Office — none of which carry an iqac_code. Filtering on that column is exactly
 * what made the council impossible to express before PR #2482.
 *
 * The key is deliberately NOT ['institutions', 'jkkn-iqac']: that key is already
 * used by `useJKKNInstitutions()` in use-body-dashboard.ts for the 8-college
 * subset, and reusing it would let whichever query mounts first serve the other's
 * page from cache.
 */
export function useAllInstitutions() {
  return useQuery({
    queryKey: clusterCouncilKeys.institutions(),
    queryFn: async (): Promise<SpanInstitution[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code')
        .order('name');
      if (error) throw error;
      return (data ?? []) as SpanInstitution[];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * user_id -> display name, for the internal members of a council.
 *
 * Falls back to the email when a profile carries no full name, and simply omits
 * anyone the viewer's RLS hides — the caller then shows that the name is not
 * available rather than an empty row.
 */
export function useProfileNames(userIds: string[]) {
  return useQuery({
    queryKey: clusterCouncilKeys.profileNames(userIds),
    queryFn: async (): Promise<Record<string, string>> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      if (error) throw error;
      return (
        (data ?? []) as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
        }>
      ).reduce<Record<string, string>>((acc, p) => {
        const label = p.full_name?.trim() || p.email;
        if (label) acc[p.id] = label;
        return acc;
      }, {});
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
