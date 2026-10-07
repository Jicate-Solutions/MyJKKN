'use client';

/**
 * React Query hooks for the salary register sign-off (20271007161107).
 *
 * They go through /api/hr/payroll/register/signoff?runId=…, which calls the
 * database functions with the person's own session. A refusal comes back as
 * { success: false, error } and is thrown with that exact message, so the
 * toast says why (rule #27).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RegisterSignoffResult,
  RegisterSignoffRevokeResult,
  RegisterSignoffStage,
  RegisterSignoffStatus,
} from '@/types/hr-register-signoff';

export const REGISTER_SIGNOFF_KEYS = {
  status: (runId: string) => ['hr', 'salary-register', 'signoff', runId] as const,
};

async function readEnvelope<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error ?? body?.message ?? `Request failed (${res.status})`);
  }
  return body?.data as T;
}

const signoffUrl = (runId: string) =>
  `/api/hr/payroll/register/signoff?runId=${encodeURIComponent(runId)}`;

export function useRegisterSignoffStatus(runId: string | null) {
  return useQuery<RegisterSignoffStatus>({
    queryKey: REGISTER_SIGNOFF_KEYS.status(runId ?? ''),
    queryFn: async () => readEnvelope<RegisterSignoffStatus>(await fetch(signoffUrl(runId as string))),
    enabled: Boolean(runId),
    staleTime: 15 * 1000,
    retry: false,
  });
}

export function useSignRegister(runId: string) {
  const qc = useQueryClient();
  return useMutation<RegisterSignoffResult, Error, { stage: RegisterSignoffStage; note?: string | null }>({
    mutationFn: async ({ stage, note }) =>
      readEnvelope<RegisterSignoffResult>(
        await fetch(signoffUrl(runId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage, note: note ?? null }),
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: REGISTER_SIGNOFF_KEYS.status(runId) }),
  });
}

export function useRevokeRegisterSignoff(runId: string) {
  const qc = useQueryClient();
  return useMutation<RegisterSignoffRevokeResult, Error, { signoffId: string; reason: string }>({
    mutationFn: async ({ signoffId, reason }) =>
      readEnvelope<RegisterSignoffRevokeResult>(
        await fetch(signoffUrl(runId), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signoffId, reason }),
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: REGISTER_SIGNOFF_KEYS.status(runId) }),
  });
}
