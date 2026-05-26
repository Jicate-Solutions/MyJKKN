'use client';

/**
 * HR Recruitment Need — Data Entry React Query Hooks
 *
 * Wraps API routes for:
 *   - /api/hr/recruitment-need/approvals
 *   - /api/hr/staff-specializations
 *   - /api/hr/recruitment-need/allocations
 *
 * Pattern: fetch-based (API routes), not direct supabase client.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  InstitutionProgramApproval,
  HRStaffInstitutionAllocation,
} from '@/types/hr-recruitment-need';
import type {
  ApprovalWithJoins,
  AllocationWithStaff,
  StaffWithSpecializations,
  StaffSpecializationRow,
} from '@/lib/services/hr/recruitment-need/data-entry-service';

// ─── Fetch helper ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: 'include' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.data ?? json;
}

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const dataEntryKeys = {
  all: ['hr-data-entry'] as const,
  approvals: (filters?: Record<string, string>) =>
    [...dataEntryKeys.all, 'approvals', filters ?? {}] as const,
  staffSpecs: (filters?: Record<string, string>) =>
    [...dataEntryKeys.all, 'staff-specs', filters ?? {}] as const,
  allocations: (filters?: Record<string, string>) =>
    [...dataEntryKeys.all, 'allocations', filters ?? {}] as const,
  institutions: () => [...dataEntryKeys.all, 'institutions'] as const,
  programs: (institutionId?: string) =>
    [...dataEntryKeys.all, 'programs', institutionId ?? 'all'] as const,
  staff: (institutionId?: string) =>
    [...dataEntryKeys.all, 'staff', institutionId ?? 'all'] as const,
  specializations: () => [...dataEntryKeys.all, 'specializations'] as const,
};

// ─── Lookup Hooks ──────────────────────────────────────────────────────────────

export function useInstitutions() {
  return useQuery({
    queryKey: dataEntryKeys.institutions(),
    queryFn: () =>
      apiFetch<Array<{ id: string; name: string }>>('/api/hr/recruitment-need/approvals?_lookup=institutions'),
  });
}

export function usePrograms(institutionId?: string) {
  return useQuery({
    queryKey: dataEntryKeys.programs(institutionId),
    queryFn: () => {
      const params = institutionId ? `?_lookup=programs&institution_id=${institutionId}` : '?_lookup=programs';
      return apiFetch<Array<{ id: string; name: string }>>(`/api/hr/recruitment-need/approvals${params}`);
    },
  });
}

export function useStaffList(institutionId?: string) {
  return useQuery({
    queryKey: dataEntryKeys.staff(institutionId),
    queryFn: () => {
      const params = institutionId ? `?_lookup=staff&institution_id=${institutionId}` : '?_lookup=staff';
      return apiFetch<Array<{ id: string; first_name: string; last_name: string; institution_id: string }>>(
        `/api/hr/recruitment-need/allocations${params}`
      );
    },
  });
}

export function useSpecializationsList() {
  return useQuery({
    queryKey: dataEntryKeys.specializations(),
    queryFn: () =>
      apiFetch<Array<{ id: string; name: string; body_id: string | null; is_active: boolean }>>(
        '/api/hr/staff-specializations?_lookup=specializations'
      ),
  });
}

// ─── Approvals ─────────────────────────────────────────────────────────────────

export function useApprovals(filters?: { institution_id?: string; body_id?: string }) {
  const params = new URLSearchParams();
  if (filters?.institution_id) params.set('institution_id', filters.institution_id);
  if (filters?.body_id) params.set('body_id', filters.body_id);
  const qs = params.toString();

  return useQuery({
    queryKey: dataEntryKeys.approvals(filters as Record<string, string>),
    queryFn: () =>
      apiFetch<ApprovalWithJoins[]>(`/api/hr/recruitment-need/approvals${qs ? `?${qs}` : ''}`),
  });
}

export function useCreateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<InstitutionProgramApproval>) =>
      apiFetch<InstitutionProgramApproval>('/api/hr/recruitment-need/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'approvals'] }),
  });
}

export function useUpdateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<InstitutionProgramApproval> & { id: string }) =>
      apiFetch<InstitutionProgramApproval>('/api/hr/recruitment-need/approvals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'approvals'] }),
  });
}

export function useDeleteApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/hr/recruitment-need/approvals?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'approvals'] }),
  });
}

// ─── Staff Specializations ─────────────────────────────────────────────────────

export function useStaffSpecializations(filters?: {
  institution_id?: string;
  specialization_id?: string;
  untagged_only?: boolean;
}) {
  const params = new URLSearchParams();
  if (filters?.institution_id) params.set('institution_id', filters.institution_id);
  if (filters?.specialization_id) params.set('specialization_id', filters.specialization_id);
  if (filters?.untagged_only) params.set('untagged_only', 'true');
  const qs = params.toString();

  return useQuery({
    queryKey: dataEntryKeys.staffSpecs(filters as Record<string, string>),
    queryFn: () =>
      apiFetch<StaffWithSpecializations[]>(`/api/hr/staff-specializations${qs ? `?${qs}` : ''}`),
  });
}

export function useAddSpecialization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { staff_id: string; specialization_id: string; is_primary?: boolean }) =>
      apiFetch<StaffSpecializationRow>('/api/hr/staff-specializations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'staff-specs'] }),
  });
}

export function useBulkAddSpecializations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { staff_ids: string[]; specialization_id: string; is_primary?: boolean }) =>
      apiFetch<StaffSpecializationRow[]>('/api/hr/staff-specializations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, bulk: true }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'staff-specs'] }),
  });
}

export function useRemoveSpecialization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/hr/staff-specializations?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'staff-specs'] }),
  });
}

export function useVerifySpecialization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<StaffSpecializationRow>(`/api/hr/staff-specializations?id=${id}&action=verify`, {
        method: 'PUT',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'staff-specs'] }),
  });
}

// ─── Allocations ───────────────────────────────────────────────────────────────

export function useAllocations(filters?: { staff_id?: string; institution_id?: string }) {
  const params = new URLSearchParams();
  if (filters?.staff_id) params.set('staff_id', filters.staff_id);
  if (filters?.institution_id) params.set('institution_id', filters.institution_id);
  const qs = params.toString();

  return useQuery({
    queryKey: dataEntryKeys.allocations(filters as Record<string, string>),
    queryFn: () =>
      apiFetch<AllocationWithStaff[]>(`/api/hr/recruitment-need/allocations${qs ? `?${qs}` : ''}`),
  });
}

export function useCreateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<HRStaffInstitutionAllocation>) =>
      apiFetch<HRStaffInstitutionAllocation>('/api/hr/recruitment-need/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'allocations'] }),
  });
}

export function useUpdateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<HRStaffInstitutionAllocation> & { id: string }) =>
      apiFetch<HRStaffInstitutionAllocation>('/api/hr/recruitment-need/allocations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'allocations'] }),
  });
}

export function useDeleteAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/hr/recruitment-need/allocations?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...dataEntryKeys.all, 'allocations'] }),
  });
}
