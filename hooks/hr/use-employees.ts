'use client';

/**
 * React Query hooks for HR Employees (Sprint 1 Phase D).
 * Per MyJKKN conventions: isSuperAdmin bypass on enabled flag.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HREmployeeFilters, HREmployeeListResponse, HREmployeeWithRelations } from '@/types/hr';
import type { CreateEmployeeInput } from '@/features/hr/employees/types';

const BASE = '/api/hr/employees';

function buildQueryString(filters: HREmployeeFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  });
  return params.toString();
}

export function useHREmployees(filters: HREmployeeFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['hr-employees', filters],
    queryFn: async (): Promise<HREmployeeListResponse> => {
      const qs = buildQueryString(filters);
      const res = await fetch(`${BASE}${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`HR employees list failed: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useHREmployee(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['hr-employee', id],
    queryFn: async (): Promise<HREmployeeWithRelations> => {
      const res = await fetch(`${BASE}/${id}`);
      if (!res.ok) throw new Error(`HR employee get failed: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    enabled: enabled && !!id,
  });
}

export function useCreateHREmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEmployeeInput) => {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
    },
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
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      qc.invalidateQueries({ queryKey: ['hr-employee', variables.id] });
    },
  });
}
