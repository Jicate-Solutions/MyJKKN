// hooks/faculty-innovation/use-approval-queue.ts
// Fetches the role-routed approval queue for the current user.
// Director sees director items, Dean sees dean items, etc.

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { FacultyInitiativeService } from '@/lib/services/faculty-innovation/faculty-initiative-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { facultyInitiativeKeys } from './use-faculty-initiatives';
import type {
  ApprovalAction,
  ApprovalQueueItem,
} from '@/types/faculty-innovation';

const STABLE_DATA = {
  staleTime: 30 * 1000,          // 30s — queue is more time-sensitive
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,    // Refetch when user tabs back to see latest
} satisfies Partial<UseQueryOptions<any, any, any, any>>;

export const approvalQueueKeys = {
  all: ['approval-queue'] as const,
  list: (role: string, institutionId?: string) =>
    [...approvalQueueKeys.all, role, institutionId ?? 'all'] as const,
};

/**
 * Fetch the approval queue for the current user's role.
 */
export function useApprovalQueue() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const role = profile?.role ?? '';
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id ?? undefined;

  // Only approver roles should attempt to fetch the queue
  const isApprover =
    isSuperAdmin ||
    ['director', 'dean', 'ip_cell', 'ip cell', 'hod'].includes(role);

  const query = useQuery<ApprovalQueueItem[]>({
    queryKey: approvalQueueKeys.list(role, institutionId),
    queryFn: () =>
      FacultyInitiativeService.getApprovalQueue({
        role,
        institution_id: institutionId,
        isSuperAdmin,
      }),
    enabled: isApprover && !!role,
    ...STABLE_DATA,
  });

  return {
    queue: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    isApprover,
  };
}

/**
 * Mutation hooks for approval actions.
 */
export function useApprovalActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: approvalQueueKeys.all });
    queryClient.invalidateQueries({ queryKey: facultyInitiativeKeys.all });
  };

  const executeAction = useMutation({
    mutationFn: (input: ApprovalAction) =>
      FacultyInitiativeService.executeApprovalAction(input),
    onSuccess: (_data, vars) => {
      const labels: Record<string, string> = {
        approve: 'Initiative approved',
        request_changes: 'Changes requested',
        reject: vars.reroute_to
          ? `Rerouted to ${vars.reroute_to}`
          : 'Initiative rejected',
        defer: 'Review deferred',
      };
      toast.success(labels[vars.action] ?? 'Action completed');
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Approval action failed');
    },
  });

  return { executeAction };
}
