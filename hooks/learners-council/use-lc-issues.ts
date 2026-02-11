'use client';

// hooks/learners-council/use-lc-issues.ts
// LC-006: Issue Management - React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { LCIssueService } from '@/lib/services/learners-council/issue-service';
import type { GrievanceTicket } from '@/types/grievance';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const lcIssueKeys = {
  all: ['lc-issues'] as const,
  lists: () => [...lcIssueKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...lcIssueKeys.lists(), filters] as const,
  detail: (id: string) => [...lcIssueKeys.all, 'detail', id] as const,
  kanban: (institutionId: string, assignedTo?: string) =>
    [...lcIssueKeys.all, 'kanban', institutionId, assignedTo] as const,
  stats: (institutionId: string) => [...lcIssueKeys.all, 'stats', institutionId] as const
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Hook to fetch LC issues with filters
 */
export function useLCIssues(filters: {
  status?: string;
  assigned_to?: string;
  institution_id?: string;
  priority?: string;
  category_id?: string;
  search?: string;
  page?: number;
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: lcIssueKeys.list(filters),
    queryFn: () => LCIssueService.getLCIssues(filters),
    enabled: !!filters.institution_id,
    staleTime: 1 * 60 * 1000 // 1 minute
  });
}

/**
 * Hook to fetch a single issue by ID
 */
export function useIssueDetail(id: string) {
  return useQuery({
    queryKey: lcIssueKeys.detail(id),
    queryFn: () => LCIssueService.getIssueById(id),
    enabled: !!id
  });
}

/**
 * Hook to fetch kanban board data
 */
export function useKanbanBoard(institutionId: string, assignedTo?: string) {
  return useQuery({
    queryKey: lcIssueKeys.kanban(institutionId, assignedTo),
    queryFn: () => LCIssueService.getKanbanBoard(institutionId, assignedTo),
    enabled: !!institutionId,
    staleTime: 30 * 1000 // 30 seconds for live kanban
  });
}

/**
 * Hook to fetch issue statistics
 */
export function useIssueStats(institutionId: string) {
  return useQuery({
    queryKey: lcIssueKeys.stats(institutionId),
    queryFn: () => LCIssueService.getIssueStats(institutionId),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000 // 2 minutes
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Hook to create an LC issue
 */
export function useCreateLCIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      data,
      userId
    }: {
      data: {
        institution_id: string;
        subject: string;
        description: string;
        category: string;
        priority: string;
      };
      userId: string;
    }) => LCIssueService.createLCIssue(data, userId),
    onSuccess: (ticket) => {
      toast.success('Issue created successfully');
      queryClient.invalidateQueries({ queryKey: lcIssueKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: lcIssueKeys.kanban(ticket.institution_id)
      });
      queryClient.invalidateQueries({
        queryKey: lcIssueKeys.stats(ticket.institution_id)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create issue');
    }
  });
}

/**
 * Hook to assign an issue to an LC member
 */
export function useAssignIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, assigneeId }: { issueId: string; assigneeId: string }) =>
      LCIssueService.assignIssue(issueId, assigneeId),
    onSuccess: (ticket) => {
      toast.success('Issue assigned successfully');
      queryClient.invalidateQueries({ queryKey: lcIssueKeys.detail(ticket.id) });
      queryClient.invalidateQueries({ queryKey: lcIssueKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: lcIssueKeys.kanban(ticket.institution_id)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign issue');
    }
  });
}

/**
 * Hook to update issue status
 */
export function useUpdateIssueStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      issueId,
      status,
      comment
    }: {
      issueId: string;
      status: string;
      institutionId: string;
      comment?: string;
    }) => LCIssueService.updateIssueStatus(issueId, status, comment),
    onSuccess: (ticket, variables) => {
      toast.success(`Issue status updated to ${ticket.status}`);
      queryClient.invalidateQueries({ queryKey: lcIssueKeys.detail(ticket.id) });
      queryClient.invalidateQueries({ queryKey: lcIssueKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: lcIssueKeys.kanban(variables.institutionId)
      });
      queryClient.invalidateQueries({
        queryKey: lcIssueKeys.stats(variables.institutionId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update issue status');
    }
  });
}
