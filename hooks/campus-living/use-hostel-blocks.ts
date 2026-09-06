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
    // isSuperAdmin must be in the key, not just used inside queryFn: it
    // decides whether the institution filter is applied at all. Without it
    // here, a query that first ran before permissions finished loading (a
    // brief isSuperAdmin=false) got cached with the narrower filter, and
    // React Query never refetched once isSuperAdmin resolved to true — since
    // the cache key never changed, blocks outside that one institution (e.g.
    // Girls Hostel B) silently stayed missing from every consumer forever.
    queryKey: hostelBlockKeys.list({ institutionId, isSuperAdmin, ...filters }),
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
    // hostel-rooms-v2 PR 2 (2026-05-26): grants the new block to college(s) via
    // the hostel_block_institutions junction. Pass `institutionIds` (ordered —
    // the FIRST becomes the primary college, the rest secondary). The legacy
    // `primaryInstitutionId` is still honored as a fallback when institutionIds
    // is absent. Call: `mutateAsync({ ...payload, institutionIds: [...] })`.
    mutationFn: (
      vars: CreateHostelBlockDTO & {
        institutionIds?: string[];
        primaryInstitutionId?: string;
        amenityTagIds?: string[];
      },
    ) => {
      const { institutionIds, primaryInstitutionId, amenityTagIds, ...payload } = vars;
      const primary = institutionIds?.[0] ?? primaryInstitutionId;
      const secondary = institutionIds?.slice(1);
      return HostelBlockService.createBlock(payload, primary, amenityTagIds, secondary);
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
