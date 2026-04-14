'use client';

/**
 * React Query hooks for HR People (unified view over staff + hr_employees).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HRPersonFilters, HRPersonListResponse } from '@/types/hr';
import type { HREmployeeInsert } from '@/types/hr';

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

export function useHREmployee(id: string | undefined, source: 'staff' | 'hr_employees' = 'hr_employees', enabled = true) {
  return useQuery({
    queryKey: ['hr-person', source, id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/${id}?source=${source}`);
      if (!res.ok) throw new Error(`HR person get failed: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    enabled: enabled && !!id,
  });
}

export function useCreateHREmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: HREmployeeInsert) => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Create failed');
      }
      return res.json();
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
