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
  const query = useQuery({
    queryKey: [...KEY, 'rules', institutionId],
    queryFn: () => RoomEligibilityService.getRules(institutionId!),
    enabled: !!institutionId,
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

export function useEligibilityBlocks(institutionId: string | null) {
  const query = useQuery({
    queryKey: [...KEY, 'blocks', institutionId],
    queryFn: () => RoomEligibilityService.getBlocks(institutionId!),
    enabled: !!institutionId,
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
