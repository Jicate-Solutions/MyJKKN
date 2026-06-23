// hooks/events/shared/use-event-budget.ts
// React Query hooks for the shared event budget + finance sign-off workflow (Events Platform Promotion PR2).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventBudgetService } from '@/lib/services/events/shared/event-budget-service';
import type { MarathonBudgetItem, CreateMarathonBudgetItemDto } from '@/types/events-marathon';

const KEYS = {
  all: ['event-budget'] as const,
  items: (eventId: string) => [...KEYS.all, 'items', eventId] as const,
  summary: (eventId: string) => [...KEYS.all, 'summary', eventId] as const,
  approval: (eventId: string) => [...KEYS.all, 'approval', eventId] as const,
};

export function useEventBudgetItems(eventId: string) {
  return useQuery({
    queryKey: KEYS.items(eventId),
    queryFn: () => EventBudgetService.getBudgetItems(eventId),
    enabled: !!eventId,
  });
}

export function useEventBudgetSummary(eventId: string) {
  return useQuery({
    queryKey: KEYS.summary(eventId),
    queryFn: () => EventBudgetService.getBudgetSummary(eventId),
    enabled: !!eventId,
  });
}

export function useEventBudgetApproval(eventId: string) {
  return useQuery({
    queryKey: KEYS.approval(eventId),
    queryFn: () => EventBudgetService.getApproval(eventId),
    enabled: !!eventId,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, eventId: string) {
  qc.invalidateQueries({ queryKey: KEYS.items(eventId) });
  qc.invalidateQueries({ queryKey: KEYS.summary(eventId) });
  qc.invalidateQueries({ queryKey: KEYS.approval(eventId) });
}

export function useCreateEventBudgetItem(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateMarathonBudgetItemDto) => EventBudgetService.createBudgetItem(dto),
    onSuccess: () => {
      invalidateAll(qc, eventId);
      toast.success('Budget item added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add item'),
  });
}

export function useUpdateEventBudgetItem(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<MarathonBudgetItem> }) =>
      EventBudgetService.updateBudgetItem(id, dto),
    onSuccess: () => invalidateAll(qc, eventId),
    onError: (e: Error) => toast.error(e.message || 'Failed to update item'),
  });
}

export function useDeleteEventBudgetItem(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => EventBudgetService.deleteBudgetItem(id),
    onSuccess: () => {
      invalidateAll(qc, eventId);
      toast.success('Budget item removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove item'),
  });
}

export function useSubmitEventBudget(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => EventBudgetService.submitBudget(eventId),
    onSuccess: () => {
      invalidateAll(qc, eventId);
      toast.success('Budget submitted for finance sign-off');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to submit budget'),
  });
}

export function useApproveEventBudget(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => EventBudgetService.approveBudget(eventId),
    onSuccess: () => {
      invalidateAll(qc, eventId);
      toast.success('Budget approved and locked');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to approve budget'),
  });
}

export function useReopenEventBudget(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => EventBudgetService.reopenBudget(eventId),
    onSuccess: () => {
      invalidateAll(qc, eventId);
      toast.success('Budget reopened for editing');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to reopen budget'),
  });
}
