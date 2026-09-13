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
  JOB_NOT_FOUND,
  JOB_SIGNED_OUT,
  computeCaps,
  describeJob,
  istDayStart,
  submitDraftRequest,
  unreadableJobView,
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

/** The ceiling on today's own-rows read. It exists only to bound the query; it
 *  is NOT the cap. If a future `/admin/ai-models` edit raises
 *  daily_cap_per_user above this, the fetch would saturate and the counter
 *  would silently under-report — so a saturated read is treated as a FAILED
 *  read (caps.readFailed) rather than as a small number. */
export const TODAY_ROW_LIMIT = 200;

async function readToday(): Promise<OwnJobRow[]> {
  const { data, error } = await sb()
    .from('ai_jobs')
    .select('id, status, requested_at')
    .eq('job_type', ONEMARK_DRAFT_JOB_TYPE)
    .neq('status', 'canceled')
    .gte('requested_at', istDayStart(new Date()).toISOString())
    .order('requested_at', { ascending: true })
    .limit(TODAY_ROW_LIMIT);
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
  // A failed read is NOT a zero. If either query threw, or if today's fetch hit
  // its own ceiling, the panel knows nothing about the allowance and must say
  // so — showing "5 of 5 left today" off an empty error result would let a
  // spent day be discovered by the refusal, which Lane G item 3 forbids.
  const readFailed =
    contract.isError || today.isError || rows.length >= TODAY_ROW_LIMIT;

  const budget: DraftBudget = {
    caps: computeCaps(contract.data ?? null, rows.length, new Date(), readFailed),
    today: rows,
  };

  return {
    ...budget,
    isLoading: contract.isLoading || today.isLoading,
    isError: readFailed,
    refetch: () => {
      void contract.refetch();
      void today.refetch();
    },
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

/** Three shapes of failure, three different answers:
 *   - 401 -> the session died. An ENDING. Terminal, with a sign-in sentence.
 *   - 404 -> fn_ai_job_status said not_found. An ENDING. Terminal.
 *   - anything else non-ok -> transient. THROWN, so React Query retries it a
 *     bounded number of times and then settles into an error the panel renders
 *     as "could not read this request".
 *  Before this, every one of them became {status:'unknown'} -> non-terminal ->
 *  a 10-second poll that ran for as long as the tab stayed open. */
async function readJob(jobId: string): Promise<JobStatusPayload> {
  const response = await fetch(`${DRAFT_STATUS_ROUTE}?id=${encodeURIComponent(jobId)}`);
  if (response.status === 401) {
    return { status: JOB_SIGNED_OUT, result: null, error: null };
  }
  if (response.status === 404) {
    return { status: JOB_NOT_FOUND, result: null, error: null };
  }
  if (!response.ok) {
    throw new Error(`status read failed (${response.status})`);
  }
  const body = await response.json();
  return {
    status: typeof body?.status === 'string' ? body.status : 'unknown',
    result: body?.result ?? null,
    error: typeof body?.error === 'string' ? body.error : null,
  };
}

/** Polls one request until it reaches a terminal state, then stops. Terminal
 *  means filed, errored, cancelled, signed out, not found, or unreadable —
 *  "the model finished" is NOT terminal, because the collect pass has not run
 *  yet. There is no state this poll cannot leave. */
export function useDraftJobStatus(jobId: string | null) {
  const query = useQuery({
    queryKey: draftRequestKeys.job(jobId ?? ''),
    queryFn: () => readJob(jobId as string),
    enabled: !!jobId,
    retry: 3,
    refetchInterval: (q) => {
      if (q.state.status === 'error') return false;
      const d = q.state.data as JobStatusPayload | undefined;
      if (!d) return 10_000;
      return describeJob(d.status, d.result, d.error).terminal ? false : 10_000;
    },
  });

  const view: JobView | null = query.isError
    ? unreadableJobView()
    : query.data
      ? describeJob(query.data.status, query.data.result, query.data.error)
      : null;

  return { view };
}
