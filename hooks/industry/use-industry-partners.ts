// ============================================================================
// React Query hooks for Industry Partners
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type {
  IndustryPartner,
  IndustryListResponse,
  IndustryPartnerFilters,
  CreateIndustryPartnerDTO,
  UpdateIndustryPartnerDTO,
  PartnerPickerOption,
  PartnerSummary
} from '@/types/industry';
import { IndustryPartnerService } from '@/lib/services/industry';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory
export const partnerKeys = {
  all: ['industry-partners'] as const,
  lists: () => [...partnerKeys.all, 'list'] as const,
  list: (filters: IndustryPartnerFilters) => [...partnerKeys.lists(), filters] as const,
  details: () => [...partnerKeys.all, 'detail'] as const,
  detail: (id: string) => [...partnerKeys.details(), id] as const,
  options: (institutionId: string) => [...partnerKeys.all, 'options', institutionId] as const,
  summaries: (institutionId: string) => [...partnerKeys.all, 'summaries', institutionId] as const
};

/**
 * Get partners with filters and pagination
 */
export function useIndustryPartners(
  filters: IndustryPartnerFilters = {}
): UseQueryResult<IndustryListResponse<IndustryPartner>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters: IndustryPartnerFilters = {
      institution_id: filters.institution_id,
      partnership_type: filters.partnership_type,
      industry_sector: filters.industry_sector,
      is_active: filters.is_active,
      search: filters.search,
      page: filters.page || 1,
      limit: filters.limit || 10,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order
    };
    return partnerKeys.list(stableFilters);
  }, [
    filters.institution_id,
    filters.partnership_type,
    filters.industry_sector,
    filters.is_active,
    filters.search,
    filters.page,
    filters.limit,
    filters.sort_by,
    filters.sort_order
  ]);

  const queryFn = useCallback(async () => {
    try {
      return await IndustryPartnerService.getPartners(filters);
    } catch (error) {
      console.error('[useIndustryPartners] Fetch error:', error);
      throw new Error('Failed to fetch industry partners');
    }
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && !!filters.institution_id,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single partner by ID
 */
export function useIndustryPartner(id: string): UseQueryResult<IndustryPartner, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: partnerKeys.detail(id),
    queryFn: () => IndustryPartnerService.getPartnerById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get partner options for picker (simplified list)
 */
export function usePartnerOptions(
  institutionId: string
): UseQueryResult<PartnerPickerOption[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: partnerKeys.options(institutionId),
    queryFn: () => IndustryPartnerService.getPartnerOptions(institutionId),
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.FORM_DATA
  });
}

/**
 * Get partner summaries for dashboard
 */
export function usePartnerSummaries(
  institutionId: string
): UseQueryResult<PartnerSummary[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: partnerKeys.summaries(institutionId),
    queryFn: () => IndustryPartnerService.getPartnerSummaries(institutionId),
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Create partner mutation
 */
export function useCreatePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateIndustryPartnerDTO) =>
      IndustryPartnerService.createPartner(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: partnerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: partnerKeys.options(data.institution_id) });
      queryClient.invalidateQueries({ queryKey: partnerKeys.summaries(data.institution_id) });
    }
  });
}

/**
 * Update partner mutation
 */
export function useUpdatePartner(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateIndustryPartnerDTO) =>
      IndustryPartnerService.updatePartner(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: partnerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: partnerKeys.lists() });
      queryClient.setQueryData(partnerKeys.detail(id), data);
    }
  });
}

/**
 * Archive partner mutation
 */
export function useArchivePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => IndustryPartnerService.archivePartner(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partnerKeys.lists() });
    }
  });
}

/**
 * Restore archived partner mutation
 */
export function useRestorePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => IndustryPartnerService.restorePartner(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partnerKeys.lists() });
    }
  });
}
