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
  CreateSemesterScheduleDto,
  UpdateSemesterScheduleDto,
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

// ─── Attendance auto-pickup (BUG-004201) ─────────────────────────────────
// Recompute every enrolled learner's attendance_pct from the academic attendance
// master over the programme window (Model A). Goes through the service-role API
// route; invalidates the enrollment list so the synced %s + provenance refresh.
export function useSyncTrainingAttendance(programmeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ ok: boolean; synced?: number; no_records?: number; reason?: string }> => {
      const res = await fetch(`/api/cdc/training/${programmeId}/attendance-sync`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      return body;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['cdc-training-enrollments', { programme_id: programmeId }] });
      if (r.ok) {
        const synced = r.synced ?? 0;
        const none = r.no_records ?? 0;
        toast.success(
          `Attendance recomputed for ${synced} learner${synced === 1 ? '' : 's'}` +
          (none > 0 ? ` · ${none} had no records in the window` : '')
        );
      }
    },
    onError: (err: Error) => {
      console.error('[cdc/training] attendance sync error:', err);
      toast.error(err.message || 'Failed to recompute attendance');
    },
  });
}

// ─── Semester Schedules (BUG-004200) ─────────────────────────────────────

export function useCdcSemesterSchedules(programmeId: string | undefined) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['cdc-training-semester-schedules', programmeId],
    queryFn: () => TrainingService.getSemesterSchedules(programmeId!),
    enabled: !authLoading && isValidUUID(programmeId),
    staleTime: 30 * 1000,
  });
}

export function useAddSemesterSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSemesterScheduleDto) => TrainingService.addSemesterSchedule(dto),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['cdc-training-semester-schedules', row.programme_id] });
      toast.success('Semester schedule added');
    },
    onError: (err: Error) => {
      console.error('[cdc/training] add semester schedule error:', err);
      toast.error('Failed to add semester schedule');
    },
  });
}

export function useUpdateSemesterSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateSemesterScheduleDto }) =>
      TrainingService.updateSemesterSchedule(id, dto),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['cdc-training-semester-schedules', row.programme_id] });
      toast.success('Semester schedule updated');
    },
    onError: (err: Error) => {
      console.error('[cdc/training] update semester schedule error:', err);
      toast.error('Failed to update semester schedule');
    },
  });
}

export function useDeleteSemesterSchedule(programmeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => TrainingService.deleteSemesterSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-training-semester-schedules', programmeId] });
      toast.success('Semester schedule removed');
    },
    onError: (err: Error) => {
      console.error('[cdc/training] delete semester schedule error:', err);
      toast.error('Failed to remove semester schedule');
    },
  });
}
