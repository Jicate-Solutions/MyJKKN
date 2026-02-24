'use client';

/**
 * Solutions Hub - Publications Hooks
 * Purpose: React Query hooks for publications and accreditation metrics
 * Connected to: /api/solutions/publications/* routes
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type {
  PublicationFilters,
  CreatePublicationInput,
  UpdatePublicationInput,
  AddContributorInput,
  PublicationStats,
  NIRFMetrics,
  NAACCriteria,
  PublicationWithSolution,
} from '@/lib/services/solutions/publications-service';
import type {
  Publication,
  PublicationContributor,
  AccreditationMetric,
  PaperType,
  JournalType,
  PublicationStatus,
} from '@/lib/services/solutions/types';

// ============================================
// RE-EXPORT TYPES FOR CONVENIENCE
// ============================================

export type {
  PublicationFilters,
  CreatePublicationInput,
  UpdatePublicationInput,
  AddContributorInput,
  PublicationStats,
  NIRFMetrics,
  NAACCriteria,
  PublicationWithSolution,
  Publication,
  PublicationContributor,
  AccreditationMetric,
  PaperType,
  JournalType,
  PublicationStatus,
};

export type CreditType = 'coauthor' | 'acknowledgment';

export interface AccreditationMetricFilters {
  [key: string]: unknown;
  metric_type?: 'nirf' | 'naac';
  is_active?: boolean;
}

// ============================================
// QUERY HOOKS - PUBLICATIONS
// ============================================

/**
 * Fetch all publications with optional filters
 */
export function usePublications(filters?: PublicationFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.publications.list(filters),
    queryFn: () => apiClient.get<PublicationWithSolution[]>('/api/solutions/publications', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single publication by ID
 */
export function usePublication(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.publications.detail(id),
    queryFn: () => apiClient.get<Publication>(`/api/solutions/publications/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch publications for a specific solution
 */
export function usePublicationsBySolution(solutionId: string) {
  return useQuery({
    queryKey: [...solutionsHubKeys.publications.all, 'solution', solutionId],
    queryFn: () => apiClient.get<PublicationWithSolution[]>('/api/solutions/publications', { params: { solution_id: solutionId } }),
    enabled: !!solutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch publication statistics
 */
export function usePublicationStats() {
  return useQuery({
    queryKey: solutionsHubKeys.publications.stats(),
    queryFn: () => apiClient.get<PublicationStats>('/api/solutions/publications', { params: { stats: 'true' } }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch contributors for a publication
 */
export function useContributors(publicationId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.publications.contributors(publicationId),
    queryFn: () => apiClient.get<PublicationContributor[]>(`/api/solutions/publications/${publicationId}/contributors`),
    enabled: !!publicationId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS - PUBLICATIONS
// ============================================

/**
 * Create a new publication
 */
export function useCreatePublication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePublicationInput) =>
      apiClient.post<Publication>('/api/solutions/publications', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.publications.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.accreditation.all });
    },
  });
}

/**
 * Update an existing publication
 */
export function useUpdatePublication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePublicationInput }) =>
      apiClient.patch<Publication>(`/api/solutions/publications/${id}`, input),
    onSuccess: (data: Publication) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.publications.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.accreditation.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.publications.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a publication
 */
export function useDeletePublication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/publications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.publications.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.accreditation.all });
    },
  });
}

// ============================================
// MUTATION HOOKS - CONTRIBUTORS
// ============================================

/**
 * Add a contributor to a publication
 */
export function useAddContributor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddContributorInput) =>
      apiClient.post<PublicationContributor>(`/api/solutions/publications/${input.publication_id}/contributors`, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.publications.contributors(variables.publication_id),
      });
    },
  });
}

/**
 * Remove a contributor from a publication
 */
export function useRemoveContributor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contributorId, publicationId }: { contributorId: string; publicationId: string }) =>
      apiClient.delete(`/api/solutions/publications/${publicationId}/contributors?contributor_id=${contributorId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.publications.all });
    },
  });
}

// ============================================
// QUERY HOOKS - ACCREDITATION
// ============================================

/**
 * Fetch accreditation metrics
 */
export function useAccreditationMetrics(filters?: AccreditationMetricFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.accreditation.metrics(filters),
    queryFn: () => apiClient.get<AccreditationMetric[]>('/api/solutions/publications/accreditation', { params: { type: filters?.metric_type } }),
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

/**
 * Calculate NIRF metrics
 */
export function useNIRFMetrics() {
  return useQuery({
    queryKey: [...solutionsHubKeys.accreditation.all, 'nirf-calculated'],
    queryFn: () => apiClient.get<NIRFMetrics>('/api/solutions/publications/accreditation/nirf'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Calculate NAAC criteria
 */
export function useNAACCriteria() {
  return useQuery({
    queryKey: [...solutionsHubKeys.accreditation.all, 'naac-calculated'],
    queryFn: () => apiClient.get<NAACCriteria>('/api/solutions/publications/accreditation/naac'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// PAPER TYPE & JOURNAL TYPE LABELS
// ============================================

export const PAPER_TYPE_LABELS: Record<PaperType, string> = {
  journal: 'Journal',
  conference: 'Conference',
  patent: 'Patent',
  book_chapter: 'Book Chapter',
  case_study: 'Case Study',
};

export const PAPER_TYPE_CONFIG: Record<PaperType, { label: string; color: string }> = {
  journal: { label: 'Journal', color: 'bg-blue-100 text-blue-800' },
  conference: { label: 'Conference', color: 'bg-green-100 text-green-800' },
  patent: { label: 'Patent', color: 'bg-purple-100 text-purple-800' },
  book_chapter: { label: 'Book Chapter', color: 'bg-orange-100 text-orange-800' },
  case_study: { label: 'Case Study', color: 'bg-red-100 text-red-800' },
};

export const JOURNAL_TYPE_LABELS: Record<JournalType, string> = {
  scopus: 'Scopus',
  wos: 'Web of Science',
  ugc: 'UGC',
  other: 'Other',
};

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  accepted: 'Accepted',
  published: 'Published',
  rejected: 'Rejected',
};

export const PUBLICATION_STATUS_CONFIG: Record<
  PublicationStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'Draft', variant: 'outline' },
  submitted: { label: 'Submitted', variant: 'secondary' },
  under_review: { label: 'Under Review', variant: 'secondary' },
  accepted: { label: 'Accepted', variant: 'default' },
  published: { label: 'Published', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};
