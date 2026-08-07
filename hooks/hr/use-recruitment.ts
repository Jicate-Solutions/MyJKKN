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
  // Job Applications
  HRJobApplication,
  HRJobApplicationInsert,
  JobApplicationStatus,
  PurgeRejectedApplicantResponse,
  HRRecruitmentCandidateComment,
  HRRecruitmentJobNote,
  ApprovalsJobOverviewRow,
  ApprovalFlowStepTemplate,
  HRApprovalFlow,
  JobAnalytics,
  MonthlySalaryBand,
  OnboardToStaffPayload,
  RoleCategory,
} from '@/types/hr-recruitment';
import type { LeaveApprovalStep } from '@/types/hr';

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
      if (filters.pending_for_me) params.set('pending_for_me', 'true');
      if (filters.approver_id) params.set('approver_id', filters.approver_id);
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
      qc.invalidateQueries({ queryKey: ['hr-recruitment-approvals-overview'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-analytics'] });
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
      qc.invalidateQueries({ queryKey: ['hr-recruitment-approvals-overview'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-analytics'] });
    },
  });
}

export function useUpdateStepComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stepIndex, comment }: { id: string; stepIndex: number; comment: string }) => {
      const res = await fetch(`${BASE}/candidates/${id}/step-comment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_index: stepIndex, comment }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update comment failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidate;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
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
      proposed_monthly_salary?: number | null;
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
      if (!id) return null;
      const res = await fetch(`${BASE}/jobs/${id}`);
      if (res.status === 404) return null;
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

// =====================================================================================
// Job Applications hooks
// =====================================================================================

export function useApplyForJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: HRJobApplicationInsert) => {
      const res = await fetch(`${BASE}/jobs/${payload.job_id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Application submit failed');
      }
      return ((await res.json()).data) as HRJobApplication;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job', data.job_id] });
    },
  });
}

// -------------------------------------------------------------------------------------
// Application screening (HR side): list → review/shortlist/reject → promote to pipeline
// -------------------------------------------------------------------------------------

export interface JobApplicationFilters {
  job_id?: string;
  status?: JobApplicationStatus[];
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useJobApplications(filters: JobApplicationFilters = {}) {
  return useQuery({
    queryKey: ['hr-job-applications', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.job_id) params.set('job_id', filters.job_id);
      if (filters.status) filters.status.forEach((s) => params.append('status', s));
      if (filters.search) params.set('search', filters.search);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
      const res = await fetch(`${BASE}/applications?${params}`);
      if (!res.ok) throw new Error(`Applications fetch failed: ${res.status}`);
      return (await res.json()) as {
        data: HRJobApplication[];
        metadata: { total: number; page: number; pageSize: number };
      };
    },
  });
}

/** One application for the screening detail page (pre-promotion applicants). */
export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: ['hr-job-application', id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/applications/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Application fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as HRJobApplication;
    },
    enabled: !!id,
  });
}

export function useReviewApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      status: Extract<JobApplicationStatus, 'reviewed' | 'shortlisted' | 'rejected'>;
      review_notes?: string | null;
    }) => {
      const res = await fetch(`${BASE}/applications/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: payload.status, review_notes: payload.review_notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Review failed');
      }
      return ((await res.json()).data) as HRJobApplication;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-job-applications'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-approvals-overview'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-analytics'] });
    },
  });
}

export function usePromoteApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      monthly_salary_band?: MonthlySalaryBand | null;
      is_emergency?: boolean;
    }) => {
      const res = await fetch(`${BASE}/applications/${payload.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthly_salary_band: payload.monthly_salary_band ?? null,
          is_emergency: payload.is_emergency ?? false,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Promote failed');
      }
      return ((await res.json()).data) as {
        application: HRJobApplication;
        candidate: HRRecruitmentCandidate;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-job-applications'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-approvals-overview'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-analytics'] });
    },
  });
}

/**
 * Permanently erase a REJECTED applicant — super admins only, irreversible.
 *
 * Pass whichever id the row has: `applicationId` for a screening rejection,
 * `candidateId` for one rejected inside the approval pipeline. The server follows
 * promoted_candidate_id to clean up the other side, so a promoted-then-rejected
 * person is fully removed either way.
 *
 * The super-admin and rejected-only checks are enforced server-side; the UI gate
 * only decides whether the button is shown.
 */
