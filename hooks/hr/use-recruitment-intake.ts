'use client';

/**
 * HR intake helper — React Query hooks over lib/hr/intake/api-client.ts.
 *
 * The helper prepares, a person decides. These hooks only read and record
 * decisions; nothing is filed into MyJKKN until `useApplyIntake` runs.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DecideRequest, IntakeRow } from '@/types/hr-intake';
import {
  acceptHighConfidence,
  applyIntakeBatch,
  createIntakeBatch,
  decideIntakeRow,
  deleteIntakeRule,
  getIntakeBatch,
  listIntakeBatches,
  listIntakeRules,
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
    mutationFn: createIntakeBatch,
    onSuccess: () => qc.invalidateQueries({ queryKey: intakeKeys.batches() }),
  });
}

/** Records one person's decision and swaps the returned row into the cache. */
export function useDecideIntakeRow(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rowId, req }: { rowId: string; req: DecideRequest }) =>
      decideIntakeRow(rowId, req),
    onSuccess: (row: IntakeRow) => {
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
    mutationFn: (rowIds?: string[]) => applyIntakeBatch(batchId, rowIds),
    // Refresh even after a failure: some rows may have been filed before it.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: intakeKeys.batch(batchId) });
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
    mutationFn: deleteIntakeRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: intakeKeys.rules() }),
  });
}
