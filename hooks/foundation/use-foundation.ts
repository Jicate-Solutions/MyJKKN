// hooks/foundation/use-foundation.ts
// React Query hooks for the Foundation & Competitive-Exam Programme.
// Mirrors hooks/use-session-feedback.ts (queryKeys object + thin useQuery/
// useMutation wrappers over the static FoundationService). Reads are RLS-scoped
// through the browser client; scoring/plan writes go through SECURITY DEFINER
// RPCs and invalidate the affected student's diagnostic caches on success.

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FoundationService,
  type AddLearnerToCohortInput,
  type CreateAssessmentInput,
  type CreateItemInput,
  type ExamLevel,
  type ItemFlagResolution,
  type ListItemFlagsFilters,
  type RecordAttemptResponse,
} from '@/lib/services/foundation/foundation-service';

export const foundationKeys = {
  all: ['foundation'] as const,
  examDefinitions: (level?: ExamLevel) =>
    [...foundationKeys.all, 'exam-definitions', level ?? 'all'] as const,
  topics: () => [...foundationKeys.all, 'topics'] as const,
  cohorts: () => [...foundationKeys.all, 'cohorts'] as const,
  roster: (cohortId: string) =>
    [...foundationKeys.all, 'roster', cohortId] as const,
  student: (studentId: string) =>
    [...foundationKeys.all, 'student', studentId] as const,
  studentExams: (studentId: string) =>
    [...foundationKeys.all, 'student-exams', studentId] as const,
  items: (examDefinitionId: string) =>
    [...foundationKeys.all, 'items', examDefinitionId] as const,
  assessments: (cohortId: string) =>
    [...foundationKeys.all, 'assessments', cohortId] as const,
  weakness: (studentId: string, examDefinitionId: string) =>
    [...foundationKeys.all, 'weakness', studentId, examDefinitionId] as const,
  revisionPlans: (studentId: string, examDefinitionId: string) =>
    [...foundationKeys.all, 'revision-plans', studentId, examDefinitionId] as const,
  progress: (studentId: string, examDefinitionId: string) =>
    [...foundationKeys.all, 'progress', studentId, examDefinitionId] as const,
  itemFlags: (filters: ListItemFlagsFilters) =>
    [
      ...foundationKeys.all,
      'item-flags',
      filters.status ?? 'any',
      filters.examDefinitionId ?? 'any',
      filters.itemId ?? 'any',
    ] as const,
};

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export function useExamDefinitions(level?: ExamLevel) {
  return useQuery({
    queryKey: foundationKeys.examDefinitions(level),
    queryFn: () => FoundationService.listExamDefinitions(level),
    staleTime: 10 * 60 * 1000,
  });
}

export function useTopics() {
  return useQuery({
    queryKey: foundationKeys.topics(),
    queryFn: () => FoundationService.listTopics(),
    staleTime: 10 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Cohorts + roster
// ---------------------------------------------------------------------------

export function useCohorts() {
  return useQuery({
    queryKey: foundationKeys.cohorts(),
    queryFn: () => FoundationService.listCohorts(),
    staleTime: 60 * 1000,
  });
}

export function useRoster(cohortId: string | null) {
  return useQuery({
    queryKey: foundationKeys.roster(cohortId ?? ''),
    queryFn: () => FoundationService.getRoster(cohortId as string),
    enabled: !!cohortId,
    staleTime: 30 * 1000,
  });
}

/**
 * Put a learner on the programme and into a cohort.
 *
 * Invalidates that cohort's roster AND the cohort list, because the list card
 * carries an enrolled_count that is now stale.
 */
export function useAddLearnerToCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddLearnerToCohortInput) =>
      FoundationService.addLearnerToCohort(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({
        queryKey: foundationKeys.roster(input.cohort_id),
      });
      qc.invalidateQueries({ queryKey: foundationKeys.cohorts() });
    },
  });
}

/**
 * Assign (or clear) a cohort's resource person. A cohort with none is
 * unreachable by the facilitation screen, which scopes to the caller.
 */
export function useSetCohortResourcePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cohortId,
      resourcePersonId,
    }: {
      cohortId: string;
      resourcePersonId: string | null;
    }) => FoundationService.setCohortResourcePerson(cohortId, resourcePersonId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: foundationKeys.cohorts() });
    },
  });
}

