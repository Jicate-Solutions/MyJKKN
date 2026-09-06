'use client';

/**
 * Choose Your Menu — Mode C (Special-Day) hooks (2026-06-23).
 *
 * Query keys live under ['mess','special-day',...]. Mutations also invalidate
 * ['campus-living','recognition'] so an approval's recognition pings surface on
 * open My Meals pages without a deploy.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessSpecialDayService,
  type SpecialDayStatus,
} from '@/lib/services/campus-living/mess-special-day-service';

export function useSpecialDays(
  status: SpecialDayStatus | null = null,
  upcomingOnly = false,
  enabled = true
) {
  return useQuery({
    queryKey: ['mess', 'special-day', 'list', status ?? 'all', upcomingOnly],
    queryFn: () => MessSpecialDayService.list(status, upcomingOnly),
    enabled,
    staleTime: 30_000,
  });
}

export function useCanPropose(enabled = true) {
  return useQuery({
    queryKey: ['mess', 'special-day', 'can-propose'],
    queryFn: () => MessSpecialDayService.canPropose(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

function useInvalidateSpecialDays() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['mess', 'special-day'] });
    qc.invalidateQueries({ queryKey: ['campus-living', 'recognition'] });
  };
}

export function useProposeSpecialDay() {
  const invalidate = useInvalidateSpecialDays();
  return useMutation({
    mutationFn: (input: Parameters<typeof MessSpecialDayService.propose>[0]) =>
      MessSpecialDayService.propose(input),
    onSuccess: invalidate,
  });
}

export function useApproveSpecialDay() {
  const invalidate = useInvalidateSpecialDays();
  return useMutation({
    mutationFn: (vars: { proposalId: string }) => MessSpecialDayService.approve(vars.proposalId),
    onSuccess: invalidate,
  });
}

export function useRejectSpecialDay() {
  const invalidate = useInvalidateSpecialDays();
  return useMutation({
    mutationFn: (vars: { proposalId: string }) => MessSpecialDayService.reject(vars.proposalId),
    onSuccess: invalidate,
  });
}
