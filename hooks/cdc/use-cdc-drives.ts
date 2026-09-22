'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CdcDrive,
  CdcDriveDetailResponse,
  CdcDriveInsert,
  CdcDriveListResponse,
  CdcDriveStatus,
  CdcDriveTransitionPayload,
  CdcLookupsResponse,
  CdcDriveCircular,
  CdcDriveNotifySummary,
  CdcDriveResponseRow,
  CdcDriveUpdate,
  CdcDriveNotificationLogRow,
  CdcDriveNotificationSummary,
  CdcDriveAssignedResponse,
  CdcAssignedWillingnessBucket,
} from '@/types/cdc';
import type { InstitutionSemestersResponse } from '@/app/api/cdc/pickers/institution-semesters/route';
import type { LearnerNotifyDiagnosis } from '@/lib/services/cdc/drive-notifications';

const BASE = '/api/cdc';

// =====================================================================================
// Queries
// =====================================================================================

export interface UseCdcDrivesParams {
  status?: CdcDriveStatus | CdcDriveStatus[];
  recruiter_id?: string;
  drive_type_id?: string;
  institution_id?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useCdcDrives(params: UseCdcDrivesParams = {}) {
  return useQuery({
    queryKey: ['cdc-drives', params],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params.status) {
        const statuses = Array.isArray(params.status) ? params.status : [params.status];
        statuses.forEach((s) => search.append('status', s));
      }
      if (params.recruiter_id) search.set('recruiter_id', params.recruiter_id);
      if (params.drive_type_id) search.set('drive_type_id', params.drive_type_id);
      if (params.institution_id) search.set('institution_id', params.institution_id);
      if (params.search) search.set('search', params.search);
      if (params.page) search.set('page', String(params.page));
      if (params.pageSize) search.set('pageSize', String(params.pageSize));

      const res = await fetch(`${BASE}/drives?${search}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Drives list failed: ${res.status}`);
      }
      return (await res.json()) as CdcDriveListResponse;
    },
  });
}

export function useCdcDrive(driveId: string | undefined) {
  return useQuery({
    queryKey: ['cdc-drive', driveId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/drives/${driveId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Drive fetch failed: ${res.status}`);
      }
      return (await res.json()) as CdcDriveDetailResponse;
    },
    enabled: !!driveId,
  });
}

export function useCdcLookups() {
  return useQuery({
    queryKey: ['cdc-lookups'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/lookups`);
      if (!res.ok) throw new Error(`Lookups failed: ${res.status}`);
      return (await res.json()) as CdcLookupsResponse;
    },
    // Lookups change rarely; cache aggressively
    staleTime: 5 * 60 * 1000,
  });
}

// =====================================================================================
// Mutations
// =====================================================================================

export function useCreateCdcDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CdcDriveInsert) => {
      const res = await fetch(`${BASE}/drives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Create drive failed');
      }
      return (await res.json()).data as CdcDrive;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-drives'] });
    },
  });
}

export function useTransitionCdcDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      driveId,
      payload,
    }: {
      driveId: string;
      payload: CdcDriveTransitionPayload;
    }) => {
      const res = await fetch(`${BASE}/drives/${driveId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Transition failed');
      }
      return (await res.json()).data as CdcDrive;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cdc-drives'] });
      qc.invalidateQueries({ queryKey: ['cdc-drive', data.id] });
    },
  });
}

export function useCancelCdcDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ driveId, reason }: { driveId: string; reason: string }) => {
      const res = await fetch(`${BASE}/drives/${driveId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: 'cancelled', reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Cancel failed');
      }
      return (await res.json()).data as CdcDrive;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cdc-drives'] });
      qc.invalidateQueries({ queryKey: ['cdc-drive', data.id] });
    },
  });
}

// =====================================================================================
// Audience + circular + responses (20260915)
// =====================================================================================

/** Distinct semester orders per institution — drives the per-institution semester picker. */
export function useCdcInstitutionSemesters(institutionIds: string[]) {
  const key = [...institutionIds].sort().join(',');
  return useQuery({
    queryKey: ['cdc-institution-semesters', key],
    queryFn: async () => {
      const res = await fetch(`${BASE}/pickers/institution-semesters?institution_ids=${encodeURIComponent(key)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Semesters failed: ${res.status}`);
      }
      return (await res.json()) as InstitutionSemestersResponse;
    },
    enabled: institutionIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export interface CdcPickerProgramOption {
  value: string;
  label: string;
  /** Every duplicate master id behind this program name. */
  ids: string[];
  institution_id: string | null;
}

/** Program options within the caller's scope, grouped by name (duplicate master rows merged). */
export function useCdcProgramOptionsAll(enabled = true) {
  return useQuery({
    queryKey: ['cdc-program-options', 'all'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/pickers/programs`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Programs failed: ${res.status}`);
      }
      return ((await res.json()).options ?? []) as CdcPickerProgramOption[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** Response of PATCH /api/cdc/drives/[id]. `notify` is set only when the audience changed on an open drive. */
export interface CdcUpdateDriveResponse {
  data: CdcDrive;
  targeting_changed: boolean;
  notify?: CdcDriveNotifySummary;
  notify_error?: string;
}

export function useUpdateCdcDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ driveId, payload }: { driveId: string; payload: CdcDriveUpdate }) => {
      const res = await fetch(`${BASE}/drives/${driveId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update drive failed');
      }
      return (await res.json()) as CdcUpdateDriveResponse;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['cdc-drives'] });
      qc.invalidateQueries({ queryKey: ['cdc-drive', result.data.id] });
      qc.invalidateQueries({ queryKey: ['cdc-drive-notifications', result.data.id] });
      qc.invalidateQueries({ queryKey: ['cdc-drive-eligibility', result.data.id] });
      if (result.targeting_changed) {
        qc.invalidateQueries({ queryKey: ['cdc-drive-assigned', result.data.id] });
        qc.invalidateQueries({ queryKey: ['cdc-drive-participants', result.data.id] });
        qc.invalidateQueries({ queryKey: ['cdc-drive-attendance', result.data.id] });
      }
    },
  });
}

