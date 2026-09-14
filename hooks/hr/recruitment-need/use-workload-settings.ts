'use client';

/**
 * Per-institution workload settings — React Query hooks over
 * /api/hr/workload/settings. A refused request keeps its HTTP status on the
 * error so the page can show the 403 reason instead of a generic failure.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  InstitutionWorkloadSettings,
  WorkloadSettingsInput,
} from '@/lib/services/hr/recruitment-need/workload-settings-service';

export class WorkloadSettingsRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'WorkloadSettingsRequestError';
  }
}

export const workloadSettingsKeys = {
  all: ['hr-workload-settings'] as const,
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: 'include' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new WorkloadSettingsRequestError(json.message ?? json.error ?? `HTTP ${res.status}`, res.status);
  }
  return json.data as T;
}

export function useWorkloadSettings() {
  return useQuery({
    queryKey: workloadSettingsKeys.all,
    queryFn: () => request<InstitutionWorkloadSettings[]>('/api/hr/workload/settings'),
    retry: (count, err) =>
      !(err instanceof WorkloadSettingsRequestError && (err.status === 401 || err.status === 403)) && count < 2,
  });
}

export function useSaveWorkloadSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkloadSettingsInput & { institution_id: string }) =>
      request<InstitutionWorkloadSettings>('/api/hr/workload/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: workloadSettingsKeys.all }),
  });
}
