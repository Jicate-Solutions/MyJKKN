'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RoomEligibilityService } from '@/lib/services/campus-living/room-eligibility-service';
import type {
  CreateRoomEligibilityRuleDto,
  UpdateRoomEligibilityRuleDto,
} from '@/types/room-eligibility';

// Shared cache so the table refreshes after create/edit/delete from the dialog.
const KEY = ['campus-living', 'room-eligibility'] as const;

export function useRoomEligibilityRules(institutionId: string | null) {
  const qc = useQueryClient();
  // institutionId === null => list rules across ALL institutions (page-level view).
  const query = useQuery({
    queryKey: [...KEY, 'rules', institutionId ?? 'all'],
    queryFn: () => RoomEligibilityService.getRules(institutionId ?? undefined),
  });

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: KEY }),
    [qc]
  );

  const createRule = useCallback(
    async (dto: CreateRoomEligibilityRuleDto) => {
      const r = await RoomEligibilityService.createRule(dto);
      await invalidate();
      return r;
    },
    [invalidate]
  );

  const updateRule = useCallback(
    async (id: string, dto: UpdateRoomEligibilityRuleDto) => {
      const r = await RoomEligibilityService.updateRule(id, dto);
      await invalidate();
      return r;
    },
    [invalidate]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await RoomEligibilityService.deleteRule(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    createRule,
    updateRule,
    deleteRule,
  };
}

// ── Cascade option hooks (each enabled on its parent) ──
export function useEligibilityDegrees(institutionId: string | null) {
  const query = useQuery({
    queryKey: [...KEY, 'degrees', institutionId],
    queryFn: () => RoomEligibilityService.getDegrees(institutionId!),
    enabled: !!institutionId,
  });
  return { options: query.data ?? [], loading: query.isLoading };
}

export function useEligibilityDepartments(degreeId: string | null) {
  const query = useQuery({
    queryKey: [...KEY, 'departments', degreeId],
    queryFn: () => RoomEligibilityService.getDepartments(degreeId!),
    enabled: !!degreeId,
  });
  return { options: query.data ?? [], loading: query.isLoading };
}

export function useEligibilityPrograms(departmentId: string | null) {
  const query = useQuery({
    queryKey: [...KEY, 'programs', departmentId],
    queryFn: () => RoomEligibilityService.getPrograms(departmentId!),
    enabled: !!departmentId,
  });
  return { options: query.data ?? [], loading: query.isLoading };
}

export function useEligibilitySemesters(programId: string | null) {
  const query = useQuery({
    queryKey: [...KEY, 'semesters', programId],
    queryFn: () => RoomEligibilityService.getSemesters(programId!),
    enabled: !!programId,
  });
  return { options: query.data ?? [], loading: query.isLoading };
}

// Block-first flow: blocks are global physical targets, so the list no longer
// depends on a chosen institution — enable it as soon as the dialog opens.
export function useEligibilityBlocks(enabled: boolean) {
  const query = useQuery({
    queryKey: [...KEY, 'blocks'],
    queryFn: () => RoomEligibilityService.getBlocks(),
    enabled,
  });
  return { options: query.data ?? [], loading: query.isLoading };
}

export function useEligibilityRooms(blockId: string | null) {
  const query = useQuery({
    queryKey: [...KEY, 'rooms', blockId],
    queryFn: () => RoomEligibilityService.getRoomsForBlock(blockId!),
    enabled: !!blockId,
  });
  return { rooms: query.data ?? [], loading: query.isLoading };
}

// Auto-allocation is rule-driven: the Auto-Allocate page uses this to guard a
// block with no active physical-room rule (show "set rules first" + disable).
export function useBlockHasEligibilityRules(blockId: string | null) {
  const query = useQuery({
    queryKey: [...KEY, 'block-has-rules', blockId],
    queryFn: () => RoomEligibilityService.hasRulesForBlock(blockId!),
    enabled: !!blockId,
  });
  return { hasRules: query.data ?? false, loading: query.isLoading };
}
