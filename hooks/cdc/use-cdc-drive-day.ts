'use client';

/** Drive-day slice: participants, coordinators, attendance. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CdcDriveAttendanceRow,
  CdcDriveAttendanceStatus,
  CdcDriveAttendanceSummary,
  CdcDriveCoordinator,
  CdcDriveDayAccess,
  CdcDriveParticipantRow,
  CdcDriveStatus,
} from '@/types/cdc';

const BASE = '/api/cdc/drives';

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${fallback} (${res.status})`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- participants

export interface ParticipantsResponse {
  finalized_at: string | null;
  rows: CdcDriveParticipantRow[];
  counts: { audience: number; willing: number; participants: number; added: number; removed: number };
  access: CdcDriveDayAccess;
}

export function useCdcDriveParticipants(driveId: string | undefined) {
  return useQuery({
    queryKey: ['cdc-drive-participants', driveId],
    queryFn: async () => json<ParticipantsResponse>(await fetch(`${BASE}/${driveId}/participants`), 'Participants failed'),
    enabled: !!driveId,
  });
}

function invalidateDriveDay(qc: ReturnType<typeof useQueryClient>, driveId: string) {
  qc.invalidateQueries({ queryKey: ['cdc-drive-participants', driveId] });
  qc.invalidateQueries({ queryKey: ['cdc-drive-attendance', driveId] });
  qc.invalidateQueries({ queryKey: ['cdc-drive-selection', driveId] });
  qc.invalidateQueries({ queryKey: ['cdc-drive', driveId] });
  qc.invalidateQueries({ queryKey: ['cdc-drives'] });
}

export function useFinalizeCdcParticipants(driveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (learnerIds: string[]) =>
      json<{ participants: number; notified: number; status_changed: boolean }>(
        await fetch(`${BASE}/${driveId}/participants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finalize', learner_ids: learnerIds }),
        }),
        'Finalize failed'
      ),
    onSuccess: () => invalidateDriveDay(qc, driveId),
  });
}

export function useChangeCdcParticipants(driveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { action: 'add' | 'remove'; learner_ids: string[]; reason?: string | null }) =>
      json<{ changed: number; notified: number }>(
        await fetch(`${BASE}/${driveId}/participants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
        'Update failed'
      ),
    onSuccess: () => invalidateDriveDay(qc, driveId),
  });
}

// ---------------------------------------------------------------- coordinators

export interface CoordinatorsResponse {
  coordinators: CdcDriveCoordinator[];
  staff_options: Array<{ value: string; label: string; has_login: boolean }>;
}

export function useCdcDriveCoordinators(driveId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['cdc-drive-coordinators', driveId],
    queryFn: async () => json<CoordinatorsResponse>(await fetch(`${BASE}/${driveId}/coordinators`), 'Coordinators failed'),
    enabled: !!driveId && enabled,
  });
}

/** The team-member picker list — fetched only while the Assign dialog is open, then cached. */
export function useCdcDriveCoordinatorOptions(driveId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['cdc-drive-coordinator-options', driveId],
    queryFn: async () =>
      (await json<CoordinatorsResponse>(await fetch(`${BASE}/${driveId}/coordinators?options=1`), 'Team members failed')).staff_options,
    enabled: !!driveId && enabled,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSetCdcDriveCoordinators(driveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (staffIds: string[]) =>
      json<{ coordinators: CdcDriveCoordinator[]; added: number; removed: number; notified: number }>(
        await fetch(`${BASE}/${driveId}/coordinators`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staff_ids: staffIds }),
        }),
        'Save failed'
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-drive-coordinators', driveId] });
      qc.invalidateQueries({ queryKey: ['cdc-coordinating-drives'] });
    },
  });
}

// ---------------------------------------------------------------- attendance

export interface AttendanceResponse {
  drive: {
    id: string;
    title: string;
    status: CdcDriveStatus;
    drive_date: string | null;
    venue_label: string | null;
    participants_finalized_at: string | null;
  };
  rows: CdcDriveAttendanceRow[];
  summary: CdcDriveAttendanceSummary;
  /** true = participants not finalized; rows are the Willing learners, read-only. */
  preview: boolean;
  access: CdcDriveDayAccess;
}

export function useCdcDriveAttendance(driveId: string | undefined) {
  return useQuery({
    queryKey: ['cdc-drive-attendance', driveId],
    queryFn: async () => json<AttendanceResponse>(await fetch(`${BASE}/${driveId}/attendance`), 'Attendance failed'),
    enabled: !!driveId,
  });
}

export function useMarkCdcDriveAttendance(driveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { learner_ids: string[]; status: CdcDriveAttendanceStatus | null; remarks?: string | null }) =>
      json<{ marked: number; cleared: number }>(
        await fetch(`${BASE}/${driveId}/attendance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
        'Marking failed'
      ),
    // The roster is expensive to rebuild (whole audience + willingness + joins),
    // and the server has just told us exactly what changed — so patch the cached
    // rows and summary in place. A click on one learner no longer refetches 150.
    onSuccess: (_result, input) => {
      const ids = new Set(input.learner_ids);
      const now = new Date().toISOString();
      qc.setQueryData<AttendanceResponse>(['cdc-drive-attendance', driveId], (prev) => {
        if (!prev) return prev;
        const rows = prev.rows.map((r) =>
          ids.has(r.learner_id)
            ? {
                ...r,
                attendance_status: input.status,
                attendance_marked_at: input.status ? now : null,
                attendance_marked_by: input.status ? 'You' : null,
                attendance_remarks: input.status ? input.remarks ?? r.attendance_remarks : null,
              }
            : r
        );
        const summary: CdcDriveAttendanceSummary = { total: rows.length, present: 0, absent: 0, late: 0, excused: 0, not_attended: 0, unmarked: 0 };
        rows.forEach((r) => {
          if (r.attendance_status) summary[r.attendance_status] += 1;
          else summary.unmarked += 1;
        });
        return { ...prev, rows, summary };
      });
      // Pages that show attendance-derived counts pick the change up lazily.
      qc.invalidateQueries({ queryKey: ['cdc-drive-selection', driveId] });
    },
    onError: () => qc.invalidateQueries({ queryKey: ['cdc-drive-attendance', driveId] }),
  });
}

export function cdcDriveAttendanceExportUrl(
  driveId: string,
  status?: string,
  scope: { institution_id?: string; program_id?: string; semester_order?: string } = {}
): string {
  const sp = new URLSearchParams({ format: 'xlsx' });
  if (status && status !== 'all') sp.set('status', status);
  if (scope.institution_id && scope.institution_id !== 'all') sp.set('institution_id', scope.institution_id);
  if (scope.program_id && scope.program_id !== 'all') sp.set('program_id', scope.program_id);
  if (scope.semester_order && scope.semester_order !== 'all') sp.set('semester_order', scope.semester_order);
  return `${BASE}/${driveId}/attendance?${sp}`;
}

// ---------------------------------------------------------------- my assigned drives (coordinators)

export interface CoordinatingDrive {
  id: string;
  title: string;
  status: CdcDriveStatus;
  drive_date: string | null;
  drive_start_time: string | null;
  venue_label: string | null;
  participants_finalized: boolean;
  recruiter_name: string | null;
}

export function useCdcCoordinatingDrives() {
  return useQuery({
    queryKey: ['cdc-coordinating-drives'],
    queryFn: async () => (await json<{ data: CoordinatingDrive[] }>(await fetch(`${BASE}/coordinating`), 'Assigned drives failed')).data,
  });
}
