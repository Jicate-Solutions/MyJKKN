// ============================================================================
// React Query hooks for Industry Mentors
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type {
  IndustryMentor,
  IndustryListResponse,
  IndustryMentorFilters,
  CreateIndustryMentorDTO,
  UpdateIndustryMentorDTO,
  MentorPickerOption
} from '@/types/industry';
import { IndustryMentorService } from '@/lib/services/industry';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory
export const mentorKeys = {
  all: ['industry-mentors'] as const,
  lists: () => [...mentorKeys.all, 'list'] as const,
  list: (filters: IndustryMentorFilters) => [...mentorKeys.lists(), filters] as const,
  details: () => [...mentorKeys.all, 'detail'] as const,
  detail: (id: string) => [...mentorKeys.details(), id] as const,
  byPartner: (partnerId: string) => [...mentorKeys.all, 'by-partner', partnerId] as const,
  options: (partnerId?: string) => [...mentorKeys.all, 'options', partnerId || 'all'] as const
};

/**
 * Get mentors with filters and pagination
 */
export function useIndustryMentors(
  filters: IndustryMentorFilters = {}
): UseQueryResult<IndustryListResponse<IndustryMentor>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters: IndustryMentorFilters = {
      partner_id: filters.partner_id,
      expertise_area: filters.expertise_area,
      is_active: filters.is_active,
      has_availability: filters.has_availability,
      search: filters.search,
      page: filters.page || 1,
      limit: filters.limit || 10
    };
    return mentorKeys.list(stableFilters);
  }, [
    filters.partner_id,
    filters.expertise_area,
    filters.is_active,
    filters.has_availability,
    filters.search,
    filters.page,
    filters.limit
  ]);

  const queryFn = useCallback(async () => {
    try {
      return await IndustryMentorService.getMentors(filters);
    } catch (error) {
      console.error('[useIndustryMentors] Fetch error:', error);
      throw new Error('Failed to fetch industry mentors');
    }
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single mentor by ID
 */
export function useIndustryMentor(id: string): UseQueryResult<IndustryMentor, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: mentorKeys.detail(id),
    queryFn: () => IndustryMentorService.getMentorById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get mentors by partner ID
 */
export function useMentorsByPartner(
  partnerId: string
): UseQueryResult<IndustryMentor[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: mentorKeys.byPartner(partnerId),
    queryFn: () => IndustryMentorService.getMentorsByPartnerId(partnerId),
    enabled: !authLoading && !!profile && !!partnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get mentor options for picker
 */
export function useMentorOptions(
  partnerId?: string
): UseQueryResult<MentorPickerOption[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: mentorKeys.options(partnerId),
    queryFn: () => IndustryMentorService.getMentorOptions(partnerId),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.FORM_DATA
  });
}

/**
 * Create mentor mutation
 */
export function useCreateMentor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateIndustryMentorDTO) =>
      IndustryMentorService.createMentor(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: mentorKeys.lists() });
      queryClient.invalidateQueries({ queryKey: mentorKeys.byPartner(data.partner_id) });
      queryClient.invalidateQueries({ queryKey: mentorKeys.options() });
    }
  });
}

/**
 * Update mentor mutation
 */
export function useUpdateMentor(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateIndustryMentorDTO) =>
      IndustryMentorService.updateMentor(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: mentorKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: mentorKeys.lists() });
      queryClient.setQueryData(mentorKeys.detail(id), data);
    }
  });
}

/**
 * Archive mentor mutation
 */
export function useArchiveMentor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => IndustryMentorService.archiveMentor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mentorKeys.lists() });
      queryClient.invalidateQueries({ queryKey: mentorKeys.options() });
    }
  });
}

/**
 * Restore archived mentor mutation
 */
export function useRestoreMentor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => IndustryMentorService.restoreMentor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mentorKeys.lists() });
      queryClient.invalidateQueries({ queryKey: mentorKeys.options() });
    }
  });
}
