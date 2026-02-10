// hooks/admission/use-screening-exams.ts
// React Query hooks for screening exams

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ScreeningExamService,
  type ScreeningExamRow,
  type CreateScreeningExamInput,
  type UpdateScreeningExamInput,
  type ScreeningExamFilters,
} from '@/lib/services/admission/screening-exam-service';

// Query keys
export const screeningExamKeys = {
  all: ['admission-screening-exams'] as const,
  lists: () => [...screeningExamKeys.all, 'list'] as const,
  list: (institutionId: string, filters?: ScreeningExamFilters) =>
    [...screeningExamKeys.lists(), institutionId, filters] as const,
  detail: (examId: string) => [...screeningExamKeys.all, 'detail', examId] as const,
  names: (institutionId: string) => [...screeningExamKeys.all, 'names', institutionId] as const,
  stats: (institutionId: string, examName?: string) =>
    [...screeningExamKeys.all, 'stats', institutionId, examName] as const,
};

/**
 * Hook to fetch all screening exams for an institution
 */
export function useScreeningExams(institutionId?: string, filters?: ScreeningExamFilters) {
  const query = useQuery({
    queryKey: screeningExamKeys.list(institutionId || '', filters),
    queryFn: () => ScreeningExamService.getExams(institutionId!, filters),
    enabled: !!institutionId,
  });

  return {
    exams: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single screening exam
 */
export function useScreeningExam(examId?: string) {
  const query = useQuery({
    queryKey: screeningExamKeys.detail(examId || ''),
    queryFn: () => ScreeningExamService.getExam(examId!),
    enabled: !!examId,
  });

  return {
    exam: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * Hook to fetch distinct exam names for filtering
 */
export function useScreeningExamNames(institutionId?: string) {
  const query = useQuery({
    queryKey: screeningExamKeys.names(institutionId || ''),
    queryFn: () => ScreeningExamService.getExamNames(institutionId!),
    enabled: !!institutionId,
  });

  return {
    examNames: query.data || [],
    isLoading: query.isLoading,
  };
}

/**
 * Hook to fetch screening exam stats
 */
export function useScreeningExamStats(institutionId?: string, examName?: string) {
  const query = useQuery({
    queryKey: screeningExamKeys.stats(institutionId || '', examName),
    queryFn: () => ScreeningExamService.getStats(institutionId!, examName),
    enabled: !!institutionId,
  });

  return {
    stats: query.data || {
      total: 0,
      completed: 0,
      inProgress: 0,
      qualified: 0,
      avgScore: 0,
    },
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Hook to create a new screening exam
 */
export function useCreateScreeningExam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateScreeningExamInput) => ScreeningExamService.createExam(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screeningExamKeys.all });
      toast.success('Screening exam created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create exam: ${error.message}`);
    },
  });
}

/**
 * Hook to update a screening exam
 */
export function useUpdateScreeningExam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ examId, updates }: { examId: string; updates: UpdateScreeningExamInput }) =>
      ScreeningExamService.updateExam(examId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screeningExamKeys.all });
      toast.success('Exam updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update exam: ${error.message}`);
    },
  });
}
