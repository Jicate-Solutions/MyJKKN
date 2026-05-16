'use client';

import { useQuery } from '@tanstack/react-query';
import { BosBoard } from '@/types/bos';
import { BosBoardService } from '@/lib/services/bos/bos-board-service';

/**
 * Fetch boards. Optionally scope to a specific MyJKKN institution UUID
 * (super-admin only — non-super-admins are auto-scoped by the server route).
 * Boards are stable reference data, cached for 5 minutes.
 */
export function useBosBoards(institutionsId?: string) {
  return useQuery<BosBoard[]>({
    queryKey: ['bos-boards', institutionsId ?? 'me'] as const,
    queryFn: () => BosBoardService.getBoards(institutionsId ? { institutionsId } : undefined),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Find a single board by ID from the cached boards list.
 */
export function useBosBoard(id: string | undefined) {
  const { data: boards } = useBosBoards();

  return {
    data: boards?.find((b) => b.id === id),
    isLoading: !boards,
  };
}
