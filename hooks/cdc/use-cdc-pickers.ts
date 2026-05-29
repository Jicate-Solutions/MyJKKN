'use client';

// =====================================================================
// hooks/cdc/use-cdc-pickers.ts
// Shared option-source hooks for CDC "new" forms so coordinators pick
// people from a searchable list instead of typing raw UUIDs.
//
// Extracted from the inline learner-picker that PR #1042 added to
// /cdc/placements/new, so internships / mentors / idp new-forms share
// one source of truth. Each hook returns SearchableSelect-ready
// { value, label } options.
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface PickerOption {
  value: string;
  label: string;
}

/**
 * Active + graduated learners for any learner-recipient picker.
 * Label: "First Last (REGISTER_NO)" — searchable by name OR register number.
 * 5000-row cap is ample for current scale (~4500 active+graduated platform-wide);
 * swap for a debounced API-backed search when it grows past that.
 */
export function useLearnersForPicker() {
  return useQuery<PickerOption[]>({
    queryKey: ['cdc-picker-learners'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('learners_profiles')
        .select('id, first_name, last_name, register_number')
        .in('lifecycle_status', ['active', 'graduated'])
        .order('first_name', { ascending: true })
        .limit(5000);
      if (error) {
        console.error('[cdc-pickers] Failed to load learners:', error.message);
        return [];
      }
      return (data || []).map((l: { id: string; first_name: string | null; last_name: string | null; register_number: string | null }) => ({
        value: l.id,
        label:
          `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() +
          (l.register_number ? ` (${l.register_number})` : ''),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Active staff for facilitator / coordinator pickers.
 * Label: "First Last (STAFF_ID)".
 */
export function useStaffForPicker() {
  return useQuery<PickerOption[]>({
    queryKey: ['cdc-picker-staff'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id, first_name, last_name, staff_id')
        .eq('is_active', true)
        .order('first_name', { ascending: true })
        .limit(5000);
      if (error) {
        console.error('[cdc-pickers] Failed to load staff:', error.message);
        return [];
      }
      return (data || []).map((s: { id: string; first_name: string | null; last_name: string | null; staff_id: string | null }) => ({
        value: s.id,
        label:
          `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() +
          (s.staff_id ? ` (${s.staff_id})` : ''),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
