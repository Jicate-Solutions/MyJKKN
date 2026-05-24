'use client';

/**
 * React Query hooks for HR People (all backed by staff table after consolidation).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HRPersonFilters, HRPersonListResponse } from '@/types/hr';

const BASE = '/api/hr/employees';

function buildQueryString(filters: HRPersonFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  });
  return params.toString();
}

export function useHREmployees(filters: HRPersonFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['hr-people', filters],
    queryFn: async (): Promise<HRPersonListResponse> => {
      const qs = buildQueryString(filters);
      const res = await fetch(`${BASE}${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`HR people list failed: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useHREmployee(id: string | undefined, _source: 'staff' = 'staff', enabled = true) {
  return useQuery({
    queryKey: ['hr-person', 'staff', id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/${id}?source=staff`);
      if (!res.ok) throw new Error(`HR person get failed: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    enabled: enabled && !!id,
  });
}

/**
 * @deprecated hr_employees table has been dropped. Non-staff creation should
 * go through the staff module. This stub prevents compile errors in
 * app/(routes)/hr/employees/new/page.tsx until that page is updated.
 */
export function useCreateHREmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_input: Record<string, unknown>) => {
      throw new Error(
        'hr_employees table has been dropped. Use the staff module to create employees.'
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-people'] }),
  });
}

export function useDeactivateHREmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`${BASE}/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Deactivate failed');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-people'] }),
  });
}
