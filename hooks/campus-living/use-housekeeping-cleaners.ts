'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HousekeepingCleanerService } from '@/lib/services/campus-living/housekeeping-cleaner-service';
import { getErrorMessage } from '@/lib/utils';
import type { CreateCleanerDto, UpdateCleanerDto } from '@/types/campus-living/housekeeping';

export const housekeepingCleanerKeys = {
  all: ['housekeeping-cleaners'] as const,
  // The directory is global, so the list has no institution dimension.
  list: (includeInactive?: boolean) =>
    ['housekeeping-cleaners', 'list', includeInactive ?? false] as const,
  assignable: (blockId?: string, date?: string) =>
    ['housekeeping-cleaners', 'assignable', blockId ?? 'none', date ?? 'none'] as const,
};

export function useHousekeepingCleaners(includeInactive = false) {
  return useQuery({
    queryKey: housekeepingCleanerKeys.list(includeInactive),
    queryFn: () => HousekeepingCleanerService.listCleaners(includeInactive),
  });
}

export function useAssignableCleaners(blockId?: string, bookingDate?: string) {
  return useQuery({
    queryKey: housekeepingCleanerKeys.assignable(blockId, bookingDate),
    queryFn: () =>
      HousekeepingCleanerService.listAssignableForBooking(blockId as string, bookingDate as string),
    enabled: Boolean(blockId && bookingDate),
  });
}

export function useCreateCleaner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCleanerDto) => HousekeepingCleanerService.createCleaner(dto),
    onSuccess: (_d, dto) => {
      qc.invalidateQueries({ queryKey: housekeepingCleanerKeys.all });
      toast.success(
        dto.block_ids.length === 0
          ? 'Cleaner saved — assign them to at least one block before they can take jobs.'
          : 'Cleaner added',
      );
    },
    onError: (error) => toast.error(`Could not add cleaner: ${getErrorMessage(error)}`),
  });
}

export function useUpdateCleaner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cleanerId, dto }: { cleanerId: string; dto: UpdateCleanerDto }) =>
      HousekeepingCleanerService.updateCleaner(cleanerId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingCleanerKeys.all });
      toast.success('Cleaner updated');
    },
    onError: (error) => toast.error(`Could not update cleaner: ${getErrorMessage(error)}`),
  });
}

export function useDeleteCleaner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cleanerId: string) => HousekeepingCleanerService.deleteCleaner(cleanerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingCleanerKeys.all });
      toast.success('Cleaner removed');
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      toast.error(
        msg.includes('23503') || msg.toLowerCase().includes('foreign key')
          ? 'This cleaner appears in booking history, so they cannot be deleted. Mark them inactive instead.'
          : `Could not remove cleaner: ${msg}`,
      );
    },
  });
}
