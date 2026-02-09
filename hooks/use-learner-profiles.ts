import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import type {
  LearnerProfile,
  CreateLearnerProfileDto,
  UpdateLearnerProfileDto,
  LearnerProfileFilters,
  LearnerProfileListResponse,
  StatusTransitionDto,
  EnrollmentDto,
  LearnerDashboardStats,
  LearnerLifecycleFunnel,
  LifecycleStatus,
} from '@/types/learner-profile';
import type { IncompleteProfilesResponse, LearnerDashboardFilters } from '@/types/learner-dashboard';

// ============================================
// REACT QUERY HOOKS - LEARNER PROFILES
// ============================================
// Created: 2025-01-18
// Purpose: React Query hooks for learner lifecycle management
// Replaces: useAdmissions + useStudents hooks
// ============================================

// Query keys
export const learnerProfileKeys = {
  all: ['learner-profiles'] as const,
  lists: () => [...learnerProfileKeys.all, 'list'] as const,
  list: (filters: LearnerProfileFilters) => [...learnerProfileKeys.lists(), filters] as const,
  details: () => [...learnerProfileKeys.all, 'detail'] as const,
  detail: (id: string) => [...learnerProfileKeys.details(), id] as const,
  byApplicationId: (appId: string) => [...learnerProfileKeys.all, 'application', appId] as const,
  analytics: () => [...learnerProfileKeys.all, 'analytics'] as const,
  funnel: (institutionId?: string) => [...learnerProfileKeys.analytics(), 'funnel', institutionId] as const,
  dashboard: (institutionId?: string) => [...learnerProfileKeys.analytics(), 'dashboard', institutionId] as const,
};

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Get single learner profile by ID
 */
export function useLearnerProfile(
  id: string,
  options?: Omit<UseQueryOptions<LearnerProfile | null, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<LearnerProfile | null, Error>({
    queryKey: learnerProfileKeys.detail(id),
    queryFn: () => LearnerProfileService.getLearnerProfile(id),
    enabled: !!id,
    ...options,
  });
}

/**
 * Get learner profile by application ID
 */
export function useLearnerProfileByApplicationId(
  applicationId: string,
  options?: Omit<UseQueryOptions<LearnerProfile | null, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<LearnerProfile | null, Error>({
    queryKey: learnerProfileKeys.byApplicationId(applicationId),
    queryFn: () => LearnerProfileService.getLearnerByApplicationId(applicationId),
    enabled: !!applicationId,
    ...options,
  });
}

/**
 * List learner profiles with filters
 */
export function useLearnerProfiles(
  filters: LearnerProfileFilters = {},
  options?: Omit<UseQueryOptions<LearnerProfileListResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<LearnerProfileListResponse, Error>({
    queryKey: learnerProfileKeys.list(filters),
    queryFn: () => LearnerProfileService.getLearnerProfiles(filters),
    ...options,
  });
}

/**
 * Get lifecycle funnel analytics
 */
export function useLifecycleFunnel(
  institutionId?: string,
  options?: Omit<UseQueryOptions<LearnerLifecycleFunnel, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<LearnerLifecycleFunnel, Error>({
    queryKey: learnerProfileKeys.funnel(institutionId),
    queryFn: () => LearnerProfileService.getLifecycleFunnel(institutionId),
    ...options,
  });
}

/**
 * Get dashboard statistics
 * Updated: 2025-01-20 - Now uses LearnerDashboardFilters
 */
export function useLearnerDashboard(
  filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
  options?: Omit<UseQueryOptions<import('@/types/learner-dashboard').LearnerDashboardStats, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<import('@/types/learner-dashboard').LearnerDashboardStats, Error>({
    queryKey: ['learners', 'dashboard', filters],
    queryFn: () => LearnerProfileService.getDashboardStats(filters),
    ...options,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create new learner profile
 */
export function useCreateLearnerProfile() {
  const queryClient = useQueryClient();

  return useMutation<LearnerProfile, Error, CreateLearnerProfileDto>({
    mutationFn: (dto) => LearnerProfileService.createLearnerProfile(dto),
    onSuccess: () => {
      // Invalidate all lists and analytics
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.analytics() });
    },
  });
}

/**
 * Update learner profile
 */
export function useUpdateLearnerProfile() {
  const queryClient = useQueryClient();

  return useMutation<LearnerProfile, Error, { id: string; dto: UpdateLearnerProfileDto }>({
    mutationFn: ({ id, dto }) => LearnerProfileService.updateLearnerProfile(id, dto),
    onSuccess: (data, variables) => {
      // Update specific profile cache
      queryClient.setQueryData(learnerProfileKeys.detail(variables.id), data);
      // Invalidate lists and analytics
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.analytics() });
    },
  });
}

