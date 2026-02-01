// ============================================================================
// React Query hooks for Competency Mappings (Program & Course)
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import type {
  CompetencyProgramMapping,
  CompetencyCourseMapping,
  CompetencyListResponse,
  CompetencyProgramMappingFilters,
  CompetencyCourseMappingFilters,
  CreateCompetencyProgramMappingDTO,
  UpdateCompetencyProgramMappingDTO,
  CreateCompetencyCourseMappingDTO,
  UpdateCompetencyCourseMappingDTO,
  ProgramCompetencyCoverage,
  CourseCompetencyContribution
} from '@/types/competency';
import { CompetencyMappingService } from '@/lib/services/competency';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory for mappings
export const competencyMappingKeys = {
  // Program mappings
  programMappings: ['competency-program-mappings'] as const,
  programMappingList: (filters: CompetencyProgramMappingFilters) =>
    [...competencyMappingKeys.programMappings, 'list', filters] as const,
  programCoverage: (programId: string) =>
    [...competencyMappingKeys.programMappings, 'coverage', programId] as const,

  // Course mappings
  courseMappings: ['competency-course-mappings'] as const,
  courseMappingList: (filters: CompetencyCourseMappingFilters) =>
    [...competencyMappingKeys.courseMappings, 'list', filters] as const,
  courseContribution: (courseId: string) =>
    [...competencyMappingKeys.courseMappings, 'contribution', courseId] as const
};

// ============================================================================
// PROGRAM MAPPING HOOKS
// ============================================================================

/**
 * Get program competency mappings
 */
export function useProgramMappings(
  filters: CompetencyProgramMappingFilters = {}
): UseQueryResult<CompetencyListResponse<CompetencyProgramMapping>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: competencyMappingKeys.programMappingList(filters),
    queryFn: () => CompetencyMappingService.getProgramMappings(filters),
    enabled: !authLoading && !!profile && (!!filters.program_id || !!filters.competency_id),
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get program competency coverage analysis
 */
export function useProgramCoverage(
  programId: string
): UseQueryResult<ProgramCompetencyCoverage, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: competencyMappingKeys.programCoverage(programId),
    queryFn: () => CompetencyMappingService.getProgramCoverage(programId),
    enabled: !authLoading && !!profile && !!programId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Create program mapping mutation
 */
export function useCreateProgramMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCompetencyProgramMappingDTO) =>
      CompetencyMappingService.createProgramMapping(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: competencyMappingKeys.programMappings });
      queryClient.invalidateQueries({
        queryKey: competencyMappingKeys.programCoverage(variables.program_id)
      });
    }
  });
}

/**
 * Update program mapping mutation
 */
export function useUpdateProgramMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCompetencyProgramMappingDTO }) =>
      CompetencyMappingService.updateProgramMapping(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: competencyMappingKeys.programMappings });
    }
  });
}

/**
 * Delete program mapping mutation
 */
export function useDeleteProgramMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => CompetencyMappingService.deleteProgramMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: competencyMappingKeys.programMappings });
    }
  });
}

/**
 * Bulk map competencies to program
 */
export function useBulkMapToProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      programId,
      competencyIds,
      requiredLevel,
      isMandatory
    }: {
      programId: string;
      competencyIds: string[];
      requiredLevel: string;
      isMandatory?: boolean;
    }) =>
      CompetencyMappingService.bulkMapToProgram(
        programId,
        competencyIds,
        requiredLevel,
        isMandatory
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: competencyMappingKeys.programMappings });
      queryClient.invalidateQueries({
        queryKey: competencyMappingKeys.programCoverage(variables.programId)
      });
    }
  });
}

// ============================================================================
// COURSE MAPPING HOOKS
// ============================================================================

/**
 * Get course competency mappings
 */
export function useCourseMappings(
  filters: CompetencyCourseMappingFilters = {}
): UseQueryResult<CompetencyListResponse<CompetencyCourseMapping>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: competencyMappingKeys.courseMappingList(filters),
    queryFn: () => CompetencyMappingService.getCourseMappings(filters),
    enabled: !authLoading && !!profile && (!!filters.course_id || !!filters.competency_id),
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get course competency contribution summary
 */
export function useCourseContribution(
  courseId: string
): UseQueryResult<CourseCompetencyContribution, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: competencyMappingKeys.courseContribution(courseId),
    queryFn: () => CompetencyMappingService.getCourseContribution(courseId),
    enabled: !authLoading && !!profile && !!courseId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Create course mapping mutation
 */
export function useCreateCourseMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCompetencyCourseMappingDTO) =>
      CompetencyMappingService.createCourseMapping(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: competencyMappingKeys.courseMappings });
      queryClient.invalidateQueries({
        queryKey: competencyMappingKeys.courseContribution(variables.course_id)
      });
    }
  });
}

/**
 * Update course mapping mutation
 */
export function useUpdateCourseMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCompetencyCourseMappingDTO }) =>
      CompetencyMappingService.updateCourseMapping(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: competencyMappingKeys.courseMappings });
    }
  });
}

/**
 * Delete course mapping mutation
 */
export function useDeleteCourseMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => CompetencyMappingService.deleteCourseMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: competencyMappingKeys.courseMappings });
    }
  });
}

/**
 * Bulk map competencies to course
 */
export function useBulkMapToCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      courseId,
      competencyIds,
      contributionLevel,
      assessmentMethod
    }: {
      courseId: string;
      competencyIds: string[];
      contributionLevel?: string;
      assessmentMethod?: string;
    }) =>
      CompetencyMappingService.bulkMapToCourse(
        courseId,
        competencyIds,
        contributionLevel,
        assessmentMethod
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: competencyMappingKeys.courseMappings });
      queryClient.invalidateQueries({
        queryKey: competencyMappingKeys.courseContribution(variables.courseId)
      });
    }
  });
}
