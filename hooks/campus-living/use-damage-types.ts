'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelDamageTypeService } from '@/lib/services/campus-living/hostel-damage-type-service';
import type { HostelDamageTypeInput } from '@/types/hostel-vacate';

export const damageTypeKeys = {
  all: ['hostel-damage-types'] as const,
};

export function useDamageTypes() {
  return useQuery({
    queryKey: damageTypeKeys.all,
    queryFn: () => HostelDamageTypeService.list(),
  });
}

export function useCreateDamageType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, userId }: { input: HostelDamageTypeInput; userId: string }) =>
      HostelDamageTypeService.create(input, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: damageTypeKeys.all });
      toast.success('Damage type added');
    },
    onError: (error: Error) => toast.error(`Failed to add damage type: ${error.message}`),
  });
}

export function useUpdateDamageType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
      userId,
    }: {
      id: string;
      input: Partial<HostelDamageTypeInput>;
      userId: string;
    }) => HostelDamageTypeService.update(id, input, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: damageTypeKeys.all });
      toast.success('Damage type updated');
    },
    onError: (error: Error) => toast.error(`Failed to update damage type: ${error.message}`),
  });
}