export function usePurgeRejectedApplicant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { applicationId?: string; candidateId?: string }) => {
      const path = payload.applicationId
        ? `${BASE}/applications/${payload.applicationId}`
        : `${BASE}/candidates/${payload.candidateId}`;
      const res = await fetch(path, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Delete failed');
      }
      return ((await res.json()).data) as PurgeRejectedApplicantResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-job-applications'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-approvals-overview'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-analytics'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interviews'] });
    },
  });
}

// -------------------------------------------------------------------------------------
// Candidate discussion thread
// -------------------------------------------------------------------------------------

export function useCandidateComments(candidateId: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-candidate-comments', candidateId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/candidates/${candidateId}/comments`);
      if (!res.ok) throw new Error(`Comments fetch failed: ${res.status}`);
      return ((await res.json()).data) as HRRecruitmentCandidateComment[];
    },
    enabled: !!candidateId,
  });
}

export function useAddCandidateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      candidate_id: string;
      comment: string;
      parent_comment_id?: string | null;
    }) => {
      const res = await fetch(`${BASE}/candidates/${payload.candidate_id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: payload.comment,
          parent_comment_id: payload.parent_comment_id ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Comment failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidateComment;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate-comments', data.candidate_id] });
    },
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

// =====================================================================================
// Job-first approvals workspace (2026-07-06)
// =====================================================================================

/** Jobs + pipeline counts + awaiting-me counts for /hr/recruitment/approvals. */
export function useApprovalsJobOverview(search?: string) {
  return useQuery({
    queryKey: ['hr-recruitment-approvals-overview', search ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`${BASE}/approvals/overview?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Overview fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as ApprovalsJobOverviewRow[];
    },
    staleTime: 30 * 1000,
  });
}

/** Promoted candidates linked to a job (soft role_specific_details->>'job_id' link). */
export function useCandidatesForJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-job-candidates', jobId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/jobs/${jobId}/candidates`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Candidates fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as HRRecruitmentCandidate[];
    },
    enabled: !!jobId,
  });
}

/**
 * The approval chain this job's applicants will enter when promoted.
 *
 * Read straight after someone applies — there is no candidate row (and so no
 * frozen chain) until Promote, and the workspace still needs to show reviewers
 * the configured route. `reason` distinguishes "no flows for this org" from
 * "flows exist but none routes this role category" so the UI can name the gap.
 */
export function useJobApprovalFlow(jobId: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-job-approval-flow', jobId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/jobs/${jobId}/approval-flow`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Approval flow fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as {
        steps: LeaveApprovalStep[];
        reason: 'ok' | 'no_flows' | 'no_match';
      };
    },
    enabled: !!jobId,
  });
}

/** Job-level discussion thread (Notes tab). */
export function useJobNotes(jobId: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-job-notes', jobId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/jobs/${jobId}/notes`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Notes fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as HRRecruitmentJobNote[];
    },
    enabled: !!jobId,
  });
}

export function useAddJobNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { job_id: string; note: string }) => {
      const res = await fetch(`${BASE}/jobs/${payload.job_id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: payload.note }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Note failed');
      }
      return ((await res.json()).data) as HRRecruitmentJobNote;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-notes', data.job_id] });
    },
  });
}

/** Per-job funnel + timing analytics (Analytics tab). */
export function useJobAnalytics(jobId: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-job-analytics', jobId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/jobs/${jobId}/analytics`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Analytics fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as JobAnalytics;
    },
    enabled: !!jobId,
  });
}

// =====================================================================================
// Dynamic approval flows + step interviews + onboarding (2026-07-06)
// =====================================================================================

