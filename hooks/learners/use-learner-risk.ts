// hooks/learners/use-learner-risk.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  RiskTier,
  LearnerRiskWithProfile,
  RiskSummary,
  RiskHistoryPoint,
  LearnerIntervention,
  InterventionType,
} from '@/services/learner-risk-service';

// ── Query keys ──────────────────────────────────────────
const RISK_KEYS = {
  assessments: (filters: Record<string, unknown>) =>
    ['learner-risk-assessments', filters] as const,
  summary: (
    institution_id: string,
    department_id?: string,
    section_id?: string
  ) =>
    ['learner-risk-summary', institution_id, department_id, section_id] as const,
  history: (learner_id: string, days?: number) =>
    ['learner-risk-history', learner_id, days] as const,
  interventions: (learner_id: string) =>
    ['learner-interventions', learner_id] as const,
};

// ── Response shapes from API ────────────────────────────
interface AssessmentsResponse {
  data: LearnerRiskWithProfile[];
  count: number;
  page: number;
  page_size: number;
}

interface SummaryResponse extends RiskSummary {}

interface HistoryResponse {
  data: RiskHistoryPoint[];
}

interface CreateInterventionPayload {
  learner_id: string;
  intervention_type: InterventionType;
  notes?: string;
  follow_up_date?: string;
  risk_score_at_time?: number;
}

// ── Hooks ───────────────────────────────────────────────

interface UseRiskAssessmentsParams {
  institution_id: string;
  department_id?: string;
  section_id?: string;
  risk_tier?: RiskTier[];
  date?: string;
  page?: number;
  page_size?: number;
  enabled?: boolean;
}

/**
 * Fetch paginated risk assessments with learner profile data.
 */
export function useRiskAssessments({
  institution_id,
  department_id,
  section_id,
  risk_tier,
  date,
  page = 1,
  page_size = 50,
  enabled = true,
}: UseRiskAssessmentsParams) {
  const filters = {
    institution_id,
    department_id,
    section_id,
    risk_tier,
    date,
    page,
    page_size,
  };

  return useQuery<AssessmentsResponse, Error>({
    queryKey: RISK_KEYS.assessments(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('institution_id', institution_id);
      if (department_id) params.set('department_id', department_id);
      if (section_id) params.set('section_id', section_id);
      if (risk_tier && risk_tier.length > 0)
        params.set('risk_tier', risk_tier.join(','));
      if (date) params.set('date', date);
      params.set('page', String(page));
      params.set('page_size', String(page_size));

      const res = await fetch(
        `/api/learners/risk-assessments?${params.toString()}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch risk assessments');
      }
      return res.json();
    },
    enabled: enabled && !!institution_id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch risk tier summary counts.
 */
export function useRiskSummary(
  institution_id: string,
  department_id?: string,
  section_id?: string,
  enabled = true
) {
  return useQuery<SummaryResponse, Error>({
    queryKey: RISK_KEYS.summary(institution_id, department_id, section_id),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('institution_id', institution_id);
      if (department_id) params.set('department_id', department_id);
      if (section_id) params.set('section_id', section_id);

      const res = await fetch(
        `/api/learners/risk-summary?${params.toString()}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch risk summary');
      }
      return res.json();
    },
    enabled: enabled && !!institution_id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch risk score history for sparkline / trend chart.
 */
export function useRiskHistory(
  learner_id: string,
  days = 30,
  enabled = true
) {
  return useQuery<RiskHistoryPoint[], Error>({
    queryKey: RISK_KEYS.history(learner_id, days),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('days', String(days));

      const res = await fetch(
        `/api/learners/${learner_id}/risk-history?${params.toString()}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch risk history');
      }
      const result: HistoryResponse = await res.json();
      return result.data;
    },
    enabled: enabled && !!learner_id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch interventions for a learner.
 */
export function useInterventions(learner_id: string, enabled = true) {
  return useQuery<LearnerIntervention[], Error>({
    queryKey: RISK_KEYS.interventions(learner_id),
    queryFn: async () => {
      const res = await fetch(`/api/learners/${learner_id}/interventions`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch interventions');
      }
      const result = await res.json();
      return result.data;
    },
    enabled: enabled && !!learner_id,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Create a new intervention. Invalidates assessments + interventions.
 */
export function useCreateIntervention() {
  const queryClient = useQueryClient();

  return useMutation<LearnerIntervention, Error, CreateInterventionPayload>({
    mutationFn: async (payload) => {
      const res = await fetch(
        `/api/learners/${payload.learner_id}/interventions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intervention_type: payload.intervention_type,
            notes: payload.notes,
            follow_up_date: payload.follow_up_date,
            risk_score_at_time: payload.risk_score_at_time,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create intervention');
      }
      const result = await res.json();
      return result.data;
    },
    onSuccess: (_data, variables) => {
      toast.success('Intervention logged successfully');
      queryClient.invalidateQueries({
        queryKey: RISK_KEYS.interventions(variables.learner_id),
      });
      // Also invalidate assessments so the list refreshes
      queryClient.invalidateQueries({
        queryKey: ['learner-risk-assessments'],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to log intervention');
    },
  });
}
