'use client';

/**
 * HR Recruitment Need — Admin CRUD React Query Hooks
 *
 * Wraps API routes under /api/hr/recruitment-need/ for admin pages.
 * Pattern: fetch-based (API routes), not direct supabase client.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HRRegulatoryBody,
  HRRegulatoryNorm,
  HRSpecialization,
  HRPeerBenchmark,
} from '@/types/hr-recruitment-need';
import type { WeightPolicy, ThresholdPolicy } from '@/lib/services/hr/recruitment-need/admin-service';

// ─── Fetch helper ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: 'include' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.data ?? json;
}

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const adminKeys = {
  all: ['hr-recruitment-admin'] as const,
  bodies: () => [...adminKeys.all, 'bodies'] as const,
  norms: () => [...adminKeys.all, 'norms'] as const,
  specializations: (bodyId?: string) => [...adminKeys.all, 'specializations', bodyId ?? 'all'] as const,
  benchmarks: () => [...adminKeys.all, 'benchmarks'] as const,
  weights: () => [...adminKeys.all, 'weights'] as const,
  thresholds: () => [...adminKeys.all, 'thresholds'] as const,
  counts: () => [...adminKeys.all, 'counts'] as const,
};

// ─── Regulatory Bodies ─────────────────────────────────────────────────────────

export function useBodies() {
  return useQuery({
    queryKey: adminKeys.bodies(),
    queryFn: () => apiFetch<HRRegulatoryBody[]>('/api/hr/recruitment-need/bodies'),
  });
}

export function useCreateBody() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<HRRegulatoryBody>) =>
      apiFetch<HRRegulatoryBody>('/api/hr/recruitment-need/bodies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.bodies() }),
  });
}

export function useUpdateBody() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<HRRegulatoryBody> & { id: string }) =>
      apiFetch<HRRegulatoryBody>(`/api/hr/recruitment-need/bodies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.bodies() }),
  });
}

export function useDeleteBody() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/hr/recruitment-need/bodies/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.bodies() }),
  });
}

// ─── Regulatory Norms ──────────────────────────────────────────────────────────

export function useNorms() {
  return useQuery({
    queryKey: adminKeys.norms(),
    queryFn: () => apiFetch<(HRRegulatoryNorm & { body?: HRRegulatoryBody })[]>('/api/hr/recruitment-need/norms'),
  });
}

export function useCreateNorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (norm: Partial<HRRegulatoryNorm>) =>
      apiFetch<HRRegulatoryNorm>('/api/hr/recruitment-need/norms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(norm),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.norms() }),
  });
}

export function useUpdateNorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<HRRegulatoryNorm> & { id: string }) =>
      apiFetch<HRRegulatoryNorm>(`/api/hr/recruitment-need/norms/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.norms() }),
  });
}

export function useDeleteNorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/hr/recruitment-need/norms/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.norms() }),
  });
}

// ─── Specializations ───────────────────────────────────────────────────────────

export function useSpecializations(bodyId?: string) {
  const url = bodyId
    ? `/api/hr/recruitment-need/specializations?body_id=${bodyId}`
    : '/api/hr/recruitment-need/specializations';
  return useQuery({
    queryKey: adminKeys.specializations(bodyId),
    queryFn: () => apiFetch<HRSpecialization[]>(url),
  });
}

export function useCreateSpecialization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (spec: Partial<HRSpecialization>) =>
      apiFetch<HRSpecialization>('/api/hr/recruitment-need/specializations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useUpdateSpecialization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<HRSpecialization> & { id: string }) =>
      apiFetch<HRSpecialization>(`/api/hr/recruitment-need/specializations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useDeleteSpecialization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/hr/recruitment-need/specializations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

// ─── Peer Benchmarks ───────────────────────────────────────────────────────────

export function useBenchmarks() {
  return useQuery({
    queryKey: adminKeys.benchmarks(),
    queryFn: () => apiFetch<HRPeerBenchmark[]>('/api/hr/recruitment-need/peer-benchmarks'),
  });
}

export function useCreateBenchmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bm: Partial<HRPeerBenchmark>) =>
      apiFetch<HRPeerBenchmark>('/api/hr/recruitment-need/peer-benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bm),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.benchmarks() }),
  });
}

export function useUpdateBenchmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<HRPeerBenchmark> & { id: string }) =>
      apiFetch<HRPeerBenchmark>(`/api/hr/recruitment-need/peer-benchmarks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.benchmarks() }),
  });
}

export function useDeleteBenchmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/hr/recruitment-need/peer-benchmarks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.benchmarks() }),
  });
}

// ─── Signal Weights ────────────────────────────────────────────────────────────

export function useWeights() {
  return useQuery({
    queryKey: adminKeys.weights(),
    queryFn: () => apiFetch<WeightPolicy[]>('/api/hr/recruitment-need/weights'),
  });
}

export function useUpdateWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weights: { key: string; value: string }[]) =>
      apiFetch<void>('/api/hr/recruitment-need/weights', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.weights() }),
  });
}

// ─── Per-Input Thresholds ─────────────────────────────────────────────────────

export function useThresholds() {
  return useQuery({
    queryKey: adminKeys.thresholds(),
    queryFn: () => apiFetch<ThresholdPolicy[]>('/api/hr/recruitment-need/thresholds'),
  });
}

export function useUpdateThresholds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (thresholds: { key: string; value: string }[]) =>
      apiFetch<void>('/api/hr/recruitment-need/thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholds }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.thresholds() }),
  });
}
