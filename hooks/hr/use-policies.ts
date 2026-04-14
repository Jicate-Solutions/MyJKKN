'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE = '/api/hr/policies';

export function usePolicyList(table: string, orgId: string | undefined, showSuperseded = false) {
  return useQuery({
    queryKey: ['hr-policy', table, orgId, showSuperseded],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (orgId) params.set('hr_organization_id', orgId);
      if (showSuperseded) params.set('showSuperseded', 'true');
      const res = await fetch(`${BASE}/${table}?${params}`);
      if (!res.ok) throw new Error(`List failed: ${res.status}`);
      return res.json();
    },
    enabled: !!table,
  });
}

export function usePolicyHistory(table: string, orgId: string | undefined) {
  return useQuery({
    queryKey: ['hr-policy-history', table, orgId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (orgId) params.set('hr_organization_id', orgId);
      const res = await fetch(`${BASE}/${table}/history?${params}`);
      if (!res.ok) throw new Error(`History failed: ${res.status}`);
      return (await res.json()).data ?? [];
    },
    enabled: !!table && !!orgId,
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, payload }: { table: string; payload: Record<string, unknown> }) => {
      const res = await fetch(`${BASE}/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Create failed');
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-policy', vars.table] });
      qc.invalidateQueries({ queryKey: ['hr-policy-history', vars.table] });
    },
  });
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, id, payload }: { table: string; id: string; payload: Record<string, unknown> }) => {
      const res = await fetch(`${BASE}/${table}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update failed');
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-policy', vars.table] });
      qc.invalidateQueries({ queryKey: ['hr-policy-history', vars.table] });
    },
  });
}

export function useDeactivatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const res = await fetch(`${BASE}/${table}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Deactivate failed');
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-policy', vars.table] });
    },
  });
}

export function useRestorePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, version_id }: { table: string; version_id: string }) => {
      const res = await fetch(`${BASE}/${table}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Restore failed');
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-policy', vars.table] });
      qc.invalidateQueries({ queryKey: ['hr-policy-history', vars.table] });
    },
  });
}

export function usePolicyDiff(table: string, oldId: string | null, newId: string | null, orgId: string | undefined) {
  return useQuery({
    queryKey: ['hr-policy-diff', table, oldId, newId],
    queryFn: async () => {
      const params = new URLSearchParams({ action: 'diff', old_id: oldId!, new_id: newId! });
      if (orgId) params.set('hr_organization_id', orgId);
      const res = await fetch(`${BASE}/${table}/history?${params}`);
      if (!res.ok) throw new Error(`Diff failed: ${res.status}`);
      return (await res.json()).data ?? [];
    },
    enabled: !!oldId && !!newId,
  });
}
