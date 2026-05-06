import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BosSyllabusService } from '@/lib/services/bos/bos-syllabus-service';
import { BosCourseSyllabus } from '@/types/bos';

/**
 * Hook for creating a new revision of an existing syllabus.
 * Handles: marking old version as non-latest, creating new version with incremented version_number.
 */
export function useReviseBosSyllabus(currentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: {
      updated_content: Record<string, unknown>;
      revision_notes?: string;
    }) =>
      fetch(`/api/bos/syllabi/${currentId}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Revision failed' }));
          throw new Error(err.error ?? 'Failed to revise syllabus');
        }
        return res.json() as Promise<BosCourseSyllabus>;
      }),
    onSuccess: () => {
      // Invalidate all syllabus queries to refresh lists and history
      queryClient.invalidateQueries({
        queryKey: ['bos', 'syllabi'],
      });
      queryClient.invalidateQueries({
        queryKey: ['bos', 'history'],
      });
      queryClient.invalidateQueries({
        queryKey: ['bos', 'syllabus'],
      });
    },
  });
}

/**
 * Hook for batch duplicating courses to a new regulation.
 * Scenario: R-2024 courses (24UGTA01-04) → R-2025 courses (25UGTA01-04)
 */
export function useBatchDuplicate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: {
      institutions_id: string;
      source_regulation_id: string;
      target_regulation_id: string;
      courses: Array<{ source_course_code: string; target_course_code: string }>;
    }) =>
      fetch('/api/bos/syllabi/duplicate-regulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Duplication failed' }));
          throw new Error(err.error ?? 'Failed to duplicate courses');
        }
        return res.json() as Promise<BosCourseSyllabus[]>;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['bos', 'syllabi'],
      });
    },
  });
}

/**
 * Hook for comparing two syllabus versions with change tracking.
 */
export function useSyllabusCompare(id1: string | undefined, id2: string | undefined) {
  return useQuery({
    queryKey: ['bos', 'compare', id1, id2],
    queryFn: async () => {
      const res = await fetch('/api/bos/syllabi/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syllabus_id_1: id1,
          syllabus_id_2: id2,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Comparison failed' }));
        throw new Error(err.error ?? 'Failed to compare syllabi');
      }

      return res.json();
    },
    enabled: !!id1 && !!id2,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook for handling PDF export with format selection.
 * Formats: 'official' (complete), 'meeting_summary' (changes), 'obe' (lesson planning)
 */
export function usePdfExport(syllabusId: string | undefined) {
  return useMutation({
    mutationFn: async (params: {
      format: 'official' | 'meeting_summary' | 'obe';
      include_mappings?: boolean;
      include_references?: boolean;
      include_pedagogy?: boolean;
    }) => {
      const queryParams = new URLSearchParams({
        format: params.format,
        ...Object.fromEntries(
          Object.entries({
            include_mappings: params.include_mappings,
            include_references: params.include_references,
            include_pedagogy: params.include_pedagogy,
          }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
        ),
      });

      const res = await fetch(`/api/bos/syllabi/${syllabusId}/export-pdf?${queryParams}`, {
        method: 'GET',
      });

      if (!res.ok) {
        throw new Error('Failed to export PDF');
      }

      return res.text();
    },
  });
}

/**
 * Hook for tracking before/after syllabus versions for meeting documentation.
 */
export function useBeforeAfterComparison(beforeId: string | undefined, afterId: string | undefined) {
  return useQuery({
    queryKey: ['bos', 'before-after', beforeId, afterId],
    queryFn: async () => {
      if (!beforeId || !afterId) throw new Error('Both IDs required');

      const res = await fetch('/api/bos/syllabi/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syllabus_id_1: beforeId,
          syllabus_id_2: afterId,
        }),
      });

      if (!res.ok) throw new Error('Failed to compare');
      return res.json();
    },
    enabled: !!beforeId && !!afterId,
    staleTime: 10 * 60 * 1000,
  });
}
