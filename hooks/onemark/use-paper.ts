// hooks/onemark/use-paper.ts
// React Query hooks for the OneMark paper wizard. Thin wrappers over
// PaperService (a fetch client); every read is an API round-trip so the
// answer-key boundary stays server-side.

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PaperService,
  type CreatePaperInput,
  type UpdatePaperInput,
} from '@/lib/services/onemark/paper-service';

export const paperKeys = {
  all: ['onemark', 'paper'] as const,
  exams: () => [...paperKeys.all, 'exams'] as const,
  list: (examId?: string) => [...paperKeys.all, 'list', examId ?? 'all'] as const,
  bank: (examId: string) => [...paperKeys.all, 'bank', examId] as const,
  paper: (id: string) => [...paperKeys.all, 'one', id] as const,
};

export function useOneMarkExams() {
  return useQuery({
    queryKey: paperKeys.exams(),
    queryFn: () => PaperService.listExams(),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePapers(examId?: string) {
  return useQuery({
    queryKey: paperKeys.list(examId),
    queryFn: () => PaperService.listPapers(examId),
  });
}

export function usePaperBank(examId: string | null) {
  return useQuery({
    queryKey: paperKeys.bank(examId ?? ''),
    queryFn: () => PaperService.getBank(examId as string),
    enabled: Boolean(examId),
    staleTime: 60 * 1000,
  });
}

export function usePaper(id: string | null) {
  return useQuery({
    queryKey: paperKeys.paper(id ?? ''),
    queryFn: () => PaperService.getPaper(id as string),
    enabled: Boolean(id),
  });
}

export function useCreatePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePaperInput) => PaperService.createPaper(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...paperKeys.all, 'list'] });
    },
  });
}

export function useUpdatePaper(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePaperInput) => PaperService.updatePaper(id as string, input),
    onSuccess: (data) => {
      if (id) qc.setQueryData(paperKeys.paper(id), data);
      qc.invalidateQueries({ queryKey: [...paperKeys.all, 'list'] });
      // A finalized paper changes the "recently used" set for the next one.
      if (data?.paper?.config?.state === 'FINALIZED') {
        qc.invalidateQueries({ queryKey: [...paperKeys.all, 'bank'] });
      }
    },
  });
}

export function useDeletePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => PaperService.deletePaper(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...paperKeys.all, 'list'] });
    },
  });
}
