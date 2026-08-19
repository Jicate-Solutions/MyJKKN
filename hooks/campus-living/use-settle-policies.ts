'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  getSettleCategoryScope,
  getSettlePolicySnapshot,
  setSettleCategoryScope,
  updateSettlePolicy,
  type SettlePolicyKey,
} from '@/lib/services/campus-living/settle-policy-service';

const settleKeys = {
  all: ['campus-living', 'settle-policies'] as const,
  policies: ['campus-living', 'settle-policies', 'snapshot'] as const,
  categories: ['campus-living', 'settle-policies', 'categories'] as const,
};

export function useSettlePolicies() {
  return useQuery({
    queryKey: settleKeys.policies,
    queryFn: getSettlePolicySnapshot,
  });
}

export function useSettleCategoryScope() {
  return useQuery({
    queryKey: settleKeys.categories,
    queryFn: getSettleCategoryScope,
  });
}

export function useUpdateSettlePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: SettlePolicyKey; value: number | boolean }) =>
      updateSettlePolicy(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settleKeys.policies });
      toast.success('Saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save that setting'),
  });
}

export function useSetSettleCategoryScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, enabled }: { categoryId: string; enabled: boolean }) =>
      setSettleCategoryScope(categoryId, enabled),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: settleKeys.categories });
      toast.success(
        vars.enabled
          ? 'Empty-bed settlement now applies to this category.'
          : 'This category is out of scope — its rooms will not be billed for empty beds.'
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not change the scope'),
  });
}
