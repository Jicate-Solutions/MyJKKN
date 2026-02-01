'use client';

// hooks/grievance/use-grievance-comments.ts
// F004: Grievance Ticketing System - Comment Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import type { CreateGrievanceCommentDto } from '@/types/grievance';
import { grievanceTicketKeys } from './use-grievance-tickets';

// Query keys
export const grievanceCommentKeys = {
  all: ['grievance-comments'] as const,
  list: (ticketId: string, includeInternal?: boolean) =>
    [...grievanceCommentKeys.all, ticketId, includeInternal] as const
};

/**
 * Hook to fetch comments for a ticket
 */
export function useGrievanceComments(ticketId: string, includeInternal = false) {
  return useQuery({
    queryKey: grievanceCommentKeys.list(ticketId, includeInternal),
    queryFn: () => GrievanceService.getComments(ticketId, includeInternal),
    enabled: !!ticketId,
    staleTime: 30 * 1000 // 30 seconds
  });
}

/**
 * Hook to add a comment
 */
export function useAddGrievanceComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      data
    }: {
      ticketId: string;
      data: CreateGrievanceCommentDto;
    }) => GrievanceService.addComment(ticketId, data),
    onSuccess: (_, variables) => {
      toast.success('Comment added');
      queryClient.invalidateQueries({
        queryKey: grievanceCommentKeys.list(variables.ticketId)
      });
      // Also invalidate ticket to update any comment counts
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.detail(variables.ticketId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add comment');
    }
  });
}
