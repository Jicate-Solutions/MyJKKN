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

      // Step 2: resolve role_keys via SECURITY DEFINER RPC. The previous
      // client-side join through user_roles → custom_roles was blocked by
      // RLS for admin users picking from other counselors' rows, which
      // produced an empty role-badge map and dropped every row. The RPC
      // bypasses RLS for this read-only lookup; if it fails we fall back to
      // showing counselors WITHOUT a role badge rather than dropping them.
      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((u): u is string => !!u))
      );

      const roleMap = new Map<string, { key: CounselorRoleKey; name: string }>();
      if (userIds.length > 0) {
        const { data: roleRows, error: roleErr } = await (supabase as any).rpc(
          'get_counselor_role_keys_for_users',
          { p_user_ids: userIds }
        );
        if (!roleErr && Array.isArray(roleRows)) {
          for (const row of roleRows as Array<{
            user_id: string;
            role_key: string;
            role_name: string;
          }>) {
            if (
              (COUNSELOR_ROLE_KEYS as readonly string[]).includes(row.role_key)
            ) {
              roleMap.set(row.user_id, {
                key: row.role_key as CounselorRoleKey,
                name: row.role_name,
              });
            }
          }
        }
      }

      // Don't drop counselors whose role didn't resolve — they're real rows
      // in admission_counselors and the admin needs to be able to pick them.
      // role_key=null just means we couldn't determine which badge to show.
      const enriched = rows.map((r) => {
        const meta = r.user_id ? roleMap.get(r.user_id) : null;
        return {
          ...r,
          role_key: meta?.key ?? null,
          role_name: meta?.name ?? null,
        };
      });

      const excluded = new Set(excludeCounselorIds ?? []);
      return enriched.filter((r) => !excluded.has(r.id));
    },
    staleTime: 30_000,
  });
}
