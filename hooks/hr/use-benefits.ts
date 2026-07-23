'use client';

/**
 * React Query hooks for the HR Benefits Management module (C4).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BenefitsListResponse,
  BenefitsFilters,
  BenefitsEnrollmentStats,
  HRBenefitWithCount,
  HRBenefitEnrollment,
  CreateBenefitRequest,
  EnrollStaffRequest,
} from '@/types/hr-benefits';

const BENEFITS_KEY = 'hr-benefits';
const BENEFITS_STATS_KEY = 'hr-benefits-stats';

// =====================================================================================
// Fetchers
// =====================================================================================

async function fetchBenefits(
  filters: BenefitsFilters
): Promise<BenefitsListResponse> {
  const params = new URLSearchParams();
  if (filters.institution_id)
    params.set('institution_id', filters.institution_id);
  if (filters.category) params.set('category', filters.category);
  if (filters.is_active !== undefined)
    params.set('is_active', String(filters.is_active));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const qs = params.toString();
  const url = `/api/hr/benefits${qs ? `?${qs}` : ''}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Benefits fetch failed (${res.status})`);
  }
  return res.json();
}

async function fetchBenefitDetail(id: string): Promise<{
  benefit: HRBenefitWithCount;
  enrollments: HRBenefitEnrollment[];
}> {
  const res = await fetch(`/api/hr/benefits/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Benefit fetch failed (${res.status})`);
  }
  return res.json();
}

async function fetchBenefitsStats(
  institutionId?: string
): Promise<BenefitsEnrollmentStats> {
  const params = new URLSearchParams();
  if (institutionId) params.set('institution_id', institutionId);
  params.set('stats', 'true');

  const qs = params.toString();
  const res = await fetch(`/api/hr/benefits?${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Stats fetch failed (${res.status})`);
  }
  return res.json();
}

// =====================================================================================
// Hooks
// =====================================================================================

export function useBenefits(filters: BenefitsFilters = {}) {
  return useQuery<BenefitsListResponse>({
    queryKey: [BENEFITS_KEY, filters],
    queryFn: () => fetchBenefits(filters),
    staleTime: 2 * 60 * 1000,
  });
}

export function useBenefitDetail(id: string | null) {
  return useQuery({
    queryKey: [BENEFITS_KEY, 'detail', id],
    queryFn: () => fetchBenefitDetail(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useBenefitsStats(institutionId?: string) {
  return useQuery<BenefitsEnrollmentStats>({
    queryKey: [BENEFITS_STATS_KEY, institutionId],
    queryFn: () => fetchBenefitsStats(institutionId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateBenefitRequest) => {
      const res = await fetch('/api/hr/benefits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create benefit');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BENEFITS_KEY] });
      queryClient.invalidateQueries({ queryKey: [BENEFITS_STATS_KEY] });
    },
  });
}

export function useEnrollStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: EnrollStaffRequest) => {
      const res = await fetch(`/api/hr/benefits/${data.benefit_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enroll', staff_id: data.staff_id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to enroll staff');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BENEFITS_KEY] });
      queryClient.invalidateQueries({ queryKey: [BENEFITS_STATS_KEY] });
    },
  });
}
