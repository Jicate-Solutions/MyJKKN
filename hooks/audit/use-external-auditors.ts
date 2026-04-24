// hooks/audit/use-external-auditors.ts
// React Query hooks for the External Auditor (Time-Boxed) admin UI.
// Calls the /api/audit/external-auditors endpoints (server-side, permission-gated).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateExternalAuditorInput,
  ExternalAuditorRow,
} from '@/lib/services/audit/audit-external-auditor-service';

export const externalAuditorKeys = {
  all: ['audit', 'external-auditors'] as const,
  list: () => [...externalAuditorKeys.all, 'list'] as const,
};

async function httpJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (payload as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return payload as T;
}

export function useExternalAuditors() {
  return useQuery({
    queryKey: externalAuditorKeys.list(),
    queryFn: async () => {
      const payload = await httpJson<{ data: ExternalAuditorRow[] }>(
        '/api/audit/external-auditors'
      );
      return payload.data ?? [];
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateExternalAuditor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExternalAuditorInput) =>
      httpJson('/api/audit/external-auditors', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: externalAuditorKeys.list() }),
  });
}

export function useExtendExternalAuditor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, extendDays = 7 }: { userId: string; extendDays?: number }) =>
      httpJson(`/api/audit/external-auditors/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ extend_days: extendDays }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: externalAuditorKeys.list() }),
  });
}

export function useRevokeExternalAuditor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      httpJson(`/api/audit/external-auditors/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: externalAuditorKeys.list() }),
  });
}
