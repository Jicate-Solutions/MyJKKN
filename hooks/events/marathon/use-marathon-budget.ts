// hooks/events/marathon/use-marathon-budget.ts
// React Query hooks for marathon budget item management.
// Created: 2026-04-07

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MarathonBudgetService,
} from '@/lib/services/events/marathon/marathon-budget-service';
import type {
  MarathonBudgetItem,
  CreateMarathonBudgetItemDto,
} from '@/types/events-marathon';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['marathon-budget'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  listByEvent: (eventId: string) => [...KEYS.lists(), eventId] as const,
  summary: (eventId: string) => [...KEYS.all, 'summary', eventId] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch all budget items for an event.
 */
export function useMarathonBudget(eventId: string) {
  return useQuery({
    queryKey: KEYS.listByEvent(eventId),
    queryFn: () => MarathonBudgetService.getBudgetItems(eventId),
    enabled: !!eventId,
  });
}

/**
 * Fetch aggregated budget summary (totals, balances, by-category breakdown).
 */
export function useBudgetSummary(eventId: string) {
  return useQuery({
    queryKey: KEYS.summary(eventId),
    queryFn: () => MarathonBudgetService.getBudgetSummary(eventId),
    enabled: !!eventId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create a new budget item.
 */
export function useCreateBudgetItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateMarathonBudgetItemDto) =>
      MarathonBudgetService.createBudgetItem(dto),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(item.event_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(item.event_id) });
      toast.success('Budget item added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add budget item');
    },
  });
}

/**
 * Update an existing budget item (amounts, status, vendor, etc.).
 */
export function useUpdateBudgetItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      dto,
    }: {
      id: string;
      eventId: string;
      dto: Partial<MarathonBudgetItem>;
    }) => MarathonBudgetService.updateBudgetItem(id, dto),
    onSuccess: (item, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(variables.eventId) });
      toast.success('Budget item updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update budget item');
    },
  });
}

/**
 * Delete a budget item.
 */
export function useDeleteBudgetItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; eventId: string }) =>
      MarathonBudgetService.deleteBudgetItem(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(variables.eventId) });
      toast.success('Budget item deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete budget item');
    },
  });
}
