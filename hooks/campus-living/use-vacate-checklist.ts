'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelVacateChecklistService } from '@/lib/services/campus-living/hostel-vacate-checklist-service';
import type { VacateChecklistItemInput } from '@/types/hostel-vacate';

export const vacateChecklistKeys = {
  all: ['hostel-vacate-checklist'] as const,
};

export function useVacateChecklistItems() {
  return useQuery({
    queryKey: vacateChecklistKeys.all,
    queryFn: () => HostelVacateChecklistService.list(),
  });
}

export function useCreateChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, userId }: { input: VacateChecklistItemInput; userId: string }) =>
      HostelVacateChecklistService.create(input, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vacateChecklistKeys.all });
      toast.success('Checklist item added');
    },
    onError: (error: Error) => toast.error(`Failed to add item: ${error.message}`),
  });
}

export function useUpdateChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
      userId,
    }: {
      id: string;
      input: Partial<VacateChecklistItemInput>;
      userId: string;
    }) => HostelVacateChecklistService.update(id, input, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vacateChecklistKeys.all });
      toast.success('Checklist item updated');
    },
    onError: (error: Error) => toast.error(`Failed to update item: ${error.message}`),
  });
}

export function useDeleteChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelVacateChecklistService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vacateChecklistKeys.all });
      toast.success('Checklist item deleted');
    },
    onError: (error: Error) => toast.error(`Failed to delete item: ${error.message}`),
  });
}

export function useReorderChecklistItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderedIds, userId }: { orderedIds: string[]; userId: string }) =>
      HostelVacateChecklistService.reorder(orderedIds, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vacateChecklistKeys.all }),
    onError: (error: Error) => toast.error(`Failed to reorder: ${error.message}`),
  });
}
