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
import type {
  IncompleteProfileFilterOptions,
  IncompleteProfilesFilters,
  IncompleteProfilesResponse,
} from '@/types/learner-dashboard';

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
    // Guard against Next.js DRP placeholders (%%drp:id:...%%) that appear during
    // client-side navigation with PPR enabled. Passing these to Supabase causes
    // "invalid input syntax for type uuid" errors.
    enabled: !!id && !id.includes('%%drp:'),
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
    // This hook is only used by the /learners/profiles/create page — a
    // manually-verified, single-shot admit flow — so it force-activates the
    // record instead of leaving it at createLearnerProfile's 'enquiry'
    // default, which the Learners Management Active/Inactive/Exited tabs
    // never surface. Other callers of createLearnerProfile (general Enquiry
    // form, bulk upload) go through their own hooks and keep the default.
    mutationFn: (dto) =>
      LearnerProfileService.createLearnerProfile({ ...dto, lifecycle_status: 'active' }),
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
 * Activate an onboarded learner (admitted → active) and provision their login.
 * 2026-08-10 — powers the "Ready to Activate" tier on /learners/onboarding.
 *
 * Deliberately does NOT reject when the login fails: `activated: true` with
 * `loginCreated: false` means the status change already committed in Postgres,
 * so throwing would push the caller to retry work that is already done. The
 * caller inspects both flags and reports the partial outcome.
 */
export function useActivateLearner() {
  const queryClient = useQueryClient();

  return useMutation<
    Awaited<ReturnType<typeof LearnerProfileService.activateIfReady>>,
    Error,
    string
  >({
    mutationFn: (id) => LearnerProfileService.activateIfReady(id),
    onSuccess: (result, id) => {
      // Only invalidate when something actually changed — a refused activation
      // (wrong status, missing field) leaves the cache correct as it is.
      if (!result.activated) return;
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.analytics() });
    },
  });
}

/**
 * Transfer enquiry to another institution (regenerates application_id).
 * 2026-04-17
 */
export function useTransferEnquiry() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; application_id: string; institution_id: string; program_id: string },
    Error,
    {
      learnerId: string;
      newInstitutionId: string;
      newDegreeId: string;
      newDepartmentId: string;
      newProgramId: string;
      newSemesterId?: string | null;
      newSectionId?: string | null;
      newAcademicYearId?: string | null;
      newRegulationId?: string | null;
      newBatchId?: string | null;
      reason: string;
    }
  >({
    mutationFn: (vars) => LearnerProfileService.transferEnquiry(vars),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.detail(variables.learnerId) });
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
 * Get enquiries (lifecycle_status = 'enquiry' — the entry-point status post 2026-05-20
 * workflow realignment; was 'admitted' before the rename)
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
 * Get admission pipeline (enquiry, enquiry_submitted, pending, approved, account,
 * reserved, admitted, rejected, waitlisted) — full pre-active funnel.
 */
export function useAdmissionPipeline(filters: Omit<LearnerProfileFilters, 'lifecycle_status'> = {}) {
  return useLearnerProfiles({
    ...filters,
    lifecycle_status: ['enquiry', 'enquiry_submitted', 'pending', 'approved', 'account', 'reserved', 'admitted', 'rejected', 'waitlisted'],
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
      departmentId?: string;
      programId?: string;
      onProgress?: (
        current: number,
        total: number,
        success: string[],
        failed: { id: string; error: string }[]
      ) => void;
    }
  >({
    mutationFn: ({ learnerIds, semesterId, sectionId, academicYearId, departmentId, programId, onProgress }) =>
      LearnerProfileService.bulkPromoteLearners(
        learnerIds,
        semesterId,
        sectionId,
        academicYearId,
        departmentId,
        programId,
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
 * Serialise drill-down filters into the API's query string.
 *
 * Exported because the Profile Completion table drives the shared DataTable,
 * which owns page/search/sort itself and calls a plain fetch function rather
 * than a hook — both paths must build the identical query string.
 */
export function buildIncompleteProfilesQuery(
  filters: IncompleteProfilesFilters
): string {
  const params = new URLSearchParams();

  if (filters.institutionIds?.length) {
    params.set('institutionIds', filters.institutionIds.join(','));
  }
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.search) params.set('search', filters.search);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  if (filters.completion) params.set('completion', filters.completion);
  if (filters.missingField) params.set('missingField', filters.missingField);
  if (filters.collegeEmail) params.set('collegeEmail', filters.collegeEmail);
  if (filters.academicYearId) params.set('academicYearId', filters.academicYearId);
  if (filters.admissionYearId) params.set('admissionYearId', filters.admissionYearId);
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.programId) params.set('programId', filters.programId);
  if (filters.semesterId) params.set('semesterId', filters.semesterId);
  if (filters.sectionId) params.set('sectionId', filters.sectionId);

  return params.toString();
}

/**
 * Fetch a page of profile-completion drill-down rows.
 * Shared by the hook below and the DataTable's fetch function.
 */
export async function fetchIncompleteProfiles(
  filters: IncompleteProfilesFilters
): Promise<IncompleteProfilesResponse> {
  const res = await fetch(
    `/api/learners/analytics/incomplete-profiles?${buildIncompleteProfilesQuery(filters)}`
  );
  if (!res.ok) {
    throw new Error('Failed to fetch incomplete profiles');
  }
  return res.json();
}

/**
 * Fetch detailed incomplete profiles for drill-down table
 * Used by Profile Completion Tab to show WHO has incomplete profiles
 */
export function useIncompleteProfiles(
  filters: IncompleteProfilesFilters,
  options?: Omit<UseQueryOptions<IncompleteProfilesResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<IncompleteProfilesResponse, Error>({
    queryKey: ['learners', 'analytics', 'incomplete-profiles', filters],
    queryFn: () => fetchIncompleteProfiles(filters),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Dropdown options for the drill-down filter bar (academic year, admission
 * year, semester, section). Keyed on institution only, so paging and filtering
 * the table never refetches them.
 */
export function useIncompleteProfileFilterOptions(
  institutionIds: string[] | undefined,
  options?: Omit<UseQueryOptions<IncompleteProfileFilterOptions, Error>, 'queryKey' | 'queryFn'>
) {
  const institutionKey = institutionIds?.length ? [...institutionIds].sort().join(',') : '';

  return useQuery<IncompleteProfileFilterOptions, Error>({
    queryKey: ['learners', 'analytics', 'incomplete-profiles', 'options', institutionKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionKey) params.set('institutionIds', institutionKey);

      const res = await fetch(
        `/api/learners/analytics/incomplete-profiles/options?${params.toString()}`
      );
      if (!res.ok) {
        throw new Error('Failed to fetch profile filter options');
      }
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}
