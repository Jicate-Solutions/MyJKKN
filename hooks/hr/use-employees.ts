'use client';

/**
 * React Query hooks for the HR Employee Directory (all backed by the staff table).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HRPersonFilters,
  HRPersonListResponse,
  HRPersonView,
  HRPersonDetailView,
} from '@/types/hr';

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

export function useHREmployee(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['hr-person', 'staff', id],
    queryFn: async (): Promise<HRPersonDetailView> => {
      const res = await fetch(`${BASE}/${id}`);
      if (!res.ok) throw new Error(`HR person get failed: ${res.status}`);
      const json = await res.json();
      return json.data as HRPersonDetailView;
    },
    enabled: enabled && !!id,
  });
}

/**
 * One page, fetched imperatively.
 *
 * The advanced DataTable owns its own page/search state and calls a plain
 * async function — it does not read through React Query — so the directory
 * needs this alongside useHREmployees(). The hook stays for anything that
 * wants the cached, declarative form.
 */
export async function fetchHREmployeesPage(
  filters: HRPersonFilters
): Promise<HRPersonListResponse> {
  const qs = buildQueryString(filters);
  const res = await fetch(`${BASE}${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HR people list failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch ALL rows matching the current filters (no pagination) for export.
 * Requires the caller's role to hold hr.employees.export (enforced server-side).
 */
export async function fetchHREmployeesForExport(
  filters: HRPersonFilters
): Promise<HRPersonView[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && k !== 'page' && k !== 'pageSize') {
      params.set(k, String(v));
    }
  });
  params.set('export', '1');
  const res = await fetch(`${BASE}?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HR employees export failed: ${res.status}`);
  }
  const json = (await res.json()) as HRPersonListResponse;
  return json.data;
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
