'use client';

/**
 * React Query hook for the HR Compensation Analytics dashboard (C3).
 */

import { useQuery } from '@tanstack/react-query';
import type {
  CompensationPayload,
  CompensationFilters,
} from '@/types/hr-compensation';

const COMPENSATION_KEY = 'hr-compensation';

async function fetchCompensation(
  filters: CompensationFilters
): Promise<CompensationPayload> {
  const params = new URLSearchParams();
  if (filters.institution_id)
    params.set('institution_id', filters.institution_id);
  if (filters.period_year)
    params.set('period_year', String(filters.period_year));
  if (filters.period_month)
    params.set('period_month', String(filters.period_month));

  const qs = params.toString();
  const url = `/api/hr/compensation${qs ? `?${qs}` : ''}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error ?? `Compensation fetch failed (${res.status})`
    );
  }
  return res.json();
}

export function useCompensation(filters: CompensationFilters = {}) {
  return useQuery<CompensationPayload>({
    queryKey: [COMPENSATION_KEY, filters],
    queryFn: () => fetchCompensation(filters),
    staleTime: 5 * 60 * 1000,
  });
}
