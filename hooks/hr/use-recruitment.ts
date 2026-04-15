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
      proposed_ctc_amount,
      proposed_ctc_breakdown,
      notes,
      hr_organization_id,
    }: {
      candidateId: string;
      packageId: string;
      proposed_ctc_amount: number;
      proposed_ctc_breakdown?: Record<string, number> | null;
      notes?: string | null;
      hr_organization_id?: string | null;
    }) => {
      const res = await fetch(
        `${BASE}/candidates/${candidateId}/packages/${packageId}/counter`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposed_ctc_amount,
            proposed_ctc_breakdown,
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
