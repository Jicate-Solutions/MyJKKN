'use client';

// Store Kit Entitlements — React Query hooks over ImsKitService (PR-K2).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImsKitService, type KitPerson } from '@/lib/services/ims/kit-service';

// ── Rules ──────────────────────────────────────────────────────────────
export function useKitRules() {
  return useQuery({
    queryKey: ['ims-kit-rules'],
    queryFn: () => ImsKitService.getRules(),
    staleTime: 60 * 1000,
  });
}

export function useCreateKitRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ImsKitService.createRule.bind(ImsKitService),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ims-kit-rules'] }),
  });
}

export function useUpdateKitRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Parameters<typeof ImsKitService.updateRule>[1] }) =>
      ImsKitService.updateRule(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ims-kit-rules'] }),
  });
}

// ── Rule items / members ───────────────────────────────────────────────
export function useKitRuleItems(ruleId: string | null) {
  return useQuery({
    queryKey: ['ims-kit-rule-items', ruleId],
    queryFn: () => ImsKitService.getRuleItems(ruleId!),
    enabled: !!ruleId,
  });
}

export function useAddKitRuleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ImsKitService.addRuleItem.bind(ImsKitService),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['ims-kit-rule-items', v.rule_id] }),
  });
}

export function useRemoveKitRuleItem(ruleId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ImsKitService.removeRuleItem.bind(ImsKitService),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ims-kit-rule-items', ruleId] }),
  });
}

export function useKitRuleMembers(ruleId: string | null) {
  return useQuery({
    queryKey: ['ims-kit-rule-members', ruleId],
    queryFn: () => ImsKitService.getRuleMembers(ruleId!),
    enabled: !!ruleId,
  });
}

export function useAddKitRuleMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ImsKitService.addRuleMember.bind(ImsKitService),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['ims-kit-rule-members', v.rule_id] }),
  });
}

export function useRemoveKitRuleMember(ruleId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ImsKitService.removeRuleMember.bind(ImsKitService),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ims-kit-rule-members', ruleId] }),
  });
}

// ── Windows ────────────────────────────────────────────────────────────
export function useKitWindows() {
  return useQuery({
    queryKey: ['ims-kit-windows'],
    queryFn: () => ImsKitService.getWindows(),
    staleTime: 60 * 1000,
  });
}

export function useCreateKitWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ImsKitService.createWindow.bind(ImsKitService),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ims-kit-windows'] }),
  });
}

export function useToggleKitWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      ImsKitService.toggleWindow(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ims-kit-windows'] }),
  });
}

// ── Engine ─────────────────────────────────────────────────────────────
export function useResolveKitRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, applyToExisting }: { ruleId: string; applyToExisting: boolean }) =>
      ImsKitService.resolveRule(ruleId, applyToExisting),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ims-kit-entitlements'] }),
  });
}

export function useRecordKitCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ImsKitService.recordCollection.bind(ImsKitService),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ims-kit-entitlements'] });
      qc.invalidateQueries({ queryKey: ['ims-kit-collections'] });
    },
  });
}

export function useVoidKitCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, reason, itemReturned }:
      { collectionId: string; reason: string; itemReturned: boolean }) =>
      ImsKitService.voidCollection(collectionId, reason, itemReturned),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ims-kit-entitlements'] });
      qc.invalidateQueries({ queryKey: ['ims-kit-collections'] });
    },
  });
}

// D33: fat-finger undo — revoke a rule's not-yet-collected entitlements.
export function useRevokeKitRuleEntitlements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => ImsKitService.revokeRuleEntitlements(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ims-kit-entitlements'] }),
  });
}

// ── Counter + self views ───────────────────────────────────────────────
export function useKitEntitlements(person: KitPerson | null) {
  return useQuery({
    queryKey: ['ims-kit-entitlements', person?.kind, person?.id],
    queryFn: () => ImsKitService.entitlementsForPerson(person!),
    enabled: !!person,
  });
}

export function useKitCollections(entitlementId: string | null) {
  return useQuery({
    queryKey: ['ims-kit-collections', entitlementId],
    queryFn: () => ImsKitService.collectionsForEntitlement(entitlementId!),
    enabled: !!entitlementId,
  });
}

export function useMyKit() {
  return useQuery({
    queryKey: ['ims-kit-my'],
    queryFn: () => ImsKitService.myKit(),
    staleTime: 30 * 1000,
  });
}

export function useKitBillingFlags(institutionId?: string) {
  return useQuery({
    queryKey: ['ims-kit-billing-flags', institutionId],
    queryFn: () => ImsKitService.billingFlags(institutionId),
    enabled: !!institutionId,
  });
}

export function useKitStores() {
  return useQuery({
    queryKey: ['ims-kit-stores'],
    queryFn: () => ImsKitService.getStores(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useKitInstitutions() {
  return useQuery({
    queryKey: ['ims-kit-institutions'],
    queryFn: () => ImsKitService.getInstitutions(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useKitPrograms(institutionId?: string) {
  return useQuery({
    queryKey: ['ims-kit-programs', institutionId],
    queryFn: () => ImsKitService.getPrograms(institutionId),
    staleTime: 10 * 60 * 1000,
  });
}

export function useKitDepartments(institutionId?: string) {
  return useQuery({
    queryKey: ['ims-kit-departments', institutionId],
    queryFn: () => ImsKitService.getDepartments(institutionId),
    staleTime: 10 * 60 * 1000,
  });
}
