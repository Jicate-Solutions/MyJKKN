// hooks/pde/use-clinical-reasoning.ts
// AICBL → PDE Clinical Reasoning sprint, Agent C
// ----------------------------------------------------------------------------
// React Query hooks for the student-facing clinical case attempt UI.
//
// Endpoints used:
//   - POST /api/pde/coach                 (Agent B) — Socratic feedback
//   - POST /api/pde/clinical-reasoning/score  (Agent E) — image_tag scoring
//   - direct supabase from-client for read-only queries (RLS-protected)
//
// All hooks fail loud: errors are surfaced via React Query state so the UI
// can render retry buttons. We never silently swallow.

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  CoachRequestBody,
  CoachResponseBody,
  ClinicalAnswerEnvelope,
  ClinicalEvidenceEnvelope,
} from '@/types/pde-clinical-reasoning';

// ──────────────────────────────────────────────────────────────────────────────
// Query keys
// ──────────────────────────────────────────────────────────────────────────────

export const clinicalReasoningKeys = {
  all: ['pde', 'clinical-reasoning'] as const,
  case: (assessmentId: string) => [...clinicalReasoningKeys.all, 'case', assessmentId] as const,
  attempts: (assessmentId: string, learnerId: string) =>
    [...clinicalReasoningKeys.all, 'attempts', assessmentId, learnerId] as const,
  submission: (submissionId: string) =>
    [...clinicalReasoningKeys.all, 'submission', submissionId] as const,
};

// ──────────────────────────────────────────────────────────────────────────────
// Attempt history — read-only query against pde_submissions.
// Used by AttemptCounter to show "Attempt N of 5".
// ──────────────────────────────────────────────────────────────────────────────

export function useAttemptHistory(assessmentId: string, learnerId: string | undefined) {
  return useQuery({
    queryKey: clinicalReasoningKeys.attempts(assessmentId, learnerId || ''),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('pde_submissions')
        .select('id, attempt_number, completed_at, auto_score, final_score, passed, created_at')
        .eq('assessment_id', assessmentId)
        .eq('learner_id', learnerId!)
        .order('attempt_number', { ascending: false });

      if (error) throw new Error(`Failed to load attempt history: ${error.message}`);
      return data ?? [];
    },
    enabled: !!learnerId,
    staleTime: 30_000,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Submit a single answer to Agent B's coach endpoint (free_text_socratic).
// Returns the Socratic feedback. On 4xx/5xx, throws so the UI can render retry.
// ──────────────────────────────────────────────────────────────────────────────

export interface CoachInvokeResult {
  feedback: string;
  retryable: boolean;
}

export function useCoachFeedback() {
  return useMutation<CoachInvokeResult, Error, CoachRequestBody>({
    mutationFn: async (body) => {
      const res = await fetch('/api/pde/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        // [blocked-by-B] guard: until Agent B's route is fully wired for
        // clinical_case, an HTML 4xx could leak through. Fail loud.
        throw new Error(`Coach endpoint returned non-JSON (${res.status}). Try again.`);
      }

      const payload = (await res.json()) as CoachResponseBody & { error?: string; retryable?: boolean };
      if (!res.ok) {
        const msg = typeof payload.error === 'string' ? payload.error : `HTTP ${res.status}`;
        const e = new Error(msg) as Error & { retryable?: boolean };
        e.retryable = payload.retryable ?? (res.status >= 500 && res.status < 600);
        throw e;
      }

      // Normalize across new and legacy response shapes.
      // New (Agent B clinical_case branch): { feedback: '...' }
      // Legacy placeholder: { data: { coachReply: { content: '...' } } }
      const feedback = payload.feedback
        ?? payload.data?.coachReply?.content
        ?? '';
      if (!feedback) {
        throw new Error('Coach returned an empty reply. Try again.');
      }
      return { feedback, retryable: false };
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Finalize an attempt — calls Agent E's /api/pde/clinical-reasoning/score
// with just the submissionId. The server reads the row, runs the OSCE
// rubric, writes back final_score + domain_scores + engagement event +
// quality_evidence_mappings (if above threshold).
//
// Spec deviation note: my initial assumption was per-click image_tag
// scoring against /score. Agent E's actual contract is whole-attempt
// scoring with { submissionId }. Image-tag per-click validation runs
// locally in ImageTagQuestion against question.expected_regions.
// ──────────────────────────────────────────────────────────────────────────────

export interface FinalizeAttemptResult {
  osce_score: {
    percentage: number;
    domain_scores?: Record<string, number>;
  };
  passed: boolean;
  evidence_created: boolean;
}

export function useFinalizeAttempt() {
  return useMutation<FinalizeAttemptResult, Error, { submissionId: string }>({
    mutationFn: async ({ submissionId }) => {
      const res = await fetch('/api/pde/clinical-reasoning/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Score endpoint returned non-JSON (${res.status}). Try again.`);
      }
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      return payload as FinalizeAttemptResult;
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Complete a case attempt — writes pde_submissions row only.
// One INSERT per finished attempt (not per question). Agent E's /score
// endpoint runs the OSCE rubric and writes final_score + engagement event.
// ──────────────────────────────────────────────────────────────────────────────

export function useCompleteAttempt() {
  const qc = useQueryClient();
  return useMutation<
    { submissionId: string },
    Error,
    {
      assessmentId: string;
      learnerId: string;
      attemptNumber: number;
      assessmentVersion: number;
      rollNumberSnapshot: string | null;
      answers: ClinicalAnswerEnvelope[];
      evidence: ClinicalEvidenceEnvelope;
      timeSpentSeconds: number;
      autoScore: number | null;
      passed: boolean | null;
    }
  >({
    mutationFn: async (input) => {
      const supabase = createClient();

      const startedAt = new Date(Date.now() - input.timeSpentSeconds * 1000).toISOString();

      const { data, error } = await supabase
        .from('pde_submissions')
        .insert({
          assessment_id: input.assessmentId,
          learner_id: input.learnerId,
          attempt_number: input.attemptNumber,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          answers: input.answers,
          evidence_urls: input.evidence,
          auto_score: input.autoScore,
          final_score: input.autoScore,
          passed: input.passed,
          time_spent_seconds: input.timeSpentSeconds,
          assessment_version: input.assessmentVersion,
          roll_number_snapshot: input.rollNumberSnapshot,
        })
        .select('id')
        .single();

      if (error || !data) {
        throw new Error(`Failed to save attempt: ${error?.message ?? 'no data'}`);
      }

      // NOTE: engagement event is written by Agent E's /score endpoint
      // (event_type='clinical_case_completed'), so we do NOT duplicate it
      // here. See app/api/pde/clinical-reasoning/score/route.ts side-effect 3.

      return { submissionId: data.id };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: clinicalReasoningKeys.attempts(vars.assessmentId, vars.learnerId) });
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Load a specific submission for the summary page.
// ──────────────────────────────────────────────────────────────────────────────

export function useSubmission(submissionId: string | undefined) {
  return useQuery({
    queryKey: clinicalReasoningKeys.submission(submissionId ?? ''),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('pde_submissions')
        .select('*')
        .eq('id', submissionId!)
        .single();
      if (error) throw new Error(`Failed to load submission: ${error.message}`);
      return data;
    },
    enabled: !!submissionId,
    staleTime: 60_000,
  });
}
