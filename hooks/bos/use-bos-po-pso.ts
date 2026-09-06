'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import type { BosBoardPso, BosMasterPo, BosMasterPso } from '@/types/bos';

// ─────────────────────────────────────────────────────────────────────────────
// Institution + regulation master PO/PSO with per-board PSO overrides
// (/bos/po-pso). Backed by /api/bos/po-pso/master and
// /api/bos/po-pso/board-psos. Every set is scoped to one regulation
// (R-2024, R-2026, …).
// ─────────────────────────────────────────────────────────────────────────────

export interface OutcomeInput {
  code: string;
  description: string;
}

export interface BosPoPsoMaster {
  pos: BosMasterPo[];
  psos: BosMasterPso[];
  can_edit: boolean;
}

export const bosPoPsoKeys = {
  all: ['bos', 'po-pso'] as const,
  master: (institutionsId: string | null, regulationId: string | null) =>
    ['bos', 'po-pso', 'master', institutionsId ?? 'none', regulationId ?? 'none'] as const,
  boardPsos: (institutionsId: string | null, regulationId: string | null) =>
    ['bos', 'po-pso', 'board-psos', institutionsId ?? 'none', regulationId ?? 'none'] as const,
};

export function useBosPoPsoMaster(
  institutionsId: string | null,
  regulationId: string | null
) {
  return useQuery<BosPoPsoMaster>({
    queryKey: bosPoPsoKeys.master(institutionsId, regulationId),
    enabled: !!institutionsId && !!regulationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `/api/bos/po-pso/master?institutionsId=${institutionsId}&regulationId=${regulationId}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load master PO/PSO');
      }
      const json = await res.json();
      return json.data as BosPoPsoMaster;
    },
  });
}

export function useBosBoardPsos(
  institutionsId: string | null,
  regulationId: string | null
) {
  return useQuery<BosBoardPso[]>({
    queryKey: bosPoPsoKeys.boardPsos(institutionsId, regulationId),
    enabled: !!institutionsId && !!regulationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `/api/bos/po-pso/board-psos?institutionsId=${institutionsId}&regulationId=${regulationId}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load board PSOs');
      }
      const json = await res.json();
      return (json.data ?? []) as BosBoardPso[];
    },
  });
}

/** Batch-replace the master PO and/or PSO set for an institution + regulation. */
export function useSaveMasterOutcomes(
  institutionsId: string | null,
  regulationId: string | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pos?: OutcomeInput[]; psos?: OutcomeInput[] }) => {
      const res = await fetch('/api/bos/po-pso/master', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutions_id: institutionsId,
          regulation_id: regulationId,
          ...(input.pos !== undefined && {
            pos: input.pos.map((r) => ({ po_code: r.code, description: r.description })),
          }),
          ...(input.psos !== undefined && {
            psos: input.psos.map((r) => ({ pso_code: r.code, description: r.description })),
          }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to save');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: bosPoPsoKeys.master(institutionsId, regulationId),
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    },
  });
}

/** Batch-replace one board's PSO override. Empty psos = remove override. */
export function useSaveBoardPsos(
  institutionsId: string | null,
  regulationId: string | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      board_id: string;
      board_code?: string;
      board_name?: string;
      psos: OutcomeInput[];
    }) => {
      const res = await fetch('/api/bos/po-pso/board-psos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutions_id: institutionsId,
          regulation_id: regulationId,
          board_id: input.board_id,
          board_code: input.board_code,
          board_name: input.board_name,
          psos: input.psos.map((r) => ({ pso_code: r.code, description: r.description })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to save board PSOs');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: bosPoPsoKeys.boardPsos(institutionsId, regulationId),
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save board PSOs');
    },
  });
}

/** Remove a board's override so it inherits the master PSO set again. */
export function useResetBoardPsos(
  institutionsId: string | null,
  regulationId: string | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (boardId: string) => {
      const res = await fetch(
        `/api/bos/po-pso/board-psos?institutionsId=${institutionsId}&regulationId=${regulationId}&boardId=${boardId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to reset board PSOs');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: bosPoPsoKeys.boardPsos(institutionsId, regulationId),
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to reset board PSOs');
    },
  });
}
