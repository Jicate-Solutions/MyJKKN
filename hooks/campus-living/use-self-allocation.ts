'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SelfAllocationService } from '@/lib/services/campus-living/self-allocation-service';

const KEY = ['campus-living', 'self-allocation'] as const;

export function useMyManualCategories() {
  const query = useQuery({
    queryKey: [...KEY, 'categories'],
    queryFn: () => SelfAllocationService.getMyManualCategories(),
  });
  return { categories: query.data ?? [], loading: query.isLoading };
}

export function useMyRoomOptions(categoryId: string | null) {
  const query = useQuery({
    queryKey: [...KEY, 'rooms', categoryId],
    queryFn: () => SelfAllocationService.getMyRoomOptions(categoryId!),
    enabled: !!categoryId,
  });
  return { rooms: query.data ?? [], loading: query.isLoading };
}

export function usePendingRequests() {
  return useQuery({
    queryKey: [...KEY, 'pending'],
    queryFn: () => SelfAllocationService.getPendingRequests(),
  });
}

export function useSelfAllocationActions() {
  const qc = useQueryClient();
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: KEY }),
    [qc]
  );

  const requestRoom = useCallback(
    async (categoryId: string, roomId: string, bedId: string) => {
      const id = await SelfAllocationService.requestRoom(categoryId, roomId, bedId);
      await invalidate();
      return id;
    },
    [invalidate]
  );
  const approve = useCallback(
    async (id: string) => {
      await SelfAllocationService.approve(id);
      await invalidate();
    },
    [invalidate]
  );
  const reject = useCallback(
    async (id: string) => {
      await SelfAllocationService.reject(id);
      await invalidate();
    },
    [invalidate]
  );

  return { requestRoom, approve, reject };
}
