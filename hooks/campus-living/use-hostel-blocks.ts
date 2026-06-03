'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelBlockService } from '@/lib/services/campus-living/hostel-block-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  HostelBlock,
  CreateHostelBlockDTO,
  UpdateHostelBlockDTO,
  BlockFilters,
} from '@/types/campus-living';

// Query key factory
export const hostelBlockKeys = {
  all: ['hostel-blocks'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-blocks', 'list', filters] as const,
  detail: (id: string) => ['hostel-blocks', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelBlocks(institutionId: string | undefined, filters?: BlockFilters) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelBlockKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelBlockService.getBlocks(isSuperAdmin ? undefined : institutionId, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useHostelBlock(id: string) {
  return useQuery({
    queryKey: hostelBlockKeys.detail(id),
    queryFn: () => HostelBlockService.getBlock(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    // hostel-rooms-v2 PR 2 (2026-05-26): accepts optional primaryInstitutionId
    // so the service can auto-grant the new block to a college via the
    // hostel_block_institutions junction. Callers can pass via the variables
    // object: `mutateAsync({ ...payload, primaryInstitutionId: '...' })`.
    mutationFn: (
      vars: CreateHostelBlockDTO & {
        primaryInstitutionId?: string;
        amenityTagIds?: string[];
      },
    ) => {
      const { primaryInstitutionId, amenityTagIds, ...payload } = vars;
      return HostelBlockService.createBlock(payload, primaryInstitutionId, amenityTagIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.all });
      toast.success('Hostel block created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create block: ${error.message}`);
    },
  });
}

export function useUpdateHostelBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
      amenityTagIds,
    }: {
      id: string;
      payload: UpdateHostelBlockDTO;
      amenityTagIds?: string[];
    }) => HostelBlockService.updateBlock(id, payload, amenityTagIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.detail(variables.id) });
      toast.success('Block updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update block: ${error.message}`);
    },
  });
}

export function useDeleteHostelBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelBlockService.deleteBlock(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.all });
      toast.success('Block deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete block: ${error.message}`);
    },
  });
}

// --- Block ↔ institution junction (which colleges share this block) ---
// Single institution-access surface (replaces the retired per-room
// room_institution_access "Manage Access" dialog). All three mutations share
// the same query cache key so the colleges list refreshes in place.
const blockInstitutionsKey = (blockId: string) =>
  [...hostelBlockKeys.detail(blockId), 'institutions'] as const;

export function useBlockInstitutions(blockId: string) {
  return useQuery({
    queryKey: blockInstitutionsKey(blockId),
    queryFn: () => HostelBlockService.getBlockInstitutions(blockId),
    enabled: !!blockId,
  });
}

export function useAddBlockInstitution(blockId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (institutionId: string) =>
      HostelBlockService.addBlockInstitution(blockId, institutionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockInstitutionsKey(blockId) });
      toast.success('College added to block');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add college: ${error.message}`);
    },
  });
}

export function useRemoveBlockInstitution(blockId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (institutionId: string) =>
      HostelBlockService.removeBlockInstitution(blockId, institutionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockInstitutionsKey(blockId) });
      toast.success('College removed from block');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove college: ${error.message}`);
    },
  });
}

export function useSetPrimaryBlockInstitution(blockId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (institutionId: string) =>
      HostelBlockService.setPrimaryBlockInstitution(blockId, institutionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockInstitutionsKey(blockId) });
      toast.success('Primary college updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to set primary college: ${error.message}`);
    },
  });
}
