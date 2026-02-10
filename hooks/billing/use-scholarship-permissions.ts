import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  ScholarshipPermissionService,
  type ScholarshipPermissions
} from '@/lib/services/billing/scholarship-permission-service';

const QUERY_KEY = 'scholarship-permissions';

/**
 * Hook to fetch all scholarship permissions for all roles.
 * Uses React Query for caching, background refetching, and error handling.
 */
export function useScholarshipPermissions() {
  const {
    data: permissions,
    isLoading,
    error,
    refetch
  } = useQuery<ScholarshipPermissions[], Error>({
    queryKey: [QUERY_KEY],
    queryFn: () =>
      ScholarshipPermissionService.getAllScholarshipPermissions(),
    staleTime: 2 * 60 * 1000 // 2 minutes - permissions don't change often
  });

  return {
    permissions: permissions || [],
    isLoading,
    error: error?.message || null,
    refetch
  };
}

/**
 * Hook to apply a permission template to a role.
 * Invalidates the permissions query on success so the UI refreshes.
 */
export function useApplyPermissionTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleKey,
      templateId
    }: {
      roleKey: string;
      templateId: string;
    }) =>
      ScholarshipPermissionService.applyPermissionTemplate(
        roleKey,
        templateId
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update permissions');
    }
  });
}

/**
 * Hook to update individual scholarship permissions for a role.
 * Invalidates the permissions query on success.
 */
export function useUpdateScholarshipPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleKey,
      permissions
    }: {
      roleKey: string;
      permissions: {
        can_view: boolean;
        can_create: boolean;
        can_edit: boolean;
        can_delete: boolean;
        can_approve: boolean;
      };
    }) =>
      ScholarshipPermissionService.updateScholarshipPermissions(
        roleKey,
        permissions
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update permissions');
    }
  });
}
