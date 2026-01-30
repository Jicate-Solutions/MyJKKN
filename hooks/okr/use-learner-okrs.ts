// hooks/okr/use-learner-okrs.ts
// React Query hooks for Learner-specific OKRs (Core + Elective)

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import {
  LearnerCoreOKR,
  LearnerOKRAssignment,
  LearnerElectiveOKR,
  CreateLearnerElectiveOKRDTO
} from '@/types/okr';
import { OKRLearnerService } from '@/lib/services/okr';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory for learner OKRs
export const learnerOKRKeys = {
  all: ['okr-learner'] as const,
  coreOKRs: (institutionId: string, filters?: object) =>
    [...learnerOKRKeys.all, 'core', institutionId, filters] as const,
  myAssigned: (academicYear?: string, semester?: string) =>
    [...learnerOKRKeys.all, 'my-assigned', academicYear, semester] as const,
  myElective: () => [...learnerOKRKeys.all, 'my-elective'] as const,
  electiveDetail: (id: string) => [...learnerOKRKeys.all, 'elective', id] as const,
  allMine: () => [...learnerOKRKeys.all, 'all-mine'] as const,
  dashboard: () => [...learnerOKRKeys.all, 'dashboard'] as const
};

/**
 * Get core OKRs for an institution
 */
export function useCoreOKRs(
  institutionId: string,
  filters: {
    departmentId?: string;
    programId?: string;
    semester?: string;
    isActive?: boolean;
  } = {}
): UseQueryResult<LearnerCoreOKR[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerOKRKeys.coreOKRs(institutionId, filters),
    queryFn: () => OKRLearnerService.getCoreOKRs(institutionId, filters),
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.STABLE_DATA // Core OKRs are defined by institution, rarely change
  });
}

/**
 * Get current learner's assigned core OKRs
 */
export function useMyAssignedOKRs(
  academicYear?: string,
  semester?: string
): UseQueryResult<LearnerOKRAssignment[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerOKRKeys.myAssigned(academicYear, semester),
    queryFn: () => OKRLearnerService.getMyAssignedOKRs(academicYear, semester),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Update assigned OKR progress
 */
export function useUpdateAssignedProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assignmentId,
      newValue
    }: {
      assignmentId: string;
      newValue: number;
    }) => OKRLearnerService.updateAssignedOKRProgress(assignmentId, newValue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.myAssigned() });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.allMine() });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.dashboard() });
    }
  });
}

/**
 * Get current learner's elective OKRs
 */
export function useMyElectiveOKRs(): UseQueryResult<LearnerElectiveOKR[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerOKRKeys.myElective(),
    queryFn: () => OKRLearnerService.getMyElectiveOKRs(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get a single elective OKR by ID
 */
export function useElectiveOKR(id: string): UseQueryResult<LearnerElectiveOKR, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerOKRKeys.electiveDetail(id),
    queryFn: () => OKRLearnerService.getElectiveOKRById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Create elective OKR
 */
export function useCreateElectiveOKR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLearnerElectiveOKRDTO) =>
      OKRLearnerService.createElectiveOKR(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.myElective() });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.allMine() });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.dashboard() });
    }
  });
}

/**
 * Update elective OKR
 */
export function useUpdateElectiveOKR(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<CreateLearnerElectiveOKRDTO>) =>
      OKRLearnerService.updateElectiveOKR(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.electiveDetail(id) });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.myElective() });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.allMine() });
    }
  });
}

/**
 * Update elective OKR progress
 */
export function useUpdateElectiveProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, newValue }: { id: string; newValue: number }) =>
      OKRLearnerService.updateElectiveOKRProgress(id, newValue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.myElective() });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.allMine() });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.dashboard() });
    }
  });
}

/**
 * Delete (deactivate) elective OKR
 */
export function useDeleteElectiveOKR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => OKRLearnerService.deleteElectiveOKR(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.myElective() });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.allMine() });
      queryClient.invalidateQueries({ queryKey: learnerOKRKeys.dashboard() });
    }
  });
}

/**
 * Get all OKRs for current learner (combined core + elective)
 */
export function useAllMyOKRs(): UseQueryResult<
  {
    core: LearnerOKRAssignment[];
    elective: LearnerElectiveOKR[];
    summary: {
      total: number;
      onTrack: number;
      atRisk: number;
      behind: number;
      completed: number;
    };
  },
  Error
> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerOKRKeys.allMine(),
    queryFn: () => OKRLearnerService.getAllMyOKRs(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get learner OKR dashboard data
 */
export function useLearnerDashboard(): UseQueryResult<
  {
    coreProgress: number;
    electiveProgress: number;
    overallProgress: number;
    nextDeadline: string | null;
    streak: number;
  },
  Error
> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerOKRKeys.dashboard(),
    queryFn: () => OKRLearnerService.getLearnerDashboard(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}
