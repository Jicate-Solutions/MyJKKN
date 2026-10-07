'use client';

/**
 * React Query hooks for HR duty playbooks (20271007161139), through
 * /api/hr/playbooks. Every rule lives in the database functions; these hooks
 * only fetch and invalidate.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  PlaybookContributor,
  PlaybookDecideInput,
  PlaybookLine,
  PlaybookProposal,
} from '@/types/hr-playbook';

const KEY = ['hr-playbooks'] as const;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

export function useDutyPlaybook(duty: string | null) {
  return useQuery({
    queryKey: [...KEY, 'duty', duty],
    enabled: Boolean(duty),
    queryFn: async () =>
      (await call<{ lines: PlaybookLine[] }>(`/api/hr/playbooks?duty=${encodeURIComponent(duty as string)}`)).lines,
  });
}

export function usePlaybookProposals(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'proposals'],
    enabled,
    queryFn: async () => (await call<{ proposals: PlaybookProposal[] }>('/api/hr/playbooks?view=proposals')).proposals,
  });
}

export function usePlaybookContributors() {
  return useQuery({
    queryKey: [...KEY, 'contributors'],
    queryFn: async () =>
      (await call<{ contributors: PlaybookContributor[] }>('/api/hr/playbooks?view=contributors')).contributors,
  });
}

export function useSuggestPlaybookLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { duty: string; text: string }) =>
      call<{ id: string }>('/api/hr/playbooks', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDecidePlaybookProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: PlaybookDecideInput & { id: string }) =>
      call<{ id: string }>('/api/hr/playbooks/decide', { method: 'POST', body: JSON.stringify({ id, ...input }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRetirePlaybookLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      call<{ id: string }>('/api/hr/playbooks/lines/retire', { method: 'POST', body: JSON.stringify({ id, note }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
