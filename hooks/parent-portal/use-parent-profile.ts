// hooks/parent-portal/use-parent-profile.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ParentPortalService } from '@/lib/services/parent-portal/parent-portal-service';
import type {
  CreateParentProfileDto,
  UpdateParentProfileDto,
  ParentProfileFilters,
} from '@/types/parent-portal';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const parentProfileKeys = {
  all: ['parent-profiles'] as const,
  lists: () => [...parentProfileKeys.all, 'list'] as const,
  list: (filters: ParentProfileFilters) => [...parentProfileKeys.lists(), filters] as const,
  details: () => [...parentProfileKeys.all, 'detail'] as const,
  detail: (id: string) => [...parentProfileKeys.details(), id] as const,
  byUser: (userId: string) => [...parentProfileKeys.all, 'by-user', userId] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

export function useParentProfiles(filters: ParentProfileFilters) {
  return useQuery({
    queryKey: parentProfileKeys.list(filters),
    queryFn: () => ParentPortalService.getParentProfiles(filters),
    enabled: !!filters.institution_id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useParentProfile(id: string) {
  return useQuery({
    queryKey: parentProfileKeys.detail(id),
    queryFn: () => ParentPortalService.getParentProfileById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useParentProfileByUser(userId: string) {
  return useQuery({
    queryKey: parentProfileKeys.byUser(userId),
    queryFn: () => ParentPortalService.getParentProfile(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export function useCreateParentProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateParentProfileDto) =>
      ParentPortalService.createParentProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parentProfileKeys.lists() });
      toast.success('Parent profile created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create parent profile');
    },
  });
}

export function useUpdateParentProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateParentProfileDto }) =>
      ParentPortalService.updateParentProfile(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: parentProfileKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: parentProfileKeys.lists() });
      toast.success('Profile updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update profile');
    },
  });
}

export function useVerifyParent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ParentPortalService.verifyParent(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: parentProfileKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: parentProfileKeys.lists() });
      toast.success('Parent verified successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to verify parent');
    },
  });
}
