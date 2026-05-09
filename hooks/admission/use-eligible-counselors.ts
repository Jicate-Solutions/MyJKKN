// hooks/admission/use-eligible-counselors.ts
//
// Lists active admission_counselors users with one of the 4 counselor role keys,
// for the per-source counselor picker.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export const COUNSELOR_ROLE_KEYS = [
  'admission_counselor',
  'expo_counselor',
  'learner_counselor',
  'staff_counselor',
] as const;

export type CounselorRoleKey = (typeof COUNSELOR_ROLE_KEYS)[number];

export interface EligibleCounselor {
  id: string;            // admission_counselors.id (junction FK target)
  user_id: string | null;
  name: string;
  email: string;
  designation: string | null;
  institution_id: string;
  is_active: boolean | null;
  current_leads: number | null;
  max_leads: number | null;
  role_key: CounselorRoleKey | null;
  role_name: string | null;
}

interface UseEligibleCounselorsOptions {
  institutionId?: string | null;
  search?: string;
  excludeCounselorIds?: string[]; // already attached, hide from picker
  enabled?: boolean;
}

export function useEligibleCounselors({
  institutionId,
  search,
  excludeCounselorIds,
  enabled = true,
}: UseEligibleCounselorsOptions = {}) {
  return useQuery({
    queryKey: [
      'admission-eligible-counselors',
      institutionId ?? 'all',
      search ?? '',
      (excludeCounselorIds ?? []).slice().sort().join(','),
    ],
    enabled,
    queryFn: async (): Promise<EligibleCounselor[]> => {
      const supabase = createClientSupabaseClient();

      // Step 1: pull active admission_counselors (optionally institution-scoped)
      let q = (supabase as any)
        .from('admission_counselors')
        .select(
          'id, user_id, name, email, designation, institution_id, is_active, current_leads, max_leads'
        )
        .eq('is_active', true);

      if (institutionId) q = q.eq('institution_id', institutionId);
      if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

      const { data: counselors, error } = await q.order('name', { ascending: true });
      if (error) throw error;

      const rows = (counselors ?? []) as EligibleCounselor[];
      if (rows.length === 0) return [];

      // Step 2: pull role_keys for these users via user_roles → custom_roles
      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((u): u is string => !!u))
      );

      const { data: userRoles } = await (supabase as any)
        .from('user_roles')
        .select(
          `
          user_id,
          role:custom_roles!role_id ( role_key, role_name )
        `
        )
        .in('user_id', userIds);

      const roleMap = new Map<string, { key: CounselorRoleKey; name: string }>();
      for (const row of (userRoles ?? []) as Array<{
        user_id: string;
        role: { role_key: string; role_name: string } | null;
      }>) {
        if (!row.role) continue;
        if (
          (COUNSELOR_ROLE_KEYS as readonly string[]).includes(row.role.role_key)
        ) {
          // Prefer counselor role over any other if multiple roles exist
          roleMap.set(row.user_id, {
            key: row.role.role_key as CounselorRoleKey,
            name: row.role.role_name,
          });
        }
      }

      const enriched = rows
        .map((r) => {
          const meta = r.user_id ? roleMap.get(r.user_id) : null;
          return {
            ...r,
            role_key: meta?.key ?? null,
            role_name: meta?.name ?? null,
          };
        })
        // Drop counselors with no eligible role (they exist in admission_counselors
        // but no longer hold any of the 4 counselor role_keys)
        .filter((r) => r.role_key !== null);

      const excluded = new Set(excludeCounselorIds ?? []);
      return enriched.filter((r) => !excluded.has(r.id));
    },
    staleTime: 30_000,
  });
}
