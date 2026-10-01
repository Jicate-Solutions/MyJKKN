'use client';

/**
 * HR intake helper — React Query hooks over lib/hr/intake/api-client.ts.
 *
 * The helper prepares, a person decides. These hooks only read and record
 * decisions; nothing is filed into MyJKKN until `useApplyIntake` runs.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DecideRequest } from '@/types/hr-intake';
import {
  acceptHighConfidence,
  applyIntakeBatch,
  createIntakeBatch,
  decideIntakeRow,
  deleteIntakeRule,
  discardIntakeBatch,
  getIntakeBatch,
  listIntakeBatches,
  listIntakeRules,
  type DecideOutcome,
  type IntakeBatchDetail,
} from '@/lib/hr/intake/api-client';

export const intakeKeys = {
  all: ['hr-intake'] as const,
  batches: () => [...intakeKeys.all, 'batches'] as const,
  batch: (id: string) => [...intakeKeys.all, 'batch', id] as const,
  rules: () => [...intakeKeys.all, 'rules'] as const,
};

export function useIntakeBatches() {
  return useQuery({
    queryKey: intakeKeys.batches(),
    queryFn: listIntakeBatches,
  });
}

export function useIntakeBatch(batchId: string) {
  return useQuery({
    queryKey: intakeKeys.batch(batchId),
    queryFn: () => getIntakeBatch(batchId),
    enabled: !!batchId,
  });
}

export function useCreateIntakeBatch() {
  const qc = useQueryClient();
  return useMutation({
    retry: false, // never re-send: a retried upload would make a second batch
    mutationFn: createIntakeBatch,
    onSuccess: () => qc.invalidateQueries({ queryKey: intakeKeys.batches() }),
  });
}

/** Records one person's decision and swaps the returned row into the cache. */
export function useDecideIntakeRow(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false, // never re-send: a retried upload would make a second batch
    mutationFn: ({ rowId, req }: { rowId: string; req: DecideRequest }) =>
      decideIntakeRow(rowId, req),
    onSuccess: ({ row, ruleError }: DecideOutcome) => {
      // The decision stands even when the correction could not be remembered; say so.
      if (ruleError) toast.warning(`Decision saved, but it could not be remembered for next time: ${ruleError}`);
      qc.setQueryData<IntakeBatchDetail>(intakeKeys.batch(batchId), (prev) =>
        prev
          ? { ...prev, rows: prev.rows.map((r) => (r.id === row.id ? row : r)) }
          : prev,
      );
      qc.invalidateQueries({ queryKey: intakeKeys.batches() });
      // A correction may have created or changed a learned rule.
      qc.invalidateQueries({ queryKey: intakeKeys.rules() });
    },
  });
}

export function useAcceptHighConfidence(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false, // never re-send: a retried upload would make a second batch
    mutationFn: () => acceptHighConfidence(batchId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: intakeKeys.batch(batchId) });
      qc.invalidateQueries({ queryKey: intakeKeys.batches() });
    },
  });
}

export function useApplyIntake(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false, // never re-send: a retried upload would make a second batch
    mutationFn: (rowIds?: string[]) => applyIntakeBatch(batchId, rowIds),
    // Refresh even after a failure: some rows may have been filed before it.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: intakeKeys.batch(batchId) });
      qc.invalidateQueries({ queryKey: intakeKeys.batches() });
    },
  });
}

/** Discards a batch, then refreshes the list it no longer belongs to. */
export function useDiscardIntakeBatch(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false, // never re-send: a retried upload would make a second batch
    mutationFn: () => discardIntakeBatch(batchId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: intakeKeys.batch(batchId) });
      qc.invalidateQueries({ queryKey: intakeKeys.batches() });
    },
  });
}

export function useIntakeRules() {
  return useQuery({
    queryKey: intakeKeys.rules(),
    queryFn: listIntakeRules,
  });
}

export function useDeleteIntakeRule() {
  const qc = useQueryClient();
  return useMutation({
    retry: false, // never re-send: a retried upload would make a second batch
    mutationFn: deleteIntakeRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: intakeKeys.rules() }),
  });
}
