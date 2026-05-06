import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BosSyllabusService } from '@/lib/services/bos/bos-syllabus-service';
import { BosRegulationTaxonomy } from '@/types/bos';

const TAXONOMY_QUERY_KEY = ['bos', 'taxonomy'];

/**
 * Hook for fetching taxonomy for a regulation.
 * Includes: K-values (Finks/Blooms), Programme Outcomes (POs), Programme Specific Outcomes (PSOs).
 */
export function useBosTaxonomy(regulationId: string | undefined) {
  return useQuery<BosRegulationTaxonomy, Error>({
    queryKey: [...TAXONOMY_QUERY_KEY, regulationId],
    queryFn: () => BosSyllabusService.getTaxonomy(regulationId!),
    enabled: !!regulationId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook for creating or updating taxonomy for a regulation.
 */
export function useSaveBosTaxonomy(regulationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<BosRegulationTaxonomy, 'id' | 'created_at'>) =>
      BosSyllabusService.saveTaxonomy(regulationId, data),
    onSuccess: (updated) => {
      queryClient.setQueryData([...TAXONOMY_QUERY_KEY, regulationId], updated);
      // Invalidate all syllabus queries since taxonomy affects course content validation
      queryClient.invalidateQueries({
        queryKey: ['bos', 'syllabi'],
      });
    },
  });
}

/**
 * Hook for managing K-values for a taxonomy.
 * Returns the current K-values and mutation to update them.
 */
export function useKValues(regulationId: string | undefined) {
  const { data: taxonomy } = useBosTaxonomy(regulationId);
  const saveMutation = useSaveBosTaxonomy(regulationId!);

  return {
    kValues: (taxonomy?.k_values || {}) as Record<string, string>,
    isLoading: !taxonomy,
    updateKValues: (newKValues: Record<string, string>) => {
      if (!taxonomy) return;
      return saveMutation.mutate({
        ...taxonomy,
        k_values: newKValues,
      });
    },
    isSaving: saveMutation.isPending,
    error: saveMutation.error,
  };
}

/**
 * Hook for managing Programme Outcomes (POs) for a taxonomy.
 */
export function useProgrammeOutcomes(regulationId: string | undefined) {
  const { data: taxonomy } = useBosTaxonomy(regulationId);
  const saveMutation = useSaveBosTaxonomy(regulationId!);

  return {
    pos: (taxonomy?.pos || {}) as Record<string, string>,
    isLoading: !taxonomy,
    updatePos: (newPos: Record<string, string>) => {
      if (!taxonomy) return;
      return saveMutation.mutate({
        ...taxonomy,
        pos: newPos,
      });
    },
    isSaving: saveMutation.isPending,
    error: saveMutation.error,
  };
}

/**
 * Hook for managing Programme Specific Outcomes (PSOs) for a taxonomy.
 */
export function useProgrammeSpecificOutcomes(regulationId: string | undefined) {
  const { data: taxonomy } = useBosTaxonomy(regulationId);
  const saveMutation = useSaveBosTaxonomy(regulationId!);

  return {
    psos: (taxonomy?.psos || {}) as Record<string, string>,
    isLoading: !taxonomy,
    updatePsos: (newPsos: Record<string, string>) => {
      if (!taxonomy) return;
      return saveMutation.mutate({
        ...taxonomy,
        psos: newPsos,
      });
    },
    isSaving: saveMutation.isPending,
    error: saveMutation.error,
  };
}

/**
 * Hook for initializing default taxonomy for a regulation.
 * Provides predefined frameworks (Finks, Blooms) for quick setup.
 */
export function useInitializeTaxonomy(regulationId: string) {
  const saveMutation = useSaveBosTaxonomy(regulationId);

  return {
    initializeFinks: () => {
      return saveMutation.mutate({
        taxonomy_type: 'finks',
        k_values: {
          K1: 'Foundation Knowledge',
          K2: 'Application',
          K3: 'Integration',
          K4: 'Human Dimension',
          K5: 'Caring',
          K6: 'Learning How to Learn',
        },
        pos: {
          PO1: 'Engineering knowledge',
          PO2: 'Problem analysis',
          PO3: 'Design/development of solutions',
          PO4: 'Conduct investigations of complex problems',
          PO5: 'Modern tool usage',
          PO6: 'The engineer and society',
          PO7: 'Environment and sustainability',
          PO8: 'Ethics',
          PO9: 'Individual and team work',
          PO10: 'Communication',
          PO11: 'Project management and finance',
          PO12: 'Lifelong learning',
        },
        psos: undefined,
      });
    },
    initializeBlooms: () => {
      return saveMutation.mutate({
        taxonomy_type: 'blooms',
        k_values: {
          K1: 'Remember',
          K2: 'Understand',
          K3: 'Apply',
          K4: 'Analyze',
          K5: 'Evaluate',
          K6: 'Create',
        },
        pos: {
          PO1: 'Knowledge',
          PO2: 'Comprehension',
          PO3: 'Application',
          PO4: 'Analysis',
          PO5: 'Synthesis',
          PO6: 'Evaluation',
        },
        psos: undefined,
      });
    },
    isSaving: saveMutation.isPending,
    error: saveMutation.error,
  };
}
