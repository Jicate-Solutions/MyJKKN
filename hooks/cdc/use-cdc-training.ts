// hooks/cdc/use-cdc-training.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { TrainingService } from '@/lib/services/cdc/training-service';
import type {
  CreateTrainingProgrammeDto,
  UpdateTrainingProgrammeDto,
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
  TrainingProgrammeFilters,
  EnrollmentFilters,
} from '@/types/cdc/training';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

export function useCdcTrainingTypes() {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['cdc-training-types'],
    queryFn: () => TrainingService.getTrainingTypes(),
    enabled: !authLoading,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCdcProgrammes(filters?: TrainingProgrammeFilters) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['cdc-training-programmes', filters],
    queryFn: () => TrainingService.getProgrammes(filters),
    enabled: !authLoading,
    staleTime: 30 * 1000,
  });
}

export function useCdcProgramme(id: string | undefined) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['cdc-training-programme', id],
    queryFn: () => TrainingService.getProgramme(id!),
    enabled: !authLoading && isValidUUID(id),
    staleTime: 30 * 1000,
  });
}

export function useCreateCdcProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTrainingProgrammeDto) => TrainingService.createProgramme(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-training-programmes'] });
      toast.success('Training programme created');
    },
    onError: (err: Error) => {
      console.error('[cdc/training] create error:', err);
      toast.error('Failed to create training programme');
    },
  });
}

export function useUpdateCdcProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTrainingProgrammeDto }) =>
      TrainingService.updateProgramme(id, dto),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['cdc-training-programmes'] });
      qc.invalidateQueries({ queryKey: ['cdc-training-programme', updated.id] });
      toast.success('Programme updated');
    },
    onError: (err: Error) => {
      console.error('[cdc/training] update error:', err);
      toast.error('Failed to update programme');
    },
  });
}

export function useCdcEnrollments(filters: EnrollmentFilters) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['cdc-training-enrollments', filters],
    queryFn: () => TrainingService.getEnrollments(filters),
    enabled: !authLoading && !!(filters.programme_id || filters.learner_id),
    staleTime: 30 * 1000,
  });
}

export function useAddCdcEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateEnrollmentDto) => TrainingService.addEnrollment(dto),
    onSuccess: (enrollment) => {
      qc.invalidateQueries({ queryKey: ['cdc-training-enrollments', { programme_id: enrollment.programme_id }] });
      toast.success('Learner enrolled');
    },
    onError: (err: Error) => {
      console.error('[cdc/training] enroll error:', err);
      toast.error('Failed to enroll learner');
    },
  });
}

export function useUpdateCdcEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateEnrollmentDto }) =>
      TrainingService.updateEnrollment(id, dto),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['cdc-training-enrollments', { programme_id: updated.programme_id }] });
      toast.success('Enrollment updated');
    },
    onError: (err: Error) => {
      console.error('[cdc/training] update enrollment error:', err);
      toast.error('Failed to update enrollment');
    },
  });
}
