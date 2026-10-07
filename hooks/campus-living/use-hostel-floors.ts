'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  HostelFloorService,
  type CreateFloorInput,
  type UpdateFloorInput,
} from '@/lib/services/campus-living/hostel-floor-service';
import { hostelBlockKeys } from '@/hooks/campus-living/use-hostel-blocks';

// Under the hostel-blocks prefix on purpose: hostel_floors.total_floors feeds
// the block list + detail, so one invalidateQueries(hostelBlockKeys.all) after a
// floor mutation refreshes the floors tab, the room pickers and the block list.
export const hostelFloorKeys = {
  byBlock: (blockId: string) => [...hostelBlockKeys.all, 'floors', blockId] as const,
};

export function useBlockFloors(blockId: string) {
  return useQuery({
    queryKey: hostelFloorKeys.byBlock(blockId),
    queryFn: () => HostelFloorService.listFloors(blockId),
    enabled: !!blockId,
  });
}

export function useCreateFloor(blockId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateFloorInput, 'block_id'>) =>
      HostelFloorService.createFloor({ ...input, block_id: blockId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.all });
      toast.success('Floor added');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateFloor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateFloorInput) =>
      HostelFloorService.updateFloor(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.all });
      toast.success('Floor updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteFloor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelFloorService.deleteFloor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.all });
      toast.success('Floor deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
