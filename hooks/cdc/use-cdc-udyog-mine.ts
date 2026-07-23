'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export interface MyUdyogRequirement {
  id: string;
  status: 'required' | 'directed' | 'applied' | 'waived' | 'cancelled';
  udyog_reference: string | null;
  due_date: string | null;
  directed_at: string | null;
  applied_at: string | null;
  source_programme_id: string | null;
  programme?: { name: string | null } | null;
}

export interface MyUdyogResponse {
  requirements: MyUdyogRequirement[];
  portalUrl: string;
}

const KEY = ['cdc-udyog-mine'] as const;

async function fetchMine(): Promise<MyUdyogResponse> {
  const res = await fetch('/api/cdc/udyog/mine', { credentials: 'same-origin' });
  if (!res.ok) {
    let msg = `Failed to load (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* default */ }
    throw new Error(msg);
  }
  return res.json();
}

export function useMyUdyog() {
  return useQuery({ queryKey: KEY, queryFn: fetchMine, staleTime: 60 * 1000 });
}

export function useUdyogSelfAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; action: 'direct' | 'apply'; udyog_reference?: string }) => {
      const res = await fetch('/api/cdc/udyog/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? 'Could not update your requirement.');
      return j;
    },
    onSuccess: (_d, vars) => {
      if (vars.action === 'apply') toast.success('Marked as applied. Thank you!');
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
