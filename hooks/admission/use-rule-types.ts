// hooks/admission/use-rule-types.ts
// ============================================================================
// React Query hook for the assignment_rule_type_registry config table.
// Used by the rule-form-dialog dropdown (active rows only) and the
// /admin/counselors/rule-types CRUD page (all rows).
//
// Created: 2026-05-07
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RuleTypeRegistryService,
  type AssignmentRuleTypeRow,
  type CreateRuleTypeInput,
  type UpdateRuleTypeInput,
} from '@/lib/services/admission/rule-type-registry-service';

// Query keys
export const ruleTypesKeys = {
  all: ['rule-types'] as const,
  active: () => [...ruleTypesKeys.all, 'active'] as const,
  list: () => [...ruleTypesKeys.all, 'list'] as const,
  detail: (id: string) => [...ruleTypesKeys.all, 'detail', id] as const,
};

/**
 * Hook to fetch ACTIVE rule types — what the rule-form-dialog dropdown needs.
 * Public read RLS means this is safe for every authenticated user.
 */
export function useRuleTypes() {
  const query = useQuery({
    queryKey: ruleTypesKeys.active(),
    queryFn: () => RuleTypeRegistryService.getActiveRuleTypes(),
    staleTime: 60_000, // 60s — registry changes are infrequent
  });

  return {
    ruleTypes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch ALL rule types (active + inactive) — for the admin CRUD page.
 */
export function useAllRuleTypes() {
  const query = useQuery({
    queryKey: ruleTypesKeys.list(),
    queryFn: () => RuleTypeRegistryService.getAllRuleTypes(),
    staleTime: 30_000,
  });

  return {
    ruleTypes: (query.data ?? []) as AssignmentRuleTypeRow[],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for rule-type mutations (create, update, toggle, delete).
 */
export function useRuleTypeMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ruleTypesKeys.all });
  };

  const createRuleType = useMutation({
    mutationFn: (input: CreateRuleTypeInput) =>
      RuleTypeRegistryService.createRuleType(input),
    onSuccess: () => {
      toast.success('Rule type created');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create rule type');
    },
  });

  const updateRuleType = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRuleTypeInput }) =>
      RuleTypeRegistryService.updateRuleType(id, input),
    onSuccess: () => {
      toast.success('Rule type updated');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update rule type');
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      RuleTypeRegistryService.toggleActive(id, isActive),
    onSuccess: (data) => {
      toast.success(data.is_active ? 'Rule type activated' : 'Rule type deactivated');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to toggle rule type');
    },
  });

  const deleteRuleType = useMutation({
    mutationFn: (id: string) => RuleTypeRegistryService.deleteRuleType(id),
    onSuccess: () => {
      toast.success('Rule type deleted');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete rule type');
    },
  });

  return {
    createRuleType,
    updateRuleType,
    toggleActive,
    deleteRuleType,
    isCreating: createRuleType.isPending,
    isUpdating: updateRuleType.isPending,
    isToggling: toggleActive.isPending,
    isDeleting: deleteRuleType.isPending,
  };
}
