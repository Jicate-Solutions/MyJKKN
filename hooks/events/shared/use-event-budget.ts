// hooks/events/shared/use-event-budget.ts
// React Query hooks for the shared event budget + finance sign-off workflow (Events Platform Promotion PR2).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventBudgetService } from '@/lib/services/events/shared/event-budget-service';
import type { MarathonBudgetItem, CreateMarathonBudgetItemDto } from '@/types/events-marathon';

const KEYS_ROOT = ['event-budget'] as const;

const KEYS = {
  all: ['event-budget'] as const,
  items: (eventId: string) => [...KEYS.all, 'items', eventId] as const,
  summary: (eventId: string) => [...KEYS.all, 'summary', eventId] as const,
  approval: (eventId: string) => [...KEYS.all, 'approval', eventId] as const,
  unsettled: (eventId: string) => [...KEYS_ROOT, 'unsettled', eventId] as const,
  // The catalogue is the same list for everyone and changes rarely — not keyed
  // by event, and cached for the session.
  categories: [...KEYS_ROOT, 'categories'] as const,
};

async function budgetAttachmentRequest(
  eventId: string,
  init: RequestInit & { query?: string }
): Promise<unknown> {
  const res = await fetch(
    `/api/events/${eventId}/budget-attachment${init.query ?? ''}`,
    init
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || 'Attachment request failed');
  return body;
}

/** Attach (or replace) a budget line's bill / quotation on Google Drive (BUG-004627). */
export function useUploadBudgetAttachment(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, file }: { itemId: string; file: File }) => {
      const form = new FormData();
      form.append('item_id', itemId);
      form.append('file', file);
      return budgetAttachmentRequest(eventId, { method: 'POST', body: form });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.items(eventId) });
      toast.success('Attachment uploaded');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to upload attachment'),
  });
}

export function useRemoveBudgetAttachment(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      budgetAttachmentRequest(eventId, {
        method: 'DELETE',
        query: `?item_id=${encodeURIComponent(itemId)}`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.items(eventId) });
      toast.success('Attachment removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove attachment'),
  });
}

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

/**
 * The fixed category list a budget line picks from. Free text produced 33
 * category strings across 41 lines, so nothing could be totalled across events.
 */
export function useEventBudgetCategories() {
  return useQuery({
    queryKey: KEYS.categories,
    queryFn: () => EventBudgetService.getCategories(),
    staleTime: 10 * 60_000,
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

/**
 * Lines with no final figure yet. Drives both the "Close the books" button's
 * label and the dialog that answers them.
 */
export function useEventBudgetUnsettled(eventId: string) {
  return useQuery({
    queryKey: KEYS.unsettled(eventId),
    queryFn: () => EventBudgetService.getUnsettledLines(eventId),
    enabled: !!eventId,
  });
}

export function useSettleEventBudgetLine(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      actual,
      nothingSpent,
    }: {
      itemId: string;
      actual: number;
      nothingSpent?: boolean;
    }) => EventBudgetService.settleLine(itemId, actual, nothingSpent ?? false),
    onSuccess: () => {
      invalidateAll(qc, eventId);
      qc.invalidateQueries({ queryKey: KEYS.unsettled(eventId) });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save that figure'),
  });
}

export function useCloseEventBudget(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => EventBudgetService.closeBudget(eventId),
    onSuccess: () => {
      invalidateAll(qc, eventId);
      qc.invalidateQueries({ queryKey: KEYS.unsettled(eventId) });
      toast.success('Books closed — this is now on the record as what the event cost');
    },
    // The database refuses by NAMING the unanswered lines, so show that rather
    // than a generic failure.
    onError: (e: Error) => toast.error(e.message || 'Could not close the books'),
  });
}

/** What the event cost and what it cost per head. */
export function useEventBudgetOutcome(eventId: string) {
  return useQuery({
    queryKey: [...KEYS_ROOT, 'outcome', eventId] as const,
    queryFn: () => EventBudgetService.getOutcome(eventId),
    enabled: !!eventId,
  });
}

export function useEventSpendByCommittee(eventId: string) {
  return useQuery({
    queryKey: [...KEYS_ROOT, 'by-committee', eventId] as const,
    queryFn: () => EventBudgetService.getSpendByCommittee(eventId),
    enabled: !!eventId,
  });
}

/** What each category usually costs per head, across events with closed books. */
export function useEventCategoryBenchmark(eventId: string) {
  return useQuery({
    queryKey: [...KEYS_ROOT, 'benchmark', eventId] as const,
    queryFn: () => EventBudgetService.getCategoryBenchmark(eventId),
    enabled: !!eventId,
    staleTime: 5 * 60_000,
  });
}
