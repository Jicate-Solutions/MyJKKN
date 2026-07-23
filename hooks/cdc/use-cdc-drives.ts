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
} from '@/types/cdc';

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
