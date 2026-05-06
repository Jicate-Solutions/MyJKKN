'use client';

import { useQuery } from '@tanstack/react-query';
import { BosBoard } from '@/types/bos';
import { BosBoardService } from '@/lib/services/bos/bos-board-service';

/**
 * Fetch all boards for the authenticated user's institution.
 * Boards are stable reference data, cached for 5 minutes.
 */
export function useBosBoards() {
  return useQuery({
    queryKey: ['bos-boards'],
    queryFn: () => BosBoardService.getBoards(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Find a single board by ID from the cached boards list.
 */
export function useBosBoard(id: string | undefined) {
  const { data: boards } = useBosBoards();

  return {
    data: boards?.find(b => b.id === id),
    isLoading: !boards,
  };
}
