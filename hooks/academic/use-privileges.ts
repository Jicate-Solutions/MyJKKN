import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PrivilegeService } from '@/lib/services/academic/privilege-service';
import { usePermissions } from '@/hooks/use-permissions';
import toast from 'react-hot-toast';
import type {
  PrivilegeMember,
  PrivilegeGroupFilters,
  PrivilegeMemberFilters,
  CreatePrivilegeGroupDto,
  UpdatePrivilegeGroupDto,
  AddMemberDto,
  BulkAddMembersDto,
  UpdateMemberStatusDto,
  CreateReviewDto,
} from '@/types/privileges';

/**
 * React Query hooks for the Exceptions & Privileges module.
 * Created: 2026-03-25
 */

const QUERY_KEYS = {
  all: ['privileges'] as const,
  lists: () => [...QUERY_KEYS.all, 'list'] as const,
  list: (filters: PrivilegeGroupFilters) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
  types: (institutionId?: string) => [...QUERY_KEYS.all, 'types', institutionId] as const,
  members: (groupId: string) => [...QUERY_KEYS.all, 'members', groupId] as const,
  membersList: (groupId: string, filters: PrivilegeMemberFilters) =>
    [...QUERY_KEYS.members(groupId), filters] as const,
  reviews: (groupId: string) => [...QUERY_KEYS.all, 'reviews', groupId] as const,
  learnerPrivileges: (learnerId: string) =>
    [...QUERY_KEYS.all, 'learner', learnerId] as const,
  templates: () => [...QUERY_KEYS.all, 'templates'] as const,
};

// =====================
// QUERY HOOKS
// =====================

/**
 * Fetch paginated list of privilege groups with filters.
 */
export function usePrivilegeGroups(filters: PrivilegeGroupFilters = {}) {
  const { userProfile, isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : userProfile?.institution_id;

  return useQuery({
    queryKey: QUERY_KEYS.list(filters),
    queryFn: () => PrivilegeService.getGroups(filters, institutionId),
    enabled: isSuperAdmin || !!institutionId,
    staleTime: 30000,
  });
}

/**
 * Fetch a single privilege group by ID.
 */
export function usePrivilegeGroup(id: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.detail(id || ''),
    queryFn: () => PrivilegeService.getGroup(id!),
    enabled: !!id,
    staleTime: 30000,
  });
}

/**
 * Fetch all privilege types for the current institution.
 */
export function usePrivilegeTypes() {
  const { userProfile } = usePermissions();
  const institutionId = userProfile?.institution_id || undefined;

  return useQuery({
    queryKey: QUERY_KEYS.types(institutionId),
    queryFn: () => PrivilegeService.getPrivilegeTypes(institutionId),
    enabled: !!userProfile,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch paginated list of members for a privilege group.
 */
export function usePrivilegeMembers(
  groupId: string | null,
  filters: PrivilegeMemberFilters = {}
) {
  const { userProfile, isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : userProfile?.institution_id;

  return useQuery({
    queryKey: QUERY_KEYS.membersList(groupId || '', filters),
    queryFn: () =>
      PrivilegeService.getMembers({ ...filters, group_id: groupId! }, institutionId),
    enabled: !!groupId && (isSuperAdmin || !!institutionId),
    staleTime: 30000,
  });
}

/**
 * Fetch active privileges for a specific learner.
 * Used by dashboard badge and learner profile views.
 */
export function useLearnerPrivileges(learnerId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.learnerPrivileges(learnerId || ''),
    queryFn: () => PrivilegeService.getActivePrivilegesForLearner(learnerId!),
    enabled: !!learnerId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Fetch review history for a privilege group.
 */
export function usePrivilegeReviews(groupId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.reviews(groupId || ''),
    queryFn: () => PrivilegeService.getReviewHistory(groupId!),
    enabled: !!groupId,
    staleTime: 30000,
  });
}

/**
 * Fetch all privilege group templates.
 */
export function usePrivilegeTemplates() {
  const { userProfile, isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : userProfile?.institution_id;

  return useQuery({
    queryKey: QUERY_KEYS.templates(),
    queryFn: () =>
      PrivilegeService.getGroups({ is_template: true }, institutionId),
    enabled: isSuperAdmin || !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}

// =====================
// MUTATION HOOKS
// =====================

/**
 * Create a new privilege group.
 */
export function useCreatePrivilegeGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreatePrivilegeGroupDto) => PrivilegeService.createGroup(dto),
    onSuccess: () => {
      toast.success('Privilege group created');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create privilege group');
    },
  });
}

/**
 * Update an existing privilege group.
 */
export function useUpdatePrivilegeGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePrivilegeGroupDto }) =>
      PrivilegeService.updateGroup(id, dto),
    onSuccess: (_data, variables) => {
      toast.success('Privilege group updated');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update privilege group');
    },
  });
}

