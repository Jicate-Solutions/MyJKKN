'use client';

/**
 * Closure & Lessons Learned — React Query Hooks
 *
 * Wraps ClosureService.  Closure-report mutations invalidate their own key.
 * Lesson mutations invalidate the lessons list; the suggested-lessons panel
 * is read-only (no mutation) and uses its own stable query key.
 *
 * Pattern: hooks/projects/use-risks.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F15.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ClosureService } from '@/lib/services/projects/closure-service';
import type {
  ClosureReportInsert,
  ClosureReportUpdate,
  LessonLearnedInsert,
  LessonLearnedUpdate,
} from '@/lib/services/projects/closure-service';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const closureKeys = {
  all: ['project-closure'] as const,
  report: (projectId: string) => [...closureKeys.all, 'report', projectId] as const,
  lessons: (projectId: string) => [...closureKeys.all, 'lessons', projectId] as const,
  suggested: (projectId: string, projectTypeId: string | null | undefined) =>
    [...closureKeys.all, 'suggested', projectId, projectTypeId ?? 'none'] as const,
};

// ─── Closure Report Queries ─────────────────────────────────────────────────────

export function useClosureReport(projectId: string | null | undefined) {
  return useQuery({
    queryKey: closureKeys.report(projectId ?? ''),
    queryFn: () => ClosureService.getReport(getSupabase(), projectId as string),
    enabled: !!projectId,
  });
}

// ─── Closure Report Mutations ───────────────────────────────────────────────────

export function useUpsertClosureReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClosureReportInsert) =>
      ClosureService.upsertReport(getSupabase(), input),
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: closureKeys.report(report.project_id) });
    },
  });
}

export function useUpdateClosureReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, projectId }: { id: string; input: ClosureReportUpdate; projectId: string }) =>
      ClosureService.updateReport(getSupabase(), id, input),
    onSuccess: (_report, variables) => {
      queryClient.invalidateQueries({ queryKey: closureKeys.report(variables.projectId) });
    },
  });
}

/** Finalize the report — once finalized, the form enters read-only mode. */
export function useFinalizeClosureReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, finalizedBy }: { id: string; finalizedBy?: string | null }) =>
      ClosureService.finalizeReport(getSupabase(), id, finalizedBy ?? null),
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: closureKeys.report(report.project_id) });
    },
  });
}

// ─── Lessons Queries ────────────────────────────────────────────────────────────

export function useLessonsLearned(projectId: string | null | undefined) {
  return useQuery({
    queryKey: closureKeys.lessons(projectId ?? ''),
    queryFn: () => ClosureService.listLessons(getSupabase(), projectId as string),
    enabled: !!projectId,
  });
}

/** Suggested lessons from other projects of the same type. */
export function useSuggestedLessons(
  projectId: string | null | undefined,
  projectTypeId: string | null | undefined
) {
  return useQuery({
    queryKey: closureKeys.suggested(projectId ?? '', projectTypeId),
    queryFn: () =>
      ClosureService.suggestedLessons(
        getSupabase(),
        projectId as string,
        projectTypeId
      ),
    enabled: !!projectId,
  });
}

// ─── Lessons Mutations ──────────────────────────────────────────────────────────

export function useAddLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LessonLearnedInsert) =>
      ClosureService.addLesson(getSupabase(), input),
    onSuccess: (lesson) => {
      queryClient.invalidateQueries({ queryKey: closureKeys.lessons(lesson.project_id ?? '') });
    },
  });
}

export function useUpdateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, projectId }: { id: string; input: LessonLearnedUpdate; projectId: string }) =>
      ClosureService.updateLesson(getSupabase(), id, input),
    onSuccess: (_lesson, variables) => {
      queryClient.invalidateQueries({ queryKey: closureKeys.lessons(variables.projectId) });
    },
  });
}

export function useDeleteLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
      ClosureService.deleteLesson(getSupabase(), id),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: closureKeys.lessons(variables.projectId) });
    },
  });
}
