// hooks/admission/use-rule-types.ts
// Created: 2026-05-06
// React Query hooks wrapping RuleTypeRegistryService.
//
// Director's standing rule (2026-04-29): policy decisions = config-table rows.
// This hook backs the rule-form-dialog dropdown and the admin management UI.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RuleTypeRegistryService,
  type RuleTypeRegistryRow,
  type CreateRuleTypeInput,
  type UpdateRuleTypeInput,
} from '@/lib/services/admission/rule-type-registry-service';

export const ruleTypesKeys = {
  all: ['rule-types'] as const,
  active: () => [...ruleTypesKeys.all, 'active'] as const,
  full: () => [...ruleTypesKeys.all, 'full'] as const,
  detail: (id: string) => [...ruleTypesKeys.all, 'detail', id] as const,
};

/**
 * Hook for the rule-form-dialog dropdown — returns ACTIVE rows only.
 *
 * Returns `{ ruleTypes, isLoading, error }`. On error the dropdown should
 * fall back to a small inline message (rule-form-dialog handles this).
 */
export function useRuleTypes() {
  const query = useQuery({
    queryKey: ruleTypesKeys.active(),
    queryFn: () => RuleTypeRegistryService.getRuleTypes(),
    // Registry is small + rarely changes — keep dropdown snappy.
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    ruleTypes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Hook for the admin management UI — returns ALL rows (active + inactive). */
export function useAllRuleTypes() {
  const query = useQuery({
    queryKey: ruleTypesKeys.full(),
    queryFn: () => RuleTypeRegistryService.listAll(),
    staleTime: 60 * 1000, // 1 minute (admin UI tolerates fresher reads)
  });

  return {
    ruleTypes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Mutations bundle for the admin management UI (create / update / activate / deactivate). */
export function useRuleTypeMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ruleTypesKeys.all });
  };

  const createRuleType = useMutation({
    mutationFn: (input: CreateRuleTypeInput) =>
      RuleTypeRegistryService.createRuleType(input),
    onSuccess: (row) => {
      toast.success(`Rule type "${row.display_label}" created`);
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create rule type');
    },
  });

  const updateRuleType = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRuleTypeInput }) =>
      RuleTypeRegistryService.updateRuleType(id, input),
    onSuccess: (row) => {
      toast.success(`Rule type "${row.display_label}" updated`);
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update rule type');
    },
  });

  const deactivateRuleType = useMutation({
    mutationFn: (id: string) => RuleTypeRegistryService.deactivateRuleType(id),
    onSuccess: (row) => {
      toast.success(`Rule type "${row.display_label}" deactivated`);
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to deactivate rule type');
    },
  });

  const activateRuleType = useMutation({
    mutationFn: (id: string) => RuleTypeRegistryService.activateRuleType(id),
    onSuccess: (row) => {
      toast.success(`Rule type "${row.display_label}" activated`);
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to activate rule type');
    },
  });

  return {
    createRuleType,
    updateRuleType,
    deactivateRuleType,
    activateRuleType,
    isCreating: createRuleType.isPending,
    isUpdating: updateRuleType.isPending,
  };
}

export type { RuleTypeRegistryRow };