export function useStudent(studentId: string | null) {
  return useQuery({
    queryKey: foundationKeys.student(studentId ?? ''),
    queryFn: () => FoundationService.getStudent(studentId as string),
    enabled: !!studentId,
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Item authoring
// ---------------------------------------------------------------------------

export function useStudentExams(studentId: string | null) {
  return useQuery({
    queryKey: foundationKeys.studentExams(studentId ?? ''),
    queryFn: () => FoundationService.getStudentExams(studentId as string),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useItems(examDefinitionId: string | null) {
  return useQuery({
    queryKey: foundationKeys.items(examDefinitionId ?? ''),
    queryFn: () => FoundationService.listItems(examDefinitionId as string),
    enabled: !!examDefinitionId,
    staleTime: 30 * 1000,
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateItemInput) => FoundationService.createItem(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({
        queryKey: foundationKeys.items(input.exam_definition_id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Assessment building
// ---------------------------------------------------------------------------

export function useAssessments(cohortId: string | null) {
  return useQuery({
    queryKey: foundationKeys.assessments(cohortId ?? ''),
    queryFn: () => FoundationService.listAssessments(cohortId as string),
    enabled: !!cohortId,
    staleTime: 30 * 1000,
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssessmentInput) =>
      FoundationService.createAssessment(input),
    onSuccess: (_data, input) => {
      if (input.cohort_id) {
        qc.invalidateQueries({
          queryKey: foundationKeys.assessments(input.cohort_id),
        });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Diagnostic: weakness map, revision plans, progress
// ---------------------------------------------------------------------------

export function useWeaknessMap(
  studentId: string | null,
  examDefinitionId: string | null,
) {
  return useQuery({
    queryKey: foundationKeys.weakness(studentId ?? '', examDefinitionId ?? ''),
    queryFn: () =>
      FoundationService.getWeaknessMap(
        studentId as string,
        examDefinitionId as string,
      ),
    enabled: !!studentId && !!examDefinitionId,
    staleTime: 30 * 1000,
  });
}

export function useRevisionPlans(
  studentId: string | null,
  examDefinitionId: string | null,
) {
  return useQuery({
    queryKey: foundationKeys.revisionPlans(
      studentId ?? '',
      examDefinitionId ?? '',
    ),
    queryFn: () =>
      FoundationService.getRevisionPlans(
        studentId as string,
        examDefinitionId as string,
      ),
    enabled: !!studentId && !!examDefinitionId,
    staleTime: 30 * 1000,
  });
}

export function useStudentProgress(
  studentId: string | null,
  examDefinitionId: string | null,
) {
  return useQuery({
    queryKey: foundationKeys.progress(studentId ?? '', examDefinitionId ?? ''),
    queryFn: () =>
      FoundationService.getProgress(
        studentId as string,
        examDefinitionId as string,
      ),
    enabled: !!studentId && !!examDefinitionId,
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Privileged RPC mutations
// ---------------------------------------------------------------------------

function invalidateDiagnostic(
  qc: ReturnType<typeof useQueryClient>,
  studentId: string,
  examDefinitionId: string,
) {
  qc.invalidateQueries({
    queryKey: foundationKeys.weakness(studentId, examDefinitionId),
  });
  qc.invalidateQueries({
    queryKey: foundationKeys.revisionPlans(studentId, examDefinitionId),
  });
  qc.invalidateQueries({
    queryKey: foundationKeys.progress(studentId, examDefinitionId),
  });
}

export function useRecordAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      assessmentId: string;
      studentId: string;
      responses: RecordAttemptResponse[];
      examDefinitionId?: string;
    }) =>
      FoundationService.recordAttempt(
        vars.assessmentId,
        vars.studentId,
        vars.responses,
      ),
    onSuccess: (_data, vars) => {
      if (vars.examDefinitionId) {
        invalidateDiagnostic(qc, vars.studentId, vars.examDefinitionId);
      }
    },
  });
}

export function useRecomputeWeakness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { studentId: string; examDefinitionId: string }) =>
      FoundationService.recomputeWeakness(vars.studentId, vars.examDefinitionId),
    onSuccess: (_data, vars) =>
      invalidateDiagnostic(qc, vars.studentId, vars.examDefinitionId),
  });
}

export function useGenerateRevisionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { studentId: string; examDefinitionId: string }) =>
      FoundationService.generateRevisionPlan(
        vars.studentId,
        vars.examDefinitionId,
      ),
    onSuccess: (_data, vars) =>
      invalidateDiagnostic(qc, vars.studentId, vars.examDefinitionId),
  });
}

// ---------------------------------------------------------------------------
// Reported questions
// ---------------------------------------------------------------------------

export function useItemFlags(
  filters: ListItemFlagsFilters,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: foundationKeys.itemFlags(filters),
    queryFn: () => FoundationService.listItemFlags(filters),
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

/** Invalidate every reported-question list, whatever filter it was read under. */
function invalidateItemFlags(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({
    queryKey: [...foundationKeys.all, 'item-flags'],
  });
}

export function useRaiseItemFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { itemId: string; reason?: string | null }) =>
      FoundationService.raiseItemFlag(vars.itemId, vars.reason ?? null),
    onSuccess: () => invalidateItemFlags(qc),
  });
}

export function useResolveItemFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { flagId: string; status: ItemFlagResolution }) =>
      FoundationService.resolveItemFlag(vars.flagId, vars.status),
    // A closed report changes what counts toward mastery, so the diagnostic
    // caches are stale too — but only after a recompute writes the new numbers.
    onSuccess: () => invalidateItemFlags(qc),
  });
}
