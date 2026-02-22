'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelWaitlistService } from '@/lib/services/campus-living/hostel-waitlist-service';
import type {
  HostelWaitlist,
} from '@/types/campus-living';

// Query key factory
export const hostelWaitlistKeys = {
  all: ['hostel-waitlist'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-waitlist', 'list', filters] as const,
  detail: (id: string) => ['hostel-waitlist', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelWaitlist(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: hostelWaitlistKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelWaitlistService.getWaitlist(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelWaitlistEntry(id: string) {
  return useQuery({
    queryKey: hostelWaitlistKeys.detail(id),
    queryFn: () => HostelWaitlistService.getWaitlistEntry(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<HostelWaitlist, 'id' | 'offered_at' | 'offer_expires_at' | 'allocated_allocation_id' | 'created_at' | 'updated_at'>) =>
      HostelWaitlistService.addToWaitlist(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelWaitlistKeys.all });
      toast.success('Added to waitlist');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add to waitlist: ${error.message}`);
    },
  });
}

export function useUpdateHostelWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelWaitlist> }) =>
      HostelWaitlistService.updateWaitlistEntry(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelWaitlistKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelWaitlistKeys.detail(variables.id) });
      toast.success('Waitlist entry updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update waitlist entry: ${error.message}`);
    },
  });
}

export function useDeleteHostelWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelWaitlistService.deleteWaitlistEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelWaitlistKeys.all });
      toast.success('Removed from waitlist');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove from waitlist: ${error.message}`);
    },
  });
}
