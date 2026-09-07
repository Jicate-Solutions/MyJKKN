'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HousekeepingAvailabilityService } from '@/lib/services/campus-living/housekeeping-availability-service';
import { getErrorMessage } from '@/lib/utils';
import type { UpsertAvailabilityDto } from '@/types/campus-living/housekeeping';

export const housekeepingAvailabilityKeys = {
  all: ['housekeeping-availability'] as const,
  block: (blockId?: string) => ['housekeeping-availability', 'block', blockId ?? 'none'] as const,
  policies: () => ['housekeeping-availability', 'policies'] as const,
};

export function useBlockAvailability(blockId?: string, institutionId?: string) {
  return useQuery({
    queryKey: housekeepingAvailabilityKeys.block(blockId),
    queryFn: () =>
      HousekeepingAvailabilityService.listForBlock(blockId as string, institutionId as string),
    enabled: Boolean(blockId && institutionId),
  });
}

export function useUpsertAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpsertAvailabilityDto) => HousekeepingAvailabilityService.upsertWeekday(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingAvailabilityKeys.all });
      // The learner slot grid is DERIVED from availability, so it is stale now.
      qc.invalidateQueries({ queryKey: ['housekeeping-bookings'] });
      toast.success('Availability saved');
    },
    onError: (error) => toast.error(`Could not save availability: ${getErrorMessage(error)}`),
  });
}

export function useHousekeepingPolicies() {
  return useQuery({
    queryKey: housekeepingAvailabilityKeys.policies(),
    queryFn: () => HousekeepingAvailabilityService.listPolicies(),
  });
}

export function useSaveHousekeepingPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ policyKey, value }: { policyKey: string; value: unknown }) =>
      HousekeepingAvailabilityService.savePolicy(policyKey, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingAvailabilityKeys.policies() });
      qc.invalidateQueries({ queryKey: ['housekeeping-bookings'] });
      toast.success('Setting saved');
    },
    onError: (error) => toast.error(`Could not save setting: ${getErrorMessage(error)}`),
  });
}
