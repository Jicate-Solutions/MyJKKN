'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessFeedbackService } from '@/lib/services/campus-living/mess-feedback-service';
import type {
  MessFeedback,
  CreateMessFeedbackDTO,
} from '@/types/campus-living';

// Query key factory
export const messFeedbackKeys = {
  all: ['mess-feedback'] as const,
  list: (filters: Record<string, unknown>) => ['mess-feedback', 'list', filters] as const,
  detail: (id: string) => ['mess-feedback', 'detail', id] as const,
};

// --- Query hooks ---

export function useMessFeedback(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: messFeedbackKeys.list({ institutionId, ...filters }),
    queryFn: () => MessFeedbackService.getFeedback(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMessFeedbackDetail(id: string) {
  return useQuery({
    queryKey: messFeedbackKeys.detail(id),
    queryFn: () => MessFeedbackService.getFeedbackDetail(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateMessFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMessFeedbackDTO) => MessFeedbackService.createFeedback(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messFeedbackKeys.all });
      toast.success('Feedback submitted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit feedback: ${error.message}`);
    },
  });
}

export function useUpdateMessFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateMessFeedbackDTO> }) =>
      MessFeedbackService.updateFeedback(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messFeedbackKeys.all });
      queryClient.invalidateQueries({ queryKey: messFeedbackKeys.detail(variables.id) });
      toast.success('Feedback updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update feedback: ${error.message}`);
    },
  });
}

export function useDeleteMessFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => MessFeedbackService.deleteFeedback(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messFeedbackKeys.all });
      toast.success('Feedback deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete feedback: ${error.message}`);
    },
  });
}