/**
 * Delete learner profile
 */
export function useDeleteLearnerProfile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => LearnerProfileService.deleteLearnerProfile(id),
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: learnerProfileKeys.detail(id) });
      // Invalidate lists and analytics
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.analytics() });
    },
  });
}

/**
 * Update lifecycle status
 */
export function useUpdateLifecycleStatus() {
  const queryClient = useQueryClient();

  return useMutation<LearnerProfile, Error, { id: string; transition: StatusTransitionDto }>({
    mutationFn: ({ id, transition }) => LearnerProfileService.updateLifecycleStatus(id, transition),
    onSuccess: (data, variables) => {
      // Update cache
      queryClient.setQueryData(learnerProfileKeys.detail(variables.id), data);
      // Invalidate lists and analytics
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.analytics() });
    },
  });
}

/**
 * Enroll learner (approved → active)
 */
export function useEnrollLearner() {
  const queryClient = useQueryClient();

  return useMutation<LearnerProfile, Error, { id: string; enrollment: EnrollmentDto }>({
    mutationFn: ({ id, enrollment }) => LearnerProfileService.enrollLearner(id, enrollment),
    onSuccess: (data, variables) => {
      // Update cache
      queryClient.setQueryData(learnerProfileKeys.detail(variables.id), data);
      // Invalidate lists and analytics
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.analytics() });
    },
  });
}

/**
 * Graduate learner (active → graduated)
 */
export function useGraduateLearner() {
  const queryClient = useQueryClient();

  return useMutation<LearnerProfile, Error, string>({
    mutationFn: (id) => LearnerProfileService.graduateLearner(id),
    onSuccess: (data, id) => {
      // Update cache
      queryClient.setQueryData(learnerProfileKeys.detail(id), data);
      // Invalidate lists and analytics
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.analytics() });
    },
  });
}

/**
 * Bulk update learners
 */
export function useBulkUpdateLearners() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: string[]; failed: Array<{ id: string; error: string }> },
    Error,
    Array<{ id: string } & UpdateLearnerProfileDto>
  >({
    mutationFn: (updates) => LearnerProfileService.bulkUpdateLearners(updates),
    onSuccess: () => {
      // Invalidate all caches
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.all });
    },
  });
}

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Generate application ID
 */
export function useGenerateApplicationId() {
  return useMutation<string, Error, string>({
    mutationFn: (institutionId) => LearnerProfileService.generateApplicationId(institutionId),
  });
}

// ============================================
// FILTERED LIST HOOKS (Common Use Cases)
// ============================================

/**
 * Get enquiries (lifecycle_status = 'enquiry')
 */
export function useEnquiries(filters: Omit<LearnerProfileFilters, 'lifecycle_status'> = {}) {
  return useLearnerProfiles({
    ...filters,
    lifecycle_status: 'enquiry',
  });
}

/**
 * Get pending applications (lifecycle_status = 'pending')
 */
export function usePendingApplications(filters: Omit<LearnerProfileFilters, 'lifecycle_status'> = {}) {
  return useLearnerProfiles({
    ...filters,
    lifecycle_status: 'pending',
  });
}

/**
 * Get approved applications (lifecycle_status = 'approved')
 */
export function useApprovedApplications(filters: Omit<LearnerProfileFilters, 'lifecycle_status'> = {}) {
  return useLearnerProfiles({
    ...filters,
    lifecycle_status: 'approved',
  });
}

/**
 * Get active students (lifecycle_status = 'active')
 */