export function useApprovalFlows(hrOrganizationId?: string) {
  return useQuery({
    queryKey: ['hr-recruitment-approval-flows', hrOrganizationId ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (hrOrganizationId) params.set('hr_organization_id', hrOrganizationId);
      const res = await fetch(`${BASE}/approval-flows?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Flows fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as HRApprovalFlow[];
    },
  });
}

export function useUpsertApprovalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      flow_name: string;
      role_categories: RoleCategory[];
      steps: ApprovalFlowStepTemplate[];
      hr_organization_ids: string[];
      is_active?: boolean;
    }) => {
      const res = await fetch(`${BASE}/approval-flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Flow save failed');
      }
      return ((await res.json()).data) as { updated: number; created: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-approval-flows'] });
    },
  });
}

/** Activate/deactivate a flow template (removes it from promote-time matching). */
export function useSetApprovalFlowActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await fetch(`${BASE}/approval-flows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Flow update failed');
      }
      return ((await res.json()).data) as { id: string; is_active: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-approval-flows'] });
    },
  });
}

/** Delete a flow template. In-flight candidates keep their frozen chains. */
export function useDeleteApprovalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/approval-flows/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Flow delete failed');
      }
      return ((await res.json()).data) as { id: string; deleted: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-approval-flows'] });
    },
  });
}

/** Schedule (or reschedule) the interview attached to the candidate's current step. */
export function useScheduleStepInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      candidate_id: string;
      scheduled_at: string;
      duration_minutes?: number;
      mode: InterviewMode;
      location_or_link?: string | null;
      panel_member_ids?: string[];
    }) => {
      const { candidate_id, ...body } = payload;
      const res = await fetch(`${BASE}/candidates/${candidate_id}/schedule-step-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Interview scheduling failed');
      }
      return ((await res.json()).data) as {
        candidate: HRRecruitmentCandidate;
        interview_id: string;
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.candidate.id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-interviews'] });
    },
  });
}

/** Final step: create the staff record from a finally-approved candidate. */
export function useOnboardToStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { candidate_id: string } & OnboardToStaffPayload) => {
      const { candidate_id, ...body } = payload;
      const res = await fetch(`${BASE}/candidates/${candidate_id}/onboard-to-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Onboarding failed');
      }
      return ((await res.json()).data) as {
        staff: { id: string; first_name: string; last_name: string };
        candidate: HRRecruitmentCandidate;
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.candidate.id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-approvals-overview'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-analytics'] });
    },
  });
}

/** Start the pre-join onboarding checklist for a finally-approved candidate. */
export function useStartOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidateId: string) => {
      const res = await fetch(`${BASE}/candidates/${candidateId}/onboarding/start`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Starting onboarding failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidate;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
    },
  });
}

/** Toggle one onboarding checklist step (authorized per-step server-side). */
export function useCompleteOnboardingStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      candidate_id: string;
      step_index: number;
      completed: boolean;
    }) => {
      const res = await fetch(
        `${BASE}/candidates/${payload.candidate_id}/onboarding/complete-step`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step_index: payload.step_index,
            completed: payload.completed,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Step update failed');
      }
      return ((await res.json()).data) as HRRecruitmentCandidate;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', data.id] });
      qc.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
    },
  });
}

/** Role → active-holder counts (flow builder warning when a role has 0 users). */
export function useRoleUserCounts() {
  return useQuery({
    queryKey: ['hr-role-user-counts'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/approval-flows/role-user-counts`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Role counts fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as Array<{
        role_key: string;
        role_name: string;
        users: number;
      }>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * People directory for the flow builder's pinned-approver picker.
 * roleKey: 'all' (free search, needs ≥2 chars) | 'super_admin' | a role_key.
 */
export function useRoleUsers(roleKey: string, search: string, enabled: boolean) {
  return useQuery({
    queryKey: ['hr-role-users', roleKey, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('role_key', roleKey);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`${BASE}/approval-flows/role-users?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `People fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        is_super_admin: boolean;
        roles: string[];
      }>;
    },
    enabled,
    staleTime: 60 * 1000,
  });
}

/** Active HR organizations (flow builder org selector). */
export function useHrOrganizations() {
  return useQuery({
    queryKey: ['hr-organizations-list'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/approval-flows/organizations`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Organizations fetch failed: ${res.status}`);
      }
      return ((await res.json()).data) as Array<{
        id: string;
        name: string | null;
        institution_id: string | null;
      }>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
