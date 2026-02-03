'use client';

/**
 * Solutions Hub - Publications Hooks
 * Purpose: React Query hooks for publications and accreditation metrics
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-publications.ts & use-accreditation.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================
// TYPES
// ============================================

export type PaperType =
  | 'journal'
  | 'conference'
  | 'patent'
  | 'book_chapter'
  | 'case_study';

export type JournalType = 'scopus' | 'wos' | 'ugc' | 'other';

export type PublicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'published'
  | 'rejected';

export type CreditType = 'coauthor' | 'acknowledgment';

export interface PublicationFilters {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  paper_type?: PaperType;
  journal_type?: JournalType;
  status?: PublicationStatus;
  solution_id?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreatePublicationInput {
  solution_id?: string;
  phase_id?: string;
  paper_type: PaperType;
  title: string;
  authors: string[];
  abstract?: string;
  journal_name?: string;
  journal_type?: JournalType;
  nirf_category?: string;
  naac_criterion?: string;
}

export interface UpdatePublicationInput {
  title?: string;
  authors?: string[];
  abstract?: string;
  journal_name?: string;
  journal_type?: JournalType;
  status?: PublicationStatus;
  submission_date?: string;
  acceptance_date?: string;
  publication_date?: string;
  doi?: string;
  nirf_category?: string;
  naac_criterion?: string;
}

export interface AddContributorInput {
  publication_id: string;
  builder_id?: string;
  cohort_member_id?: string;
  learner_id?: string;
  credit_type?: CreditType;
  contribution_description?: string;
}

export interface AccreditationMetricFilters {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  metric_type?: 'nirf' | 'naac';
  is_active?: boolean;
}

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PublicationsService = any;

const publicationsService: PublicationsService = {
  getPublications: async (_filters?: PublicationFilters) => {
    throw new Error('publicationsService.getPublications not implemented');
  },
  getPublicationById: async (_id: string) => {
    throw new Error('publicationsService.getPublicationById not implemented');
  },
  createPublication: async (_input: CreatePublicationInput) => {
    throw new Error('publicationsService.createPublication not implemented');
  },
  updatePublication: async (_id: string, _input: UpdatePublicationInput) => {
    throw new Error('publicationsService.updatePublication not implemented');
  },
  deletePublication: async (_id: string) => {
    throw new Error('publicationsService.deletePublication not implemented');
  },
  getContributors: async (_publicationId: string) => {
    throw new Error('publicationsService.getContributors not implemented');
  },
  addContributor: async (_input: AddContributorInput) => {
    throw new Error('publicationsService.addContributor not implemented');
  },
  removeContributor: async (_id: string) => {
    throw new Error('publicationsService.removeContributor not implemented');
  },
  getPublicationStats: async () => {
    throw new Error('publicationsService.getPublicationStats not implemented');
  },
  getAccreditationMetrics: async (_filters?: AccreditationMetricFilters) => {
    throw new Error('publicationsService.getAccreditationMetrics not implemented');
  },
};

// ============================================
// QUERY HOOKS - PUBLICATIONS
// ============================================

/**
 * Fetch all publications with optional filters
 */
export function usePublications(filters?: PublicationFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.publications.list(filters),
    queryFn: () => publicationsService.getPublications(filters),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single publication by ID
 */
export function usePublication(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.publications.detail(id),
    queryFn: () => publicationsService.getPublicationById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch publication statistics
 */
export function usePublicationStats() {
  return useQuery({
    queryKey: solutionsHubKeys.publications.stats(),
    queryFn: () => publicationsService.getPublicationStats(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch contributors for a publication
 */
export function useContributors(publicationId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.publications.contributors(publicationId),
    queryFn: () => publicationsService.getContributors(publicationId),
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
      publicationsService.createPublication(input),
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
      publicationsService.updatePublication(id, input),
    onSuccess: (data: any) => {
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
    mutationFn: (id: string) => publicationsService.deletePublication(id),
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
      publicationsService.addContributor(input),
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
    mutationFn: (id: string) => publicationsService.removeContributor(id),
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
    queryFn: () => publicationsService.getAccreditationMetrics(filters),
    ...QUERY_CONFIG.STABLE_DATA,
  });
}
