// hooks/admission/use-active-lead-sources.ts
//
// Canonical hook: returns the admin-curated lead sources from
// admission_lead_sources_master, filtered to is_active=true and ordered
// by display_order. Replaces every static LEAD_SOURCES / LEAD_SOURCE_OPTIONS
// array previously hardcoded across the admission UI.
//
// Two consumers:
//   1. Dropdown options:        useActiveLeadSources().options
//   2. Single-source label map: useActiveLeadSources().labelByEnum

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

export interface ActiveLeadSourceOption {
  /** master.id — needed when admins want to attribute to a specific custom row */
  masterId: string;
  /** master.enum_value — what gets written to admission_leads.source */
  value: LeadSourceEnum;
  /** master.label — what end-users see */
  label: string;
  /** master.display_order */
  order: number;
  /** master.is_system — system rows can be styled differently */
  isSystem: boolean;
  /** master.institution_id */
  institutionId: string | null;
}

interface UseActiveLeadSourcesOptions {
  institutionId?: string | null;
  /** Defaults to true. When false, includes inactive rows (admin-only views). */
  activeOnly?: boolean;
  enabled?: boolean;
}

export function useActiveLeadSources({
  institutionId,
  activeOnly = true,
  enabled = true,
}: UseActiveLeadSourcesOptions = {}) {
  const query = useQuery({
    queryKey: ['active-lead-sources', institutionId ?? 'all', activeOnly],
    enabled,
    staleTime: 5 * 60_000, // sources change rarely; cache 5 min
    queryFn: async (): Promise<ActiveLeadSourceOption[]> => {
      const supabase = createClientSupabaseClient();
      let q = (supabase as any)
        .from('admission_lead_sources_master')
        .select('id, enum_value, label, display_order, is_system, institution_id, is_active');
      if (activeOnly) q = q.eq('is_active', true);

      const { data, error } = await q.order('display_order', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        enum_value: LeadSourceEnum;
        label: string;
        display_order: number;
        is_system: boolean;
        institution_id: string | null;
      }>;

      // Institution-scoping: prefer institution-specific rows, fall back to global.
      // If institutionId given, include only global (NULL) + matching institution rows.
      const filtered = institutionId
        ? rows.filter(
            (r) => r.institution_id === null || r.institution_id === institutionId
          )
        : rows;

      return filtered.map((r) => ({
        masterId: r.id,
        value: r.enum_value,
        label: r.label,
        order: r.display_order,
        isSystem: r.is_system,
        institutionId: r.institution_id,
      }));
    },
  });

  const labelByEnum = useMemo(() => {
    const map = new Map<LeadSourceEnum, string>();
    for (const o of query.data ?? []) {
      // First (lowest display_order) win — institution-specific custom labels
      // already sort first if both exist with the same enum_value.
      if (!map.has(o.value)) map.set(o.value, o.label);
    }
    return map;
  }, [query.data]);

  return {
    options: query.data ?? [],
    labelByEnum,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * Static fallback labels for the 14 enum values. Used by non-React code
 * (e.g. server actions, tests) where the hook isn't available.
 * Whenever possible, prefer the hook so admin-curated labels surface.
 */
export const FALLBACK_LEAD_SOURCE_LABELS: Record<LeadSourceEnum, string> = {
  website: 'Website',
  walk_in: 'Walk-in',
  referral: 'Referral',
  social_media: 'Social Media',
  newspaper: 'Newspaper',
  education_fair: 'Education Fair',
  agent: 'Agent / Partner',
  publisher: 'Publisher',
  google_ads: 'Google Ads',
  facebook_ads: 'Facebook Ads',
  inbound_call: 'Inbound Call',
  whatsapp: 'WhatsApp',
  gate_entry: 'Gate Entry',
  other: 'Other',
};
