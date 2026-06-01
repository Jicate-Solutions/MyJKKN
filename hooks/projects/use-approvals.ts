'use client';

/**
 * Approval Workflows + Requests — React Query Hooks
 *
 * Wraps ApprovalWorkflowService and ApprovalRequestService.
 * Workflow mutations invalidate workflow keys; request mutations invalidate
 * request keys.
 *
 * Pattern: hooks/projects/use-risks.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F9.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  ApprovalWorkflowService,
  ApprovalRequestService,
} from '@/lib/services/projects/approval-service';
import type {
  WorkflowFilters,
  WorkflowInsert,
  WorkflowUpdate,
  RequestFilters,
  RequestInsert,
  ActOnRequestInput,
} from '@/lib/services/projects/approval-service';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const workflowKeys = {
  all: ['project-approval-workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (filters: WorkflowFilters) => [...workflowKeys.lists(), filters] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
};

export const requestKeys = {
  all: ['project-approval-requests'] as const,
  lists: () => [...requestKeys.all, 'list'] as const,
  list: (filters: RequestFilters) => [...requestKeys.lists(), filters] as const,
  byProject: (projectId: string) =>
    [...requestKeys.lists(), 'project', projectId] as const,
  details: () => [...requestKeys.all, 'detail'] as const,
  detail: (id: string) => [...requestKeys.details(), id] as const,
};

// ─── Workflow Queries ────────────────────────────────────────────────────────

export function useWorkflows(filters: WorkflowFilters = {}) {
  return useQuery({
    queryKey: workflowKeys.list(filters),
    queryFn: () => ApprovalWorkflowService.listWorkflows(getSupabase(), filters),
  });
}

export function useWorkflow(id: string | null | undefined) {
  return useQuery({
    queryKey: workflowKeys.detail(id ?? ''),
    queryFn: () => ApprovalWorkflowService.getWorkflow(getSupabase(), id as string),
    enabled: !!id,
  });
}

// ─── Workflow Mutations ──────────────────────────────────────────────────────

function invalidateWorkflowLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkflowInsert) =>
      ApprovalWorkflowService.createWorkflow(getSupabase(), input),
    onSuccess: () => invalidateWorkflowLists(queryClient),
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: WorkflowUpdate }) =>
      ApprovalWorkflowService.updateWorkflow(getSupabase(), id, input),
    onSuccess: (workflow) => {
      invalidateWorkflowLists(queryClient);
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflow.id) });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ApprovalWorkflowService.deleteWorkflow(getSupabase(), id),
    onSuccess: () => invalidateWorkflowLists(queryClient),
  });
}

// ─── Request Queries ─────────────────────────────────────────────────────────

export function useApprovalRequests(
  projectId: string | null | undefined,
  filters: RequestFilters = {}
) {
  const merged: RequestFilters = {
    ...filters,
    projectId: projectId ?? filters.projectId ?? null,
  };
  return useQuery({
    queryKey: requestKeys.list(merged),
    queryFn: () => ApprovalRequestService.listRequests(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

export function useApprovalRequest(id: string | null | undefined) {
  return useQuery({
    queryKey: requestKeys.detail(id ?? ''),
    queryFn: () => ApprovalRequestService.getRequest(getSupabase(), id as string),
    enabled: !!id,
  });
}

// ─── Request Mutations ───────────────────────────────────────────────────────

function invalidateRequestLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: requestKeys.lists() });
}

export function useCreateApprovalRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestInsert) =>
      ApprovalRequestService.createRequest(getSupabase(), input),
    onSuccess: () => invalidateRequestLists(queryClient),
  });
}

export function useActOnRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ActOnRequestInput }) =>
      ApprovalRequestService.actOnRequest(getSupabase(), id, input),
    onSuccess: (request) => {
      invalidateRequestLists(queryClient);
      queryClient.invalidateQueries({ queryKey: requestKeys.detail(request.id) });
    },
  });
}

export function useDeleteApprovalRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ApprovalRequestService.deleteRequest(getSupabase(), id),
    onSuccess: () => invalidateRequestLists(queryClient),
  });
}