/**
 * Soft-delete (archive) a privilege group.
 */
export function useDeletePrivilegeGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => PrivilegeService.deleteGroup(id),
    onSuccess: () => {
      toast.success('Privilege group archived');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete privilege group');
    },
  });
}

/**
 * Add a single member to a privilege group.
 */
export function useAddPrivilegeMember(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddMemberDto) => PrivilegeService.addMember(dto),
    onSuccess: () => {
      toast.success('Member added');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.members(groupId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(groupId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add member');
    },
  });
}

/**
 * Bulk add members to a privilege group.
 */
export function useBulkAddMembers(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: BulkAddMembersDto) => PrivilegeService.bulkAddMembers(dto),
    onSuccess: (result: { added: number; skipped: number; errors: string[] }) => {
      if (result.errors.length > 0) {
        toast.error(`Added ${result.added}, skipped ${result.skipped}, ${result.errors.length} errors`);
      } else {
        toast.success(`Added ${result.added} members (${result.skipped} already existed)`);
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.members(groupId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(groupId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add members');
    },
  });
}

/**
 * Update a member's status (revoke, under_review, etc.).
 * Invalidates both the member list and learner privilege cache.
 */
export function useUpdateMemberStatus(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      dto,
    }: {
      memberId: string;
      dto: UpdateMemberStatusDto;
    }) => PrivilegeService.updateMemberStatus(memberId, dto),
    onSuccess: (updatedMember: PrivilegeMember) => {
      const statusLabel =
        updatedMember.status === 'revoked'
          ? 'revoked'
          : updatedMember.status === 'under_review'
          ? 'marked for review'
          : 'reactivated';
      toast.success(`Member ${statusLabel}`);

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.members(groupId) });
      // Invalidate learner's privilege cache so dashboard badge updates
      if (updatedMember.learner_id) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.learnerPrivileges(updatedMember.learner_id),
        });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update member status');
    },
  });
}

/**
 * Create a review for a privilege group. Applies member decisions.
 */
export function useCreateReview(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateReviewDto) => PrivilegeService.createReview(dto),
    onSuccess: () => {
      toast.success('Review completed');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reviews(groupId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.members(groupId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(groupId) });
      // Also invalidate learner privileges since statuses may have changed
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.all, 'learner'],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create review');
    },
  });
}

/**
 * Save an existing group as a reusable template.
 */
export function useSaveAsTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      groupId,
      templateName,
    }: {
      groupId: string;
      templateName: string;
    }) => PrivilegeService.saveAsTemplate(groupId, templateName),
    onSuccess: () => {
      toast.success('Template saved');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.templates() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save template');
    },
  });
}

/**
 * Create a new group from a template.
 */
export function useCreateFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      overrides,
    }: {
      templateId: string;
      overrides: Partial<CreatePrivilegeGroupDto>;
    }) => PrivilegeService.createFromTemplate(templateId, overrides),
    onSuccess: () => {
      toast.success('Group created from template');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create group from template');
    },
  });
}
