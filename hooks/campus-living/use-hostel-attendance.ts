'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelAttendanceService } from '@/lib/services/campus-living/hostel-attendance-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  HostelAttendance,
  CreateHostelAttendanceDTO,
  AttendanceFilters,
} from '@/types/campus-living';

// Query key factory
export const hostelAttendanceKeys = {
  all: ['hostel-attendance'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-attendance', 'list', filters] as const,
  byDate: (institutionId: string | undefined, date: string, blockId?: string) =>
    ['hostel-attendance', 'by-date', institutionId, date, blockId] as const,
  detail: (id: string) => ['hostel-attendance', 'detail', id] as const,
  markable: (institutionId: string | undefined, blockId: string | undefined) =>
    ['hostel-attendance', 'markable', institutionId, blockId] as const,
  dashboard: (institutionId: string | undefined, date: string, blockId: string | undefined) =>
    ['hostel-attendance', 'dashboard', institutionId, date, blockId] as const,
  myBlockAccess: ['hostel-attendance', 'my-block-access'] as const,
};

// The current user's active block grants (user_block_access, self-readable).
// Non-empty for wardens — used to scope the Mark Attendance UI to their
// assigned blocks. Empty for admins/unscoped staff.
export function useMyBlockAccess() {
  return useQuery({
    queryKey: hostelAttendanceKeys.myBlockAccess,
    queryFn: () => HostelAttendanceService.getMyBlockGrants(),
    staleTime: 60_000,
  });
}

// --- Query hooks ---

export function useHostelAttendance(institutionId: string | undefined, filters?: AttendanceFilters) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelAttendanceKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelAttendanceService.getAttendance(isSuperAdmin ? undefined : institutionId, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

// Aggregate stats for the Hostel Attendance landing page (totals, block-wise
// breakdown, 7-day trend). Replaces the old useHostelAttendance(list) call that
// the page mis-read as an aggregate, leaving it stuck on all-zeros.
export function useAttendanceDashboard(
  institutionId: string | undefined,
  date: string,
  blockId?: string
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelAttendanceKeys.dashboard(institutionId, date, blockId),
    queryFn: () =>
      HostelAttendanceService.getAttendanceDashboard(
        isSuperAdmin ? undefined : institutionId,
        date,
        blockId
      ),
    enabled: isSuperAdmin || !!institutionId,
  });
}

// Active residents merged with their allocation (block/room/bed) for the
// Mark Attendance page. blockId narrows to residents allocated in that block.
export function useMarkableResidents(institutionId: string | undefined, blockId?: string) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelAttendanceKeys.markable(institutionId, blockId),
    queryFn: () =>
      HostelAttendanceService.getMarkableResidents(
        isSuperAdmin ? undefined : institutionId,
        blockId
      ),
    enabled: isSuperAdmin || !!institutionId,
  });
}

// blockId, when given, scopes the query to that block directly instead of the
// viewer's own institution_id — a block can house residents from multiple
// affiliated colleges (hostel-rooms-v2), so filtering by the marking staff
// member's own institution wrongly hides records for residents of other
// institutions housed in the same block (same pitfall getMarkableResidents
// below already documents and avoids).
export function useAttendanceByDate(institutionId: string | undefined, date: string, blockId?: string) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelAttendanceKeys.byDate(institutionId, date, blockId),
    queryFn: () =>
      HostelAttendanceService.getAttendanceByDate(
        blockId ? undefined : (isSuperAdmin ? undefined : institutionId),
        date,
        blockId
      ),
    enabled: (isSuperAdmin || !!institutionId || !!blockId) && !!date,
  });
}

// Note: No single-record-by-id getter exists on the service.
// Use useAttendanceByDate or useHostelAttendance with filters instead.

// --- Mutation hooks ---

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelAttendanceDTO[]) =>
      HostelAttendanceService.bulkMarkAttendance(payload),
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
      HostelAttendanceService.markAttendance(payload),
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
