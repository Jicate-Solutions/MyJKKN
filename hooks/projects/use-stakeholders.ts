'use client';

/**
 * Stakeholder & Status-Report — React Query Hooks
 *
 * Wraps StakeholderService + StatusReportService with React Query caching and
 * cache invalidation.  Stakeholder mutations invalidate their own keys;
 * status-report mutations also invalidate project-level keys so that RAG
 * roll-ups are refreshed.
 *
 * Pattern: hooks/projects/use-risks.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F8.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  StakeholderService,
  StatusReportService,
} from '@/lib/services/projects/stakeholder-service';
import { projectKeys } from '@/hooks/projects/use-projects';
import type {
  StakeholderFilters,
  StakeholderInsert,
  StakeholderUpdate,
  StatusReportFilters,
  StatusReportInsert,
  StatusReportUpdate,
} from '@/components/projects/stakeholders/types';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const stakeholderKeys = {
  all: ['project-stakeholders'] as const,
  lists: () => [...stakeholderKeys.all, 'list'] as const,
  list: (filters: StakeholderFilters) =>
    [...stakeholderKeys.lists(), filters] as const,
  byProject: (projectId: string) =>
    [...stakeholderKeys.lists(), 'project', projectId] as const,
  details: () => [...stakeholderKeys.all, 'detail'] as const,
  detail: (id: string) => [...stakeholderKeys.details(), id] as const,
};

export const statusReportKeys = {
  all: ['project-status-reports'] as const,
  lists: () => [...statusReportKeys.all, 'list'] as const,
  list: (filters: StatusReportFilters) =>
    [...statusReportKeys.lists(), filters] as const,
  byProject: (projectId: string) =>
    [...statusReportKeys.lists(), 'project', projectId] as const,
  details: () => [...statusReportKeys.all, 'detail'] as const,
  detail: (id: string) => [...statusReportKeys.details(), id] as const,
};

// ─── Stakeholder Queries ─────────────────────────────────────────────────────────

export function useStakeholders(
  projectId: string | null | undefined,
  filters: StakeholderFilters = {}
) {
  const merged: StakeholderFilters = {
    ...filters,
    projectId: projectId ?? filters.projectId ?? null,
  };
  return useQuery({
    queryKey: stakeholderKeys.list(merged),
    queryFn: () => StakeholderService.listStakeholders(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

export function useStakeholder(id: string | null | undefined) {
  return useQuery({
    queryKey: stakeholderKeys.detail(id ?? ''),
    queryFn: () =>
      StakeholderService.getStakeholder(getSupabase(), id as string),
    enabled: !!id,
  });
}

// ─── Stakeholder Mutations ────────────────────────────────────────────────────────

function invalidateStakeholderLists(
  queryClient: ReturnType<typeof useQueryClient>
) {
  queryClient.invalidateQueries({ queryKey: stakeholderKeys.lists() });
}

export function useCreateStakeholder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StakeholderInsert) =>
      StakeholderService.createStakeholder(getSupabase(), input),
    onSuccess: () => invalidateStakeholderLists(queryClient),
  });
}

export function useUpdateStakeholder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: StakeholderUpdate;
    }) => StakeholderService.updateStakeholder(getSupabase(), id, input),
    onSuccess: (stakeholder) => {
      invalidateStakeholderLists(queryClient);
      queryClient.invalidateQueries({
        queryKey: stakeholderKeys.detail(stakeholder.id),
      });
    },
  });
}

export function useDeleteStakeholder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      StakeholderService.deleteStakeholder(getSupabase(), id),
    onSuccess: () => invalidateStakeholderLists(queryClient),
  });
}

// ─── Status Report Queries ────────────────────────────────────────────────────────

export function useStatusReports(
  projectId: string | null | undefined,
  filters: StatusReportFilters = {}
) {
  const merged: StatusReportFilters = {
    ...filters,
    projectId: projectId ?? filters.projectId ?? null,
  };
  return useQuery({
    queryKey: statusReportKeys.list(merged),
    queryFn: () =>
      StatusReportService.listStatusReports(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

export function useStatusReport(id: string | null | undefined) {
  return useQuery({
    queryKey: statusReportKeys.detail(id ?? ''),
    queryFn: () =>
      StatusReportService.getStatusReport(getSupabase(), id as string),
    enabled: !!id,
  });
}

// ─── Status Report Mutations ──────────────────────────────────────────────────────

function invalidateStatusReportLists(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId?: string
) {
  queryClient.invalidateQueries({ queryKey: statusReportKeys.lists() });
  // Status-report RAG changes may affect project-level roll-ups.
  if (projectId) {
    queryClient.invalidateQueries({
      queryKey: projectKeys.detail(projectId),
    });
  }
}

export function useCreateStatusReport(projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StatusReportInsert) =>
      StatusReportService.createStatusReport(getSupabase(), input),
    onSuccess: () => invalidateStatusReportLists(queryClient, projectId),
  });
}

export function useUpdateStatusReport(projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: StatusReportUpdate;
    }) => StatusReportService.updateStatusReport(getSupabase(), id, input),
    onSuccess: (report) => {
      invalidateStatusReportLists(queryClient, projectId);
      queryClient.invalidateQueries({
        queryKey: statusReportKeys.detail(report.id),
      });
    },
  });
}

export function useDeleteStatusReport(projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      StatusReportService.deleteStatusReport(getSupabase(), id),
    onSuccess: () => invalidateStatusReportLists(queryClient, projectId),
  });
}
