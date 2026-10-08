'use client';

// hooks/instasolver/use-instasolver.ts
//
// React Query hooks for the InstaSolver module. Every key starts with
// 'instasolver', and every mutation invalidates that whole prefix: a status
// move changes lists, counts, the triage queue, the dashboard and the timeline
// at once, and a stale count is how a queue silently lies.

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import { InstaSolverRequirementService } from '@/lib/services/instasolver/requirement-service';
import { InstaSolverReferenceService } from '@/lib/services/instasolver/reference-service';
import { InstaSolverActivityService } from '@/lib/services/instasolver/activity-service';
import { InstaSolverStatsService } from '@/lib/services/instasolver/stats-service';
import type {
  CategoryKind,
  EntityType,
  IssueFilters,
  RequirementFilters,
  TriageFilters,
  WorkTab,
  WorkloadFilters
} from '@/types/instasolver';

const STABLE = { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000 };
const DYNAMIC = { staleTime: 30 * 1000, gcTime: 5 * 60 * 1000 };

export const instasolverKeys = {
  all: ['instasolver'] as const,
  access: ['instasolver', 'access'] as const,
  issues: (f: IssueFilters) => ['instasolver', 'issues', f] as const,
  issue: (id: number) => ['instasolver', 'issue', id] as const,
  triage: (f: TriageFilters) => ['instasolver', 'triage', f] as const,
  work: (tab: WorkTab, page: number) => ['instasolver', 'work', tab, page] as const,
  workCounts: ['instasolver', 'work-counts'] as const,
  requirements: (f: RequirementFilters) => ['instasolver', 'requirements', f] as const,
  requirement: (id: number) => ['instasolver', 'requirement', id] as const,
  activity: (t: EntityType, id: number) => ['instasolver', 'activity', t, id] as const,
  notes: (t: EntityType, id: number) => ['instasolver', 'notes', t, id] as const,
  institutions: ['instasolver', 'institutions'] as const,
  categories: (k: CategoryKind, activeOnly: boolean) => ['instasolver', 'categories', k, activeOnly] as const,
  teams: (activeOnly: boolean) => ['instasolver', 'teams', activeOnly] as const,
  teamsWithMembers: ['instasolver', 'teams-with-members'] as const,
  categoryMembers: (id: number) => ['instasolver', 'category-members', id] as const,
  people: (term: string) => ['instasolver', 'people', term] as const,
  dashboard: ['instasolver', 'dashboard'] as const,
  analytics: (days: number) => ['instasolver', 'analytics', days] as const,
  workload: (f: WorkloadFilters) => ['instasolver', 'workload', f] as const,
  adminOverview: ['instasolver', 'admin-overview'] as const
};

/**
 * A mutation that toasts its outcome and refreshes everything InstaSolver.
 * The error toast shows the database's own sentence — the guards word each
 * refusal for the person reading it.
 */
export function useInstaSolverMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  successMessage?: string | ((result: TResult, vars: TVars) => string)
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: instasolverKeys.all });
      if (successMessage) {
        toast.success(typeof successMessage === 'function' ? successMessage(result, vars) : successMessage);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'That did not go through');
    }
  });
}

// ---------------------------------------------------------------------------
// Who am I to this module
// ---------------------------------------------------------------------------
export function useInstaSolverAccess() {
  return useQuery({ queryKey: instasolverKeys.access, queryFn: () => InstaSolverStatsService.access(), ...STABLE });
}

