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

export interface PickerOption {
  value: string;
  label: string;
}

// Fetch helper for the institution-scoped service-role picker routes.
// These routes (app/api/cdc/pickers/*) read via the service-role client so
// CDC coordinators — who hold cdc.* but NOT learners.*/staff.* — get data
// despite RLS, while the API re-imposes institution scope server-side.
// The routes already build the "First Last (CODE)" label, so the hooks
// consume `options` directly and the exported PickerOption[] shape is
// unchanged — all 6 consumers keep working.
async function fetchPickerOptions(url: string, label: string): Promise<PickerOption[]> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      console.error(`[cdc-pickers] Failed to load ${label}: HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    return (json.options as PickerOption[]) || [];
  } catch (err) {
    console.error(`[cdc-pickers] Failed to load ${label}:`, err);
    return [];
  }
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
    queryFn: () => fetchPickerOptions('/api/cdc/pickers/learners', 'learners'),
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
    queryFn: () => fetchPickerOptions('/api/cdc/pickers/staff', 'staff'),
    staleTime: 5 * 60 * 1000,
  });
}
