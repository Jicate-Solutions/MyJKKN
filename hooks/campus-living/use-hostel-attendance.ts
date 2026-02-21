'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelAttendanceService } from '@/lib/services/campus-living/hostel-attendance-service';
import type {
  HostelAttendance,
  CreateHostelAttendanceDTO,
  AttendanceFilters,
} from '@/types/campus-living';

// Query key factory
export const hostelAttendanceKeys = {
  all: ['hostel-attendance'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-attendance', 'list', filters] as const,
  byDate: (institutionId: string, date: string) => ['hostel-attendance', 'by-date', institutionId, date] as const,
  detail: (id: string) => ['hostel-attendance', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelAttendance(institutionId: string, filters?: AttendanceFilters) {
  return useQuery({
    queryKey: hostelAttendanceKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelAttendanceService.getAttendance(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useAttendanceByDate(institutionId: string, date: string) {
  return useQuery({
    queryKey: hostelAttendanceKeys.byDate(institutionId, date),
    queryFn: () => HostelAttendanceService.getAttendanceByDate(institutionId, date),
    enabled: !!institutionId && !!date,
  });
}

export function useHostelAttendanceDetail(id: string) {
  return useQuery({
    queryKey: hostelAttendanceKeys.detail(id),
    queryFn: () => HostelAttendanceService.getAttendanceRecord(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelAttendanceDTO[]) =>
      HostelAttendanceService.markBulkAttendance(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAttendanceKeys.all });
      toast.success('Attendance marked');
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark attendance: ${error.message}`);
    },
  });
}

export function useCreateHostelAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelAttendanceDTO) =>
      HostelAttendanceService.createAttendance(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAttendanceKeys.all });
      toast.success('Attendance recorded');
    },
    onError: (error: Error) => {
      toast.error(`Failed to record attendance: ${error.message}`);
    },
  });
}

export function useUpdateHostelAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateHostelAttendanceDTO> }) =>
      HostelAttendanceService.updateAttendance(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelAttendanceKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelAttendanceKeys.detail(variables.id) });
      toast.success('Attendance updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update attendance: ${error.message}`);
    },
  });
}

export function useDeleteHostelAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelAttendanceService.deleteAttendance(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAttendanceKeys.all });
      toast.success('Attendance record deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete attendance: ${error.message}`);
    },
  });
}