export function useReporterProfile() {
  return useQuery({
    queryKey: ['instasolver', 'reporter-profile'],
    queryFn: () => InstaSolverStatsService.reporterProfile(),
    ...STABLE
  });
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------
export function useIssues(filters: IssueFilters) {
  return useQuery({
    queryKey: instasolverKeys.issues(filters),
    queryFn: () => InstaSolverIssueService.list(filters),
    placeholderData: keepPreviousData,
    ...DYNAMIC
  });
}

export function useIssue(id: number) {
  return useQuery({
    queryKey: instasolverKeys.issue(id),
    queryFn: () => InstaSolverIssueService.getById(id),
    enabled: Number.isFinite(id) && id > 0,
    ...DYNAMIC
  });
}

export function useTriageQueue(filters: TriageFilters) {
  return useQuery({
    queryKey: instasolverKeys.triage(filters),
    queryFn: () => InstaSolverIssueService.triageQueue(filters),
    placeholderData: keepPreviousData,
    ...DYNAMIC
  });
}

export function useWorkQueue(tab: WorkTab, page = 1) {
  return useQuery({
    queryKey: instasolverKeys.work(tab, page),
    queryFn: () => InstaSolverIssueService.workQueue(tab, page),
    placeholderData: keepPreviousData,
    ...DYNAMIC
  });
}

export function useWorkTabCounts() {
  return useQuery({
    queryKey: instasolverKeys.workCounts,
    queryFn: () => InstaSolverIssueService.workTabCounts(),
    ...DYNAMIC
  });
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------
export function useRequirements(filters: RequirementFilters) {
  return useQuery({
    queryKey: instasolverKeys.requirements(filters),
    queryFn: () => InstaSolverRequirementService.list(filters),
    placeholderData: keepPreviousData,
    ...DYNAMIC
  });
}

export function useRequirement(id: number) {
  return useQuery({
    queryKey: instasolverKeys.requirement(id),
    queryFn: () => InstaSolverRequirementService.getById(id),
    enabled: Number.isFinite(id) && id > 0,
    ...DYNAMIC
  });
}

// ---------------------------------------------------------------------------
// Timeline and notes
// ---------------------------------------------------------------------------
export function useActivity(type: EntityType, id: number) {
  return useQuery({
    queryKey: instasolverKeys.activity(type, id),
    queryFn: () => InstaSolverActivityService.forEntity(type, id),
    enabled: id > 0,
    ...DYNAMIC
  });
}

export function useNotes(type: EntityType, id: number) {
  return useQuery({
    queryKey: instasolverKeys.notes(type, id),
    queryFn: () => InstaSolverActivityService.notes(type, id),
    enabled: id > 0,
    ...DYNAMIC
  });
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
export function useInstitutions() {
  return useQuery({
    queryKey: instasolverKeys.institutions,
    queryFn: () => InstaSolverReferenceService.institutions(),
    ...STABLE
  });
}

export function useCategories(kind: CategoryKind, activeOnly = true) {
  return useQuery({
    queryKey: instasolverKeys.categories(kind, activeOnly),
    queryFn: () => InstaSolverReferenceService.categories(kind, activeOnly),
    ...STABLE
  });
}

export function useTeams(activeOnly = true) {
  return useQuery({
    queryKey: instasolverKeys.teams(activeOnly),
    queryFn: () => InstaSolverReferenceService.teams(activeOnly),
    ...STABLE
  });
}

export function useTeamsWithMembers() {
  return useQuery({
    queryKey: instasolverKeys.teamsWithMembers,
    queryFn: () => InstaSolverReferenceService.teamsWithMembers(false),
    ...DYNAMIC
  });
}

export function useCategoryMembers(categoryId: number | null | undefined) {
  return useQuery({
    queryKey: instasolverKeys.categoryMembers(categoryId ?? 0),
    queryFn: () => InstaSolverReferenceService.membersForCategory(categoryId as number),
    enabled: !!categoryId,
    ...STABLE
  });
}

export function usePeopleSearch(term: string) {
  return useQuery({
    queryKey: instasolverKeys.people(term),
    queryFn: () => InstaSolverReferenceService.searchPeople(term),
    enabled: term.trim().length >= 2,
    ...STABLE
  });
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------
export function useDashboardStats() {
  return useQuery({ queryKey: instasolverKeys.dashboard, queryFn: () => InstaSolverStatsService.dashboard(), ...DYNAMIC });
}

export function useNextSteps(want: { manager: boolean; maintenance: boolean; reporter: boolean }, enabled = true) {
  return useQuery({
    queryKey: ['instasolver', 'next-steps', want],
    queryFn: () => InstaSolverIssueService.nextSteps(want),
    enabled,
    ...DYNAMIC,
    refetchOnWindowFocus: true
  });
}

export function useWorkStatusCounts(enabled = true) {
  return useQuery({
    queryKey: ['instasolver', 'work-status-counts'],
    queryFn: () => InstaSolverIssueService.workStatusCounts(),
    enabled,
    ...DYNAMIC
  });
}

export function useAnalytics(days: number, enabled = true) {
  return useQuery({
    queryKey: instasolverKeys.analytics(days),
    queryFn: () => InstaSolverStatsService.analytics(days),
    enabled,
    ...DYNAMIC
  });
}

export function useWorkload(filters: WorkloadFilters, enabled = true) {
  return useQuery({
    queryKey: instasolverKeys.workload(filters),
    queryFn: () => InstaSolverStatsService.workload(filters),
    enabled,
    ...DYNAMIC
  });
}

export function useAdminOverview(enabled = true) {
  return useQuery({
    queryKey: instasolverKeys.adminOverview,
    queryFn: () => InstaSolverStatsService.adminOverview(),
    enabled,
    ...DYNAMIC
  });
}
