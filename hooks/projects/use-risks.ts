'use client';

/**
 * RAID (Risks & Issues) — React Query Hooks
 *
 * Wraps RiskService + IssueService. Risk/issue mutations invalidate their own
 * keys; "create task from step" also invalidates task + project keys (a new task
 * rolls up into the project).
 *
 * Pattern: hooks/projects/use-projects.ts + use-tasks.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RiskService, IssueService } from '@/lib/services/projects/risk-service';
import { projectKeys } from '@/hooks/projects/use-projects';
import { taskKeys } from '@/hooks/projects/use-tasks';
import type { ProjectRiskMitigationStep } from '@/types/projects';
import type {
  RiskFilters,
  ProjectRiskInsert,
  ProjectRiskUpdate,
  IssueFilters,
  ProjectIssueInsert,
  ProjectIssueUpdate,
  MitigationStepInsert,
  MitigationStepUpdate,
  EscalationInsert,
} from '@/types/projects-risks';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const riskKeys = {
  all: ['project-risks'] as const,
  lists: () => [...riskKeys.all, 'list'] as const,
  list: (filters: RiskFilters) => [...riskKeys.lists(), filters] as const,
  byProject: (projectId: string) => [...riskKeys.lists(), 'project', projectId] as const,
  details: () => [...riskKeys.all, 'detail'] as const,
  detail: (id: string) => [...riskKeys.details(), id] as const,
  mitigationSteps: (riskId: string) => [...riskKeys.detail(riskId), 'mitigation-steps'] as const,
  escalations: (riskId: string) => [...riskKeys.detail(riskId), 'escalations'] as const,
};

export const issueKeys = {
  all: ['project-issues'] as const,
  lists: () => [...issueKeys.all, 'list'] as const,
  list: (filters: IssueFilters) => [...issueKeys.lists(), filters] as const,
  details: () => [...issueKeys.all, 'detail'] as const,
  detail: (id: string) => [...issueKeys.details(), id] as const,
};

// ─── Risk Queries ───────────────────────────────────────────────────────────────

export function useRisks(projectId: string | null | undefined, filters: RiskFilters = {}) {
  const merged: RiskFilters = { ...filters, projectId: projectId ?? filters.projectId ?? null };
  return useQuery({
    queryKey: riskKeys.list(merged),
    queryFn: () => RiskService.listRisks(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

export function useRisk(id: string | null | undefined) {
  return useQuery({
    queryKey: riskKeys.detail(id ?? ''),
    queryFn: () => RiskService.getRisk(getSupabase(), id as string),
    enabled: !!id,
  });
}

export function useMitigationSteps(riskId: string | null | undefined) {
  return useQuery({
    queryKey: riskKeys.mitigationSteps(riskId ?? ''),
    queryFn: () => RiskService.listMitigationSteps(getSupabase(), riskId as string),
    enabled: !!riskId,
  });
}

export function useEscalations(riskId: string | null | undefined) {
  return useQuery({
    queryKey: riskKeys.escalations(riskId ?? ''),
    queryFn: () => RiskService.listEscalations(getSupabase(), riskId as string),
    enabled: !!riskId,
  });
}

// ─── Risk Mutations ─────────────────────────────────────────────────────────────

function invalidateRiskLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: riskKeys.lists() });
}

export function useCreateRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectRiskInsert) =>
      RiskService.createRisk(getSupabase(), input),
    onSuccess: () => invalidateRiskLists(queryClient),
  });
}

export function useUpdateRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectRiskUpdate }) =>
      RiskService.updateRisk(getSupabase(), id, input),
    onSuccess: (risk) => {
      invalidateRiskLists(queryClient);
      queryClient.invalidateQueries({ queryKey: riskKeys.detail(risk.id) });
    },
  });
}

export function useDeleteRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RiskService.deleteRisk(getSupabase(), id),
    onSuccess: () => invalidateRiskLists(queryClient),
  });
}

export function useEscalateRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EscalationInsert) =>
      RiskService.escalateRisk(getSupabase(), input),
    onSuccess: ({ risk }) => {
      invalidateRiskLists(queryClient);
      queryClient.invalidateQueries({ queryKey: riskKeys.detail(risk.id) });
      queryClient.invalidateQueries({ queryKey: riskKeys.escalations(risk.id) });
    },
  });
}

// ─── Mitigation-step Mutations ──────────────────────────────────────────────────

export function useAddMitigationStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MitigationStepInsert) =>
      RiskService.addMitigationStep(getSupabase(), input),
    onSuccess: (step) => {
      queryClient.invalidateQueries({ queryKey: riskKeys.mitigationSteps(step.risk_id) });
    },
  });
}

export function useUpdateMitigationStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MitigationStepUpdate }) =>
      RiskService.updateMitigationStep(getSupabase(), id, input),
    onSuccess: (step) => {
      queryClient.invalidateQueries({ queryKey: riskKeys.mitigationSteps(step.risk_id) });
    },
  });
}

export function useDeleteMitigationStep(riskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RiskService.deleteMitigationStep(getSupabase(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: riskKeys.mitigationSteps(riskId) });
    },
  });
}

/** Create a linked project task from a mitigation step; back-links the task id. */
export function useCreateTaskFromStep(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (step: ProjectRiskMitigationStep) =>
      RiskService.createTaskFromStep(getSupabase(), step, projectId),
    onSuccess: ({ step }) => {
      queryClient.invalidateQueries({ queryKey: riskKeys.mitigationSteps(step.risk_id) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ─── Issue Queries ──────────────────────────────────────────────────────────────

export function useIssues(projectId: string | null | undefined, filters: IssueFilters = {}) {
  const merged: IssueFilters = { ...filters, projectId: projectId ?? filters.projectId ?? null };
  return useQuery({
    queryKey: issueKeys.list(merged),
    queryFn: () => IssueService.listIssues(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

export function useIssue(id: string | null | undefined) {
  return useQuery({
    queryKey: issueKeys.detail(id ?? ''),
    queryFn: () => IssueService.getIssue(getSupabase(), id as string),
    enabled: !!id,
  });
}

// ─── Issue Mutations ────────────────────────────────────────────────────────────

function invalidateIssueLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectIssueInsert) =>
      IssueService.createIssue(getSupabase(), input),
    onSuccess: () => invalidateIssueLists(queryClient),
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectIssueUpdate }) =>
      IssueService.updateIssue(getSupabase(), id, input),
    onSuccess: (issue) => {
      invalidateIssueLists(queryClient);
      queryClient.invalidateQueries({ queryKey: issueKeys.detail(issue.id) });
    },
  });
}

export function useResolveIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      resolutionNotes,
      statusKey,
    }: {
      id: string;
      resolutionNotes?: string | null;
      statusKey?: string;
    }) => IssueService.resolveIssue(getSupabase(), id, resolutionNotes ?? null, statusKey),
    onSuccess: (issue) => {
      invalidateIssueLists(queryClient);
      queryClient.invalidateQueries({ queryKey: issueKeys.detail(issue.id) });
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => IssueService.deleteIssue(getSupabase(), id),
    onSuccess: () => invalidateIssueLists(queryClient),
  });
}
