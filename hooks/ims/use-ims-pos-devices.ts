'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ImsPosDeviceListResponse,
  ImsPosDeviceMetaInput,
  ImsPosDeviceTestResult,
} from '@/types/ims/pos-devices';

const KEY = ['ims-pos-devices'];
const BASE = '/api/ims/pos-devices';

/** Error carrying the API's `error` code (e.g. 'confirm_live', 'vault_not_configured'). */
export class PosDeviceApiError extends Error {
  constructor(message: string, public readonly code: string | null, public readonly status: number) {
    super(message);
    this.name = 'PosDeviceApiError';
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new PosDeviceApiError(
      json?.message || json?.error || `Request failed (${res.status})`,
      json?.error ?? null,
      res.status,
    );
  }
  return json.data as T;
}

export function useImsPosDevices() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => call<ImsPosDeviceListResponse>(''),
    staleTime: 30 * 1000,
  });
}

function useDeviceMutation<V>(fn: (v: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateImsPosDevice() {
  return useDeviceMutation((data: ImsPosDeviceMetaInput) => call<{ id: string }>('', { method: 'POST', body: data }));
}

export function useUpdateImsPosDevice() {
  return useDeviceMutation(({ id, data }: { id: string; data: ImsPosDeviceMetaInput }) =>
    call(`/${id}`, { method: 'PATCH', body: data }),
  );
}

export function useSetImsPosDeviceCredentials() {
  return useDeviceMutation(({ id, username, appKey }: { id: string; username: string; appKey: string }) =>
    call(`/${id}/credentials`, { method: 'POST', body: { username, appKey } }),
  );
}

export function useSetImsPosDeviceActive() {
  return useDeviceMutation(({ id, active }: { id: string; active: boolean }) =>
    call(`/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'POST', body: {} }),
  );
}

export function useDeleteImsPosDevice() {
  return useDeviceMutation((id: string) => call(`/${id}`, { method: 'DELETE' }));
}

export function useTestImsPosDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmLive }: { id: string; confirmLive?: boolean }) =>
      call<ImsPosDeviceTestResult>(`/${id}/test`, { method: 'POST', body: { confirmLive: !!confirmLive } }),
    // The test writes last_push_at / last_error_* — refresh the health columns.
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
