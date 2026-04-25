import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BosMeeting,
  BosMeetingStatus,
  BosMeetingFilters,
  BosListResponse,
  CreateBosMeetingDto,
  UpdateBosMeetingDto,
} from '@/types/bos';
import { BosMeetingService } from '@/lib/services/bos/bos-meeting-service';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ── Query Key Factory ─────────────────────────────────────────────────────────

export const bosMeetingKeys = {
  all: ['bos-meetings'] as const,
  lists: () => [...bosMeetingKeys.all, 'list'] as const,
  list: (filters: BosMeetingFilters) => [...bosMeetingKeys.lists(), filters] as const,
  details: () => [...bosMeetingKeys.all, 'detail'] as const,
  detail: (id: string) => [...bosMeetingKeys.details(), id] as const,
};

// ── List ──────────────────────────────────────────────────────────────────────

export function useBosMeetings(filters: BosMeetingFilters = {}) {
  const { profile } = useAuth();

  const scopedFilters: BosMeetingFilters = {
    ...filters,
    institutionsId: profile?.institution_id ?? filters.institutionsId,
  };

  return useQuery<BosListResponse<BosMeeting>, Error>({
    queryKey: bosMeetingKeys.list(scopedFilters),
    queryFn: () => BosMeetingService.getMeetings(scopedFilters),
    enabled: !!profile?.institution_id,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ── Single ────────────────────────────────────────────────────────────────────

export function useBosMeeting(id: string | undefined) {
  return useQuery<BosMeeting, Error>({
    queryKey: bosMeetingKeys.detail(id ?? ''),
    queryFn: () => BosMeetingService.getMeeting(id!),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateBosMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBosMeetingDto) => BosMeetingService.createMeeting(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bosMeetingKeys.lists() });
    },
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateBosMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosMeetingDto }) =>
      BosMeetingService.updateMeeting(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(bosMeetingKeys.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: bosMeetingKeys.lists() });
    },
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteBosMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BosMeetingService.deleteMeeting(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: bosMeetingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: bosMeetingKeys.lists() });
    },
  });
}

// ── Status Transition ─────────────────────────────────────────────────────────

export function useTransitionBosMeetingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      newStatus,
      metadata,
    }: {
      id: string;
      newStatus: BosMeetingStatus;
      metadata?: Record<string, unknown>;
    }) => BosMeetingService.transitionStatus(id, newStatus, metadata),
    onSuccess: (updated) => {
      // Immediately update the detail cache so the stepper reflects new state
      queryClient.setQueryData(bosMeetingKeys.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: bosMeetingKeys.lists() });
    },
  });
}
