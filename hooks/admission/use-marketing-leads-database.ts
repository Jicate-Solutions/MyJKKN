// hooks/admission/use-marketing-leads-database.ts
// React Query hooks for marketing leads database module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  MarketingLeadDatabaseFilters,
  MarketingLeadDatabaseListResponse,
  MarketingLeadDatabase,
  BulkLeadUploadResult,
  UploadBatch,
} from '@/types/admission';
import { MarketingLeadsDatabaseService } from '@/lib/services/admission/marketing-leads-database-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const marketingLeadsDbKeys = {
  all: ['marketing-leads-database'] as const,
  lists: () => [...marketingLeadsDbKeys.all, 'list'] as const,
  list: (filters: MarketingLeadDatabaseFilters) =>
    [...marketingLeadsDbKeys.lists(), filters] as const,
  details: () => [...marketingLeadsDbKeys.all, 'detail'] as const,
  detail: (id: string) => [...marketingLeadsDbKeys.details(), id] as const,
  districts: (institutionId: string) =>
    [...marketingLeadsDbKeys.all, 'districts', institutionId] as const,
  batches: (institutionId: string) =>
    [...marketingLeadsDbKeys.all, 'batches', institutionId] as const,
  count: (institutionId: string) =>
    [...marketingLeadsDbKeys.all, 'count', institutionId] as const,
  stats: (institutionId: string) =>
    [...marketingLeadsDbKeys.all, 'stats', institutionId] as const,
};

// ─── Query Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch paginated marketing leads with filters.
 */
export function useMarketingLeads(filters: MarketingLeadDatabaseFilters = {}) {
  return useQuery<MarketingLeadDatabaseListResponse, Error>({
    queryKey: marketingLeadsDbKeys.list(filters),
    queryFn: () => MarketingLeadsDatabaseService.getLeads(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single marketing lead by ID.
 */
export function useMarketingLead(id: string, enabled = true) {
  return useQuery<MarketingLeadDatabase | null, Error>({
    queryKey: marketingLeadsDbKeys.detail(id),
    queryFn: () => MarketingLeadsDatabaseService.getLeadById(id),
    enabled: !!id && enabled,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch distinct districts for filter dropdown.
 */
export function useMarketingLeadDistricts(institutionId: string) {
  return useQuery<string[], Error>({
    queryKey: marketingLeadsDbKeys.districts(institutionId),
    queryFn: () => MarketingLeadsDatabaseService.getDistinctDistricts(institutionId),
    enabled: !!institutionId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

/**
 * Fetch upload batch history.
 */
export function useMarketingLeadUploadBatches(institutionId: string) {
  return useQuery<UploadBatch[], Error>({
    queryKey: marketingLeadsDbKeys.batches(institutionId),
    queryFn: () => MarketingLeadsDatabaseService.getUploadBatches(institutionId),
    enabled: !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch total leads count.
 */
export function useMarketingLeadCount(institutionId: string) {
  return useQuery<number, Error>({
    queryKey: marketingLeadsDbKeys.count(institutionId),
    queryFn: () => MarketingLeadsDatabaseService.getTotalCount(institutionId),
    enabled: !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch dashboard statistics.
 */
export function useMarketingLeadStats(institutionId: string) {
  return useQuery({
    queryKey: marketingLeadsDbKeys.stats(institutionId),
    queryFn: () => MarketingLeadsDatabaseService.getStats(institutionId),
    enabled: !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────────────

/**
 * Bulk upload leads from parsed Excel data.
 */
export function useBulkUploadLeads() {
  const queryClient = useQueryClient();

  return useMutation<
    BulkLeadUploadResult,
    Error,
    {
      leads: Array<Record<string, string>>;
      batchId: string;
      institutionId: string;
      fileName: string;
      userId?: string;
    }
  >({
    mutationFn: ({ leads, batchId, institutionId, fileName, userId }) =>
      MarketingLeadsDatabaseService.bulkInsertLeads(
        leads,
        batchId,
        institutionId,
        fileName,
        userId
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: marketingLeadsDbKeys.all });
    },
  });
}

/**
 * Delete an entire upload batch.
 */
export function useDeleteUploadBatch() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (batchId) =>
      MarketingLeadsDatabaseService.deleteUploadBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: marketingLeadsDbKeys.all });
    },
  });
}
