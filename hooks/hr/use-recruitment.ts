'use client';

/**
 * HR Recruitment Hooks (Phase 1A)
 *
 * Pattern: mirrors hooks/hr/use-leave.ts exactly.
 * All mutations invalidate ['hr-recruitment-candidates'] and the individual
 * candidate cache on success.
 *
 * Spec: specs/hr-recruitment-module-spec.md
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HRRecruitmentCandidate,
  HRRecruitmentCandidateInsert,
  HRRecruitmentCandidatePackage,
  HRRecruitmentCandidatePackageInsert,
  CandidateFilters,
  CandidateListResponse,
  CandidateStatus,
  // Phase 3 types
  HRRecruitmentJob,
  HRRecruitmentJobInsert,
  HRRecruitmentJobUpdate,
  JobFilters,
  JobListResponse,
  HRRecruitmentInterview,
  HRRecruitmentInterviewInsert,
  HRRecruitmentInterviewUpdate,
  InterviewFilters,
  InterviewListResponse,
  InterviewMode,
  HRRecruitmentScorecard,
  HRRecruitmentScorecardInsert,
} from '@/types/hr-recruitment';

const BASE = '/api/hr/recruitment';

// =====================================================================================
// Candidate queries
// =====================================================================================

export function useCandidates(filters: CandidateFilters = {}) {
  return useQuery({
    queryKey: ['hr-recruitment-candidates', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.hr_organization_id) params.set('hr_organization_id', filters.hr_organization_id);
      if (filters.institution_id) params.set('institution_id', filters.institution_id);
      if (filters.role_category) params.set('role_category', filters.role_category);
      if (filters.source) params.set('source', filters.source);
      if (filters.search) params.set('search', filters.search);
      if (filters.is_emergency !== undefined) {
        params.set('is_emergency', String(filters.is_emergency));
      }
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        statuses.forEach((s) => params.append('status', s));
      }
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

      const res = await fetch(`${BASE}/candidates?${params}`);
      if (!res.ok) throw new Error(`Candidates list failed: ${res.status}`);
      return (await res.json()) as CandidateListResponse;
    },
  });
}

export function useCandidate(id: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-candidate', id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/candidates/${id}`);
      if (!res.ok) throw new Error(`Candidate fetch failed: ${res.status}`);
      return ((await res.json()).data) as HRRecruitmentCandidate;
    },
    enabled: !!id,
  });
}

// =====================================================================================
// Candidate mutations
// =====================================================================================

export function useSubmitCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<HRRecruitmentCandidateInsert, 'submitted_by'>) => {
      const res = await fetch(`${BASE}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Submit failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
    },
  });
}

export function useApproveCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) => {
      const res = await fetch(`${BASE}/candidates/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Approve failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidate;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.id] });
    },
  });
}

export function useRejectCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`${BASE}/candidates/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Reject failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidate;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.id] });
    },
  });
}

export function useWithdrawCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await fetch(`${BASE}/candidates/${id}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Withdraw failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidate;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.id] });
    },
  });
}

export function useUpdateCandidateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CandidateStatus }) => {
      const res = await fetch(`${BASE}/candidates/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Status update failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidate;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.id] });
    },
  });
}

// =====================================================================================
// Package queries
// =====================================================================================

export function usePackages(candidateId: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-packages', candidateId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/candidates/${candidateId}/packages`);
      if (!res.ok) throw new Error(`Packages list failed: ${res.status}`);
      return ((await res.json()).data ?? []) as HRRecruitmentCandidatePackage[];
    },
    enabled: !!candidateId,
  });
}

// =====================================================================================
// Package mutations
// =====================================================================================

export function useProposePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<HRRecruitmentCandidatePackageInsert, 'proposed_by'>
    ) => {
      const res = await fetch(`${BASE}/candidates/${payload.candidate_id}/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Propose package failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidatePackage;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-packages', data.candidate_id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.candidate_id] });
    },
  });
}

export function useApprovePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ candidateId, packageId }: { candidateId: string; packageId: string }) => {
      const res = await fetch(
        `${BASE}/candidates/${candidateId}/packages/${packageId}/approve`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Approve package failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidatePackage;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-packages', data.candidate_id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.candidate_id] });
    },
  });
}

export function useCounterPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidateId,
      packageId,
      proposed_monthly_salary,
      proposed_monthly_salary_breakdown,
      notes,
      hr_organization_id,
    }: {
      candidateId: string;
      packageId: string;
      proposed_monthly_salary: number;
      proposed_monthly_salary_breakdown?: Record<string, number> | null;
      notes?: string | null;
      hr_organization_id?: string | null;
    }) => {
      const res = await fetch(
        `${BASE}/candidates/${candidateId}/packages/${packageId}/counter`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposed_monthly_salary,
            proposed_monthly_salary_breakdown,
            notes,
            hr_organization_id,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Counter offer failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidatePackage;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-packages', data.candidate_id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.candidate_id] });
    },
  });
}

// =====================================================================================
// Phase 3 — Jobs hooks
// =====================================================================================

export function useJobs(filters: JobFilters = {}) {
  return useQuery({
    queryKey: ['hr-recruitment-jobs', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.hr_organization_id) params.set('hr_organization_id', filters.hr_organization_id);
      if (filters.institution_id) params.set('institution_id', filters.institution_id);
      if (filters.role_category) params.set('role_category', filters.role_category);
      if (filters.department_id) params.set('department_id', filters.department_id);
      if (filters.is_public !== undefined) params.set('is_public', String(filters.is_public));
      if (filters.search) params.set('search', filters.search);
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        statuses.forEach((s) => params.append('status', s));
      }
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

      const res = await fetch(`${BASE}/jobs?${params}`);
      if (!res.ok) throw new Error(`Jobs list failed: ${res.status}`);
      return (await res.json()) as JobListResponse;
    },
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-job', id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/jobs/${id}`);
      if (!res.ok) throw new Error(`Job fetch failed: ${res.status}`);
      return ((await res.json()).data) as HRRecruitmentJob;
    },
    enabled: !!id,
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<HRRecruitmentJobInsert, 'created_by'>) => {
      const res = await fetch(`${BASE}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Create job failed');
      }
      return ((await res.json()).data) as HRRecruitmentJob;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-jobs'] });
    },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: HRRecruitmentJobUpdate }) => {
      const res = await fetch(`${BASE}/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update job failed');
      }
      return ((await res.json()).data) as HRRecruitmentJob;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-jobs'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job', data.id] });
    },
  });
}

export function usePublishJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/jobs/${id}/publish`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Publish job failed');
      }
      return ((await res.json()).data) as HRRecruitmentJob;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-jobs'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job', data.id] });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/jobs/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Delete job failed');
      }
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-jobs'] });
    },
  });
}

// =====================================================================================
// Phase 3 — Interviews hooks
// =====================================================================================

export function useInterviews(filters: InterviewFilters = {}) {
  return useQuery({
    queryKey: ['hr-recruitment-interviews', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.candidate_id) params.set('candidate_id', filters.candidate_id);
      if (filters.job_id) params.set('job_id', filters.job_id);
      if (filters.panel_member_id) params.set('panel_member_id', filters.panel_member_id);
      if (filters.from_date) params.set('from_date', filters.from_date);
      if (filters.to_date) params.set('to_date', filters.to_date);
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        statuses.forEach((s) => params.append('status', s));
      }
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

      const res = await fetch(`${BASE}/interviews?${params}`);
      if (!res.ok) throw new Error(`Interviews list failed: ${res.status}`);
      return (await res.json()) as InterviewListResponse;
    },
  });
}

export function useInterview(id: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-interview', id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/interviews/${id}`);
      if (!res.ok) throw new Error(`Interview fetch failed: ${res.status}`);
      return ((await res.json()).data) as HRRecruitmentInterview;
    },
    enabled: !!id,
  });
}

export function useScheduleInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<HRRecruitmentInterviewInsert, 'created_by'>) => {
      const res = await fetch(`${BASE}/interviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Schedule interview failed');
      }
      return ((await res.json()).data) as HRRecruitmentInterview;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interviews'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.candidate_id] });
    },
  });
}

export function useRescheduleInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      scheduled_at,
      duration_minutes,
      mode,
      location_or_link,
      panel_member_ids,
      round_name,
    }: {
      id: string;
      scheduled_at: string;
      duration_minutes?: number;
      mode?: InterviewMode;
      location_or_link?: string | null;
      panel_member_ids?: string[];
      round_name?: string | null;
    }) => {
      const res = await fetch(`${BASE}/interviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reschedule',
          scheduled_at,
          duration_minutes,
          mode,
          location_or_link,
          panel_member_ids,
          round_name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Reschedule failed');
      }
      return ((await res.json()).data) as HRRecruitmentInterview;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interviews'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interview', data.id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.candidate_id] });
    },
  });
}

export function useCancelInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await fetch(`${BASE}/interviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Cancel failed');
      }
      return ((await res.json()).data) as HRRecruitmentInterview;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interviews'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interview', data.id] });
    },
  });
}

export function useUpdateInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: HRRecruitmentInterviewUpdate }) => {
      const res = await fetch(`${BASE}/interviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update interview failed');
      }
      return ((await res.json()).data) as HRRecruitmentInterview;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interviews'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interview', data.id] });
    },
  });
}

// =====================================================================================
// Phase 3 — Scorecards hooks
// =====================================================================================

export function useScorecards(interviewId: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-scorecards', interviewId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/interviews/${interviewId}/scorecards`);
      if (!res.ok) throw new Error(`Scorecards list failed: ${res.status}`);
      return ((await res.json()).data ?? []) as HRRecruitmentScorecard[];
    },
    enabled: !!interviewId,
  });
}

export function useScorecard(id: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-scorecard', id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/scorecards/${id}`);
      if (!res.ok) throw new Error(`Scorecard fetch failed: ${res.status}`);
      return ((await res.json()).data) as HRRecruitmentScorecard;
    },
    enabled: !!id,
  });
}

export function useSubmitScorecard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<HRRecruitmentScorecardInsert, 'interviewer_id' | 'interview_id'> & {
        interview_id: string;
      }
    ) => {
      const { interview_id, ...body } = payload;
      const res = await fetch(`${BASE}/interviews/${interview_id}/scorecards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Submit scorecard failed');
      }
      return ((await res.json()).data) as HRRecruitmentScorecard;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-scorecards', data.interview_id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interview', data.interview_id] });
    },
  });
}