export function useActiveStudents(filters: Omit<LearnerProfileFilters, 'lifecycle_status'> = {}) {
  return useLearnerProfiles({
    ...filters,
    lifecycle_status: 'active',
  });
}

/**
 * Get graduates (lifecycle_status = 'graduated')
 */
export function useGraduates(filters: Omit<LearnerProfileFilters, 'lifecycle_status'> = {}) {
  return useLearnerProfiles({
    ...filters,
    lifecycle_status: 'graduated',
  });
}

/**
 * Get admission pipeline (enquiry, pending, approved, rejected, waitlisted)
 */
export function useAdmissionPipeline(filters: Omit<LearnerProfileFilters, 'lifecycle_status'> = {}) {
  return useLearnerProfiles({
    ...filters,
    lifecycle_status: ['enquiry', 'pending', 'approved', 'rejected', 'waitlisted'],
  });
}

/**
 * Get enrolled learners (active, inactive)
 */
export function useEnrolledLearners(filters: Omit<LearnerProfileFilters, 'lifecycle_status'> = {}) {
  return useLearnerProfiles({
    ...filters,
    lifecycle_status: ['active', 'inactive'],
  });
}

// ============================================
// PREFETCH UTILITIES
// ============================================

/**
 * Prefetch learner profile
 */
export function usePrefetchLearnerProfile() {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: learnerProfileKeys.detail(id),
      queryFn: () => LearnerProfileService.getLearnerProfile(id),
    });
  };
}

/**
 * Prefetch learner profiles list
 */
export function usePrefetchLearnerProfiles() {
  const queryClient = useQueryClient();

  return (filters: LearnerProfileFilters = {}) => {
    queryClient.prefetchQuery({
      queryKey: learnerProfileKeys.list(filters),
      queryFn: () => LearnerProfileService.getLearnerProfiles(filters),
    });
  };
}

// ============================================
// PROMOTION HOOKS
// ============================================

/**
 * Promote learners to new semester/section
 * Updated: 2025-01-20 - Added promotion feature
 */
export function usePromoteLearners() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: string[]; failed: { id: string; error: string }[] },
    Error,
    {
      learnerIds: string[];
      semesterId: string;
      sectionId: string;
      academicYearId?: string;
      onProgress?: (
        current: number,
        total: number,
        success: string[],
        failed: { id: string; error: string }[]
      ) => void;
    }
  >({
    mutationFn: ({ learnerIds, semesterId, sectionId, academicYearId, onProgress }) =>
      LearnerProfileService.bulkPromoteLearners(
        learnerIds,
        semesterId,
        sectionId,
        academicYearId,
        onProgress
      ),
    onSuccess: () => {
      // Invalidate all caches
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.all });
    },
  });
}

/**
 * Bulk update learner status
 * Updated: 2025-01-20 - Added status promotion feature
 */
export function useBulkUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: string[]; failed: { id: string; error: string }[] },
    Error,
    {
      learnerIds: string[];
      newStatus: LifecycleStatus;
      onProgress?: (
        current: number,
        total: number,
        success: string[],
        failed: { id: string; error: string }[]
      ) => void;
    }
  >({
    mutationFn: ({ learnerIds, newStatus, onProgress }) =>
      LearnerProfileService.bulkUpdateStatus(learnerIds, newStatus, onProgress),
    onSuccess: () => {
      // Invalidate all caches
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.all });
    },
  });
}

// ============================================
// INCOMPLETE PROFILES HOOK
// ============================================

/**
 * Fetch detailed incomplete profiles for drill-down table
 * Used by Profile Completion Tab to show WHO has incomplete profiles
 */
export function useIncompleteProfiles(
  filters: Pick<LearnerDashboardFilters, 'institutionIds'> & { limit?: number },
  options?: Omit<UseQueryOptions<IncompleteProfilesResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<IncompleteProfilesResponse, Error>({
    queryKey: ['learners', 'analytics', 'incomplete-profiles', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.institutionIds?.length) {
        params.set('institutionIds', filters.institutionIds.join(','));
      }
      if (filters.limit) {
        params.set('limit', String(filters.limit));
      }
      const res = await fetch(`/api/learners/analytics/incomplete-profiles?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch incomplete profiles');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
