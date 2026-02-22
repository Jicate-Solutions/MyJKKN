'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessMealService } from '@/lib/services/campus-living/mess-meal-service';
import type {
  MessMealRecord,
  CreateMessMealRecordDTO,
  MealRecordFilters,
} from '@/types/campus-living';

// Query key factory
export const messMealKeys = {
  all: ['mess-meals'] as const,
  list: (filters: Record<string, unknown>) => ['mess-meals', 'list', filters] as const,
  detail: (id: string) => ['mess-meals', 'detail', id] as const,
};

// --- Query hooks ---

export function useMessMeals(institutionId: string, filters?: MealRecordFilters) {
  return useQuery({
    queryKey: messMealKeys.list({ institutionId, ...filters }),
    queryFn: () => MessMealService.getMealRecords(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMessMeal(id: string) {
  return useQuery({
    queryKey: messMealKeys.detail(id),
    queryFn: () => MessMealService.getMealRecord(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useScanMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMessMealRecordDTO) => MessMealService.recordMeal(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messMealKeys.all });
      toast.success('Meal scanned');
    },
    onError: (error: Error) => {
      toast.error(`Failed to scan meal: ${error.message}`);
    },
  });
}

export function useCreateMessMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMessMealRecordDTO) => MessMealService.recordMeal(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messMealKeys.all });
      toast.success('Meal record created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create meal record: ${error.message}`);
    },
  });
}

export function useUpdateMessMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateMessMealRecordDTO> }) =>
      MessMealService.updateMealRecord(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messMealKeys.all });
      queryClient.invalidateQueries({ queryKey: messMealKeys.detail(variables.id) });
      toast.success('Meal record updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update meal record: ${error.message}`);
    },
  });
}

export function useDeleteMessMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => MessMealService.deleteMealRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messMealKeys.all });
      toast.success('Meal record deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete meal record: ${error.message}`);
    },
  });
}
