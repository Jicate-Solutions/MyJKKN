import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BosSyllabusService } from '@/lib/services/bos/bos-syllabus-service';
import { BosCourseSyllabus, BosSyllabusListResponse, BosSyllabusFilters, CreateBosSyllabusDto, UpdateBosSyllabusDto } from '@/types/bos';

const SYLLABI_QUERY_KEY = ['bos', 'syllabi'];
const SYLLABUS_QUERY_KEY = ['bos', 'syllabus'];

/**
 * Hook for managing syllabus list with filtering and pagination.
 */
export function useBosSyllabi(filters: BosSyllabusFilters = {}) {
  return useQuery<BosSyllabusListResponse, Error>({
    queryKey: [...SYLLABI_QUERY_KEY, filters],
    queryFn: () => BosSyllabusService.getSyllabi(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook for fetching a single syllabus by ID.
 */
export function useBosSyllabus(id: string | undefined) {
  return useQuery<BosCourseSyllabus, Error>({
    queryKey: [...SYLLABUS_QUERY_KEY, id],
    queryFn: () => BosSyllabusService.getSyllabus(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for creating a new syllabus.
 */
export function useCreateBosSyllabus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBosSyllabusDto) => BosSyllabusService.createSyllabus(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: SYLLABI_QUERY_KEY,
      });
    },
  });
}

/**
 * Hook for updating a syllabus.
 */
export function useUpdateBosSyllabus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateBosSyllabusDto) =>
      BosSyllabusService.updateSyllabus(id, data),
    onSuccess: (updated) => {
      // Invalidate both list and single item cache
      queryClient.invalidateQueries({
        queryKey: SYLLABI_QUERY_KEY,
      });
      queryClient.setQueryData([...SYLLABUS_QUERY_KEY, id], updated);
    },
  });
}

/**
 * Hook for deleting (archiving) a syllabus.
 */
export function useDeleteBosSyllabus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BosSyllabusService.deleteSyllabus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: SYLLABI_QUERY_KEY,
      });
      queryClient.invalidateQueries({
        queryKey: SYLLABUS_QUERY_KEY,
      });
    },
  });
}

/**
 * Hook for duplicating courses across regulations.
 */
export function useDuplicateRegulation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: {
      institutions_id: string;
      source_regulation_id: string;
      target_regulation_id: string;
      courses: Array<{ source_course_code: string; target_course_code: string }>;
    }) =>
      BosSyllabusService.duplicateRegulation(request),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: SYLLABI_QUERY_KEY,
      });
    },
  });
}

/**
 * Hook for comparing two syllabus versions.
 */
export function useSyllabusComparison(id1: string | undefined, id2: string | undefined) {
  return useQuery({
    queryKey: ['bos', 'compare', id1, id2],
    queryFn: () =>
      BosSyllabusService.compareSyllabi(id1!, id2!),
    enabled: !!id1 && !!id2,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook for fetching syllabus history.
 */
export function useBosSyllabusHistory(courseCode: string | undefined) {
  return useQuery({
    queryKey: ['bos', 'history', courseCode],
    queryFn: () => BosSyllabusService.getSyllabusHistory(courseCode!),
    enabled: !!courseCode,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for exporting syllabus to PDF.
 */
export function useExportToPdf() {
  return useMutation({
    mutationFn: ({
      id,
      format,
      options,
    }: {
      id: string;
      format: 'official' | 'meeting_summary' | 'obe';
      options?: {
        include_mappings?: boolean;
        include_references?: boolean;
        include_pedagogy?: boolean;
      };
    }) => BosSyllabusService.exportToPdf(id, format, options),
  });
}
