// hooks/onemark/use-draft-request.ts
// React Query hooks behind the "Ask for AI questions" panel (Wave 3, Lane G).
//
// Three reads, all under the caller's own session — no service-role anywhere:
//   - the contract row (ai_job_types), whose RLS shows enabled rows to any
//     authenticated reader. This is where the caps come from, LIVE, so the
//     panel never quotes a number the queue would then contradict.
//   - the caller's own drafting requests for today (ai_jobs), whose RLS is
//     requested_by = auth.uid(). Counted exactly as fn_ai_enqueue counts them:
//     India-time day, every status except 'canceled'.
//   - one job's status, through the existing /api/ai-jobs/status route.
//
// Nothing here writes fp_items and nothing here touches is_active (decision 7).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  DRAFT_STATUS_ROUTE,
  computeCaps,
  describeJob,
  istDayStart,
  submitDraftRequest,
  type DraftCaps,
  type DraftJobTypeRow,
  type DraftRequestInput,
  type JobView,
  type OwnJobRow,
  type RequestOutcome,
} from '@/lib/services/onemark/draft-request';
import { ONEMARK_DRAFT_JOB_TYPE } from '@/lib/services/onemark/draft-contract';

const sb = () => createClientSupabaseClient() as any;

export const draftRequestKeys = {
  all: ['onemark', 'draft-request'] as const,
  contract: () => [...draftRequestKeys.all, 'contract'] as const,
  today: () => [...draftRequestKeys.all, 'today'] as const,
  job: (jobId: string) => [...draftRequestKeys.all, 'job', jobId] as const,
};

export interface DraftBudget {
  caps: DraftCaps;
  /** The caller's own requests today, newest last — the only queue a browser
   *  session is allowed to see (ai_jobs RLS is requested_by = auth.uid()). */
  today: OwnJobRow[];
}

async function readContract(): Promise<DraftJobTypeRow | null> {
  const { data, error } = await sb()
    .from('ai_job_types')
    .select('job_type, title, lane, enabled, daily_cap_per_user, monthly_spend_cap_inr')
    .eq('job_type', ONEMARK_DRAFT_JOB_TYPE)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as DraftJobTypeRow | null;
}

async function readToday(): Promise<OwnJobRow[]> {
  const { data, error } = await sb()
    .from('ai_jobs')
    .select('id, status, requested_at, completed_at')
    .eq('job_type', ONEMARK_DRAFT_JOB_TYPE)
    .neq('status', 'canceled')
    .gte('requested_at', istDayStart(new Date()).toISOString())
    .order('requested_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as OwnJobRow[];
}

/** Caps and today's usage, read live before the click (never assumed). */
export function useDraftBudget() {
  const contract = useQuery({
    queryKey: draftRequestKeys.contract(),
    queryFn: readContract,
    staleTime: 5 * 60_000,
  });
  const today = useQuery({
    queryKey: draftRequestKeys.today(),
    queryFn: readToday,
    staleTime: 15_000,
  });

  const rows = today.data ?? [];
  const budget: DraftBudget = {
    caps: computeCaps(contract.data ?? null, rows.length, new Date()),
    today: rows,
  };

  return {
    ...budget,
    isLoading: contract.isLoading || today.isLoading,
    isError: contract.isError || today.isError,
  };
}

export function useSubmitDraftRequest() {
  const qc = useQueryClient();
  return useMutation<RequestOutcome, Error, { input: DraftRequestInput; dailyCap: number | null }>({
    mutationFn: ({ input, dailyCap }) =>
      submitDraftRequest(input, dailyCap, (url, init) => fetch(url, init)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: draftRequestKeys.today() });
    },
  });
}

interface JobStatusPayload {
  status: string;
  result: unknown;
  error: string | null;
}

async function readJob(jobId: string): Promise<JobStatusPayload> {
  const response = await fetch(`${DRAFT_STATUS_ROUTE}?id=${encodeURIComponent(jobId)}`);
  if (!response.ok) {
    return { status: 'unknown', result: null, error: null };
  }
  const body = await response.json();
  return {
    status: typeof body?.status === 'string' ? body.status : 'unknown',
    result: body?.result ?? null,
    error: typeof body?.error === 'string' ? body.error : null,
  };
}

/** Polls one request until it reaches a terminal state, then stops. Terminal
 *  means filed, errored or cancelled — "the model finished" is NOT terminal,
 *  because the collect pass has not run yet. */
export function useDraftJobStatus(jobId: string | null) {
  const query = useQuery({
    queryKey: draftRequestKeys.job(jobId ?? ''),
    queryFn: () => readJob(jobId as string),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const d = q.state.data as JobStatusPayload | undefined;
      if (!d) return 10_000;
      return describeJob(d.status, d.result, d.error).terminal ? false : 10_000;
    },
  });

  const view: JobView | null = query.data
    ? describeJob(query.data.status, query.data.result, query.data.error)
    : null;

  return { view, rawStatus: query.data?.status ?? null, isLoading: query.isLoading };
}
