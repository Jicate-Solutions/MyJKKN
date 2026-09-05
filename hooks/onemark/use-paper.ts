// hooks/onemark/use-paper.ts
// React Query hooks for the OneMark paper wizard. Mirrors
// hooks/foundation/use-foundation.ts (a keys object + thin wrappers over the
// static service). Every read goes through the API route, which is where the
// answer key is stripped — the browser never touches fp_items itself.

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PaperService,
  type ActionResult,
  type PaperAction,
  type PaperDetail,
  type WizardReference,
} from '@/lib/services/onemark/paper-service';

export const paperKeys = {
  all: ['onemark', 'paper'] as const,
  reference: (examDefinitionId: string | null) =>
    [...paperKeys.all, 'reference', examDefinitionId ?? 'none'] as const,
  detail: (paperId: string) => [...paperKeys.all, 'detail', paperId] as const,
};

export function usePaperReference(examDefinitionId: string | null) {
  return useQuery<WizardReference>({
    queryKey: paperKeys.reference(examDefinitionId),
    queryFn: () => PaperService.reference(examDefinitionId),
    staleTime: 30_000,
  });
}

export function usePaper(paperId: string | null) {
  return useQuery<PaperDetail>({
    queryKey: paperKeys.detail(paperId ?? ''),
    queryFn: () => PaperService.get(paperId as string),
    enabled: !!paperId,
  });
}

export function useCreatePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { exam_definition_id: string; title: string }) =>
      PaperService.create(input),
    onSuccess: (paper) => {
      qc.setQueryData(paperKeys.detail(paper.id), paper);
      qc.invalidateQueries({ queryKey: [...paperKeys.all, 'reference'] });
    },
  });
}

export function usePaperAction(paperId: string | null) {
  const qc = useQueryClient();
  return useMutation<ActionResult, Error, PaperAction>({
    mutationFn: (action) => PaperService.act(paperId as string, action),
    onSuccess: (result) => {
      qc.setQueryData(paperKeys.detail(result.paper.id), result.paper);
      qc.invalidateQueries({ queryKey: [...paperKeys.all, 'reference'] });
    },
  });
}