export function useCdcDriveNotifications(driveId: string | undefined, status?: 'sent' | 'no_profile') {
  return useQuery({
    queryKey: ['cdc-drive-notifications', driveId, status ?? 'all'],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (status) search.set('status', status);
      const res = await fetch(`${BASE}/drives/${driveId}/notifications?${search}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Notification log failed: ${res.status}`);
      }
      return (await res.json()) as {
        summary: CdcDriveNotificationSummary;
        rows: CdcDriveNotificationLogRow[];
        total: number;
      };
    },
    enabled: !!driveId,
  });
}

export async function diagnoseCdcDriveNotification(driveId: string, registerNumber: string) {
  const res = await fetch(
    `${BASE}/drives/${driveId}/notifications?register_number=${encodeURIComponent(registerNumber)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Diagnosis failed');
  }
  return (await res.json()).diagnosis as LearnerNotifyDiagnosis;
}

/** Upload a circular to Google Drive; returns the reference to persist on the drive. */
export async function uploadCdcDriveCircular(
  file: File,
  meta: { title?: string; recruiter_id?: string } = {}
): Promise<CdcDriveCircular> {
  const fd = new FormData();
  fd.append('file', file);
  if (meta.title) fd.append('title', meta.title);
  if (meta.recruiter_id) fd.append('recruiter_id', meta.recruiter_id);
  const res = await fetch(`${BASE}/drives/circular/upload`, { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Circular upload failed');
  }
  return (await res.json()).circular as CdcDriveCircular;
}

export interface UseCdcDriveResponsesParams {
  institution_id?: string;
  semester_order?: number;
  status?: string;
}

export function useCdcDriveResponses(driveId: string | undefined, params: UseCdcDriveResponsesParams = {}) {
  return useQuery({
    queryKey: ['cdc-drive-responses', driveId, params],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params.institution_id) search.set('institution_id', params.institution_id);
      if (params.semester_order != null) search.set('semester_order', String(params.semester_order));
      if (params.status) search.set('status', params.status);
      const res = await fetch(`${BASE}/drives/${driveId}/responses?${search}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Responses failed: ${res.status}`);
      }
      return (await res.json()) as { data: CdcDriveResponseRow[]; total: number };
    },
    enabled: !!driveId,
  });
}

/** Build the Excel download URL for a drive's responses (same filters as the table). */
export function cdcDriveResponsesExportUrl(driveId: string, params: UseCdcDriveResponsesParams = {}): string {
  const search = new URLSearchParams({ format: 'xlsx' });
  if (params.institution_id) search.set('institution_id', params.institution_id);
  if (params.semester_order != null) search.set('semester_order', String(params.semester_order));
  if (params.status) search.set('status', params.status);
  return `${BASE}/drives/${driveId}/responses?${search}`;
}

export interface UseCdcDriveAssignedParams {
  institution_id?: string;
  semester_order?: number;
  status?: CdcAssignedWillingnessBucket;
  responded?: 'yes' | 'no';
  q?: string;
}

function assignedSearchParams(params: UseCdcDriveAssignedParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.institution_id) search.set('institution_id', params.institution_id);
  if (params.semester_order != null) search.set('semester_order', String(params.semester_order));
  if (params.status) search.set('status', params.status);
  if (params.responded) search.set('responded', params.responded);
  if (params.q && params.q.trim()) search.set('q', params.q.trim());
  return search;
}

/** Every targeted learner of a drive (responded or pending) — /cdc/drives/[id]/willingness staff view. */
export function useCdcDriveAssigned(driveId: string | undefined, params: UseCdcDriveAssignedParams = {}) {
  return useQuery({
    queryKey: ['cdc-drive-assigned', driveId, params],
    queryFn: async () => {
      const res = await fetch(`${BASE}/drives/${driveId}/assigned?${assignedSearchParams(params)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Assigned learners failed: ${res.status}`);
      }
      return (await res.json()) as CdcDriveAssignedResponse;
    },
    enabled: !!driveId,
    placeholderData: (prev) => prev,
  });
}

/** Excel download URL for the assigned-learner view (same filters as the table). */
export function cdcDriveAssignedExportUrl(driveId: string, params: UseCdcDriveAssignedParams = {}): string {
  const search = assignedSearchParams(params);
  search.set('format', 'xlsx');
  return `${BASE}/drives/${driveId}/assigned?${search}`;
}

/** Response shape of the transition route (data + optional notification summary). */
export interface CdcTransitionResponse {
  data: CdcDrive;
  notify?: CdcDriveNotifySummary;
  notify_error?: string;
}

export function useTransitionCdcDriveWithNotify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ driveId, payload }: { driveId: string; payload: CdcDriveTransitionPayload }) => {
      const res = await fetch(`${BASE}/drives/${driveId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Transition failed');
      }
      return (await res.json()) as CdcTransitionResponse;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['cdc-drives'] });
      qc.invalidateQueries({ queryKey: ['cdc-drive', result.data.id] });
    },
  });
}
