// hooks/parent-portal/use-parent-communications.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ParentPortalService } from '@/lib/services/parent-portal/parent-portal-service';
import type { CreateCommunicationDto, CommunicationFilters } from '@/types/parent-portal';
import { parentDashboardKeys } from './use-parent-dashboard';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const parentCommunicationKeys = {
  all: ['parent-communications'] as const,
  lists: () => [...parentCommunicationKeys.all, 'list'] as const,
  list: (filters: CommunicationFilters) => [...parentCommunicationKeys.lists(), filters] as const,
  details: () => [...parentCommunicationKeys.all, 'detail'] as const,
  detail: (id: string) => [...parentCommunicationKeys.details(), id] as const,
  unreadCount: (parentId: string) => [...parentCommunicationKeys.all, 'unread', parentId] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

export function useParentCommunications(filters: CommunicationFilters = {}) {
  return useQuery({
    queryKey: parentCommunicationKeys.list(filters),
    queryFn: () => ParentPortalService.getCommunications(filters),
    staleTime: 2 * 60 * 1000,
  });
}

export function useParentCommunication(id: string) {
  return useQuery({
    queryKey: parentCommunicationKeys.detail(id),
    queryFn: () => ParentPortalService.getCommunication(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch unread communication count
 * FIXED: Removed aggressive auto-refresh, use manual refetch or window focus instead
 */
export function useUnreadCommunicationCount(parentId: string) {
  return useQuery({
    queryKey: parentCommunicationKeys.unreadCount(parentId),
    queryFn: () => ParentPortalService.getUnreadCount(parentId),
    enabled: !!parentId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true // Refresh when user returns to tab
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export function useCreateCommunication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCommunicationDto) =>
      ParentPortalService.createCommunication(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parentCommunicationKeys.lists() });
      toast.success('Message sent successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send message');
    },
  });
}

export function useMarkCommunicationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      ParentPortalService.markCommunicationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parentCommunicationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: parentDashboardKeys.dashboard() });
    },
  });
}

export function useMarkAllCommunicationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (parentId: string) =>
      ParentPortalService.markAllCommunicationsRead(parentId).then(() => parentId),
    onSuccess: (parentId) => {
      queryClient.invalidateQueries({ queryKey: parentCommunicationKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: parentCommunicationKeys.unreadCount(parentId),
      });
      queryClient.invalidateQueries({
        queryKey: parentDashboardKeys.dashboard(parentId),
      });
      toast.success('All messages marked as read');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark messages as read');
    },
  });
}
