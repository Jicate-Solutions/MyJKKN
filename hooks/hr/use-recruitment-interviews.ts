'use client';

/**
 * HR Recruitment Interviews Hooks
 *
 * Re-exports interview/scorecard hooks from use-recruitment.ts and adds
 * missing action mutations (complete, no_show) that the PATCH API supports
 * but the original hook file doesn't expose.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HRRecruitmentInterview,
} from '@/types/hr-recruitment';

const BASE = '/api/hr/recruitment';

// =====================================================================================
// Re-exports — all existing hooks from use-recruitment.ts
// =====================================================================================

export {
  useInterviews,
  useInterview,
  useScheduleInterview,
  useRescheduleInterview,
  useCancelInterview,
  useUpdateInterview,
  useScorecards,
  useScorecard,
  useSubmitScorecard,
} from '@/hooks/hr/use-recruitment';

// =====================================================================================
// New mutations — complete + no_show (API supports these via PATCH action field
// but use-recruitment.ts doesn't wrap them)
// =====================================================================================

export function useCompleteInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      outcome_summary,
    }: {
      id: string;
      outcome_summary?: string;
    }) => {
      const res = await fetch(`${BASE}/interviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', outcome_summary }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Mark complete failed');
      }
      return ((await res.json()).data) as HRRecruitmentInterview;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interviews'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interview', data.id] });
    },
  });
}

export function useMarkNoShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      outcome_summary,
    }: {
      id: string;
      outcome_summary?: string;
    }) => {
      const res = await fetch(`${BASE}/interviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'no_show', outcome_summary }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Mark no-show failed');
      }
      return ((await res.json()).data) as HRRecruitmentInterview;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interviews'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interview', data.id] });
    },
  });
}
