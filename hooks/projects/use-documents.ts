'use client';

/**
 * Documents & Decisions — React Query Hooks
 *
 * Wraps DocumentService for attachments (project_task_attachments) and
 * decision log entries (project_activity_feed with entity_type='decision').
 *
 * Pattern: hooks/projects/use-risks.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F7.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { DocumentService } from '@/lib/services/projects/document-service';
import type {
  AttachmentFilters,
  AttachmentInsert,
  DecisionFilters,
  DecisionEntryInsert,
} from '@/lib/services/projects/document-service';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const documentKeys = {
  all: ['project-documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (filters: AttachmentFilters) => [...documentKeys.lists(), filters] as const,
  byProject: (projectId: string) => [...documentKeys.lists(), 'project', projectId] as const,
  details: () => [...documentKeys.all, 'detail'] as const,
  detail: (id: string) => [...documentKeys.details(), id] as const,
  versionHistory: (id: string) => [...documentKeys.detail(id), 'version-history'] as const,
};

export const decisionKeys = {
  all: ['project-decisions'] as const,
  lists: () => [...decisionKeys.all, 'list'] as const,
  list: (filters: DecisionFilters) => [...decisionKeys.lists(), filters] as const,
  byProject: (projectId: string) => [...decisionKeys.lists(), 'project', projectId] as const,
};

// ─── Attachment Queries ───────────────────────────────────────────────────────

export function useAttachments(
  projectId: string | null | undefined,
  filters: AttachmentFilters = {}
) {
  const merged: AttachmentFilters = {
    ...filters,
    projectId: projectId ?? filters.projectId ?? null,
  };
  return useQuery({
    queryKey: documentKeys.list(merged),
    queryFn: () => DocumentService.listAttachments(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

export function useAttachment(id: string | null | undefined) {
  return useQuery({
    queryKey: documentKeys.detail(id ?? ''),
    queryFn: () => DocumentService.getAttachment(getSupabase(), id as string),
    enabled: !!id,
  });
}

export function useVersionHistory(id: string | null | undefined) {
  return useQuery({
    queryKey: documentKeys.versionHistory(id ?? ''),
    queryFn: () => DocumentService.getVersionHistory(getSupabase(), id as string),
    enabled: !!id,
  });
}

// ─── Attachment Mutations ─────────────────────────────────────────────────────

function invalidateAttachmentLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
}

export function useCreateAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AttachmentInsert) =>
      DocumentService.createAttachment(getSupabase(), input),
    onSuccess: () => invalidateAttachmentLists(queryClient),
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => DocumentService.deleteAttachment(getSupabase(), id),
    onSuccess: () => invalidateAttachmentLists(queryClient),
  });
}

// ─── Decision Queries ─────────────────────────────────────────────────────────

export function useDecisions(
  projectId: string | null | undefined,
  filters: DecisionFilters = {}
) {
  const merged: DecisionFilters = {
    ...filters,
    projectId: projectId ?? filters.projectId ?? null,
  };
  return useQuery({
    queryKey: decisionKeys.list(merged),
    queryFn: () => DocumentService.listDecisions(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

// ─── Decision Mutations ───────────────────────────────────────────────────────

function invalidateDecisionLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: decisionKeys.lists() });
}

export function useAddDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DecisionEntryInsert) =>
      DocumentService.addDecision(getSupabase(), input),
    onSuccess: () => invalidateDecisionLists(queryClient),
  });
}
