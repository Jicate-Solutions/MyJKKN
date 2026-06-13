'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import type {
  CdcPlacementFilters,
  CdcPlacementInsert,
  CdcPlacementListResponse,
  CdcPlacementDetailResponse,
  CdcPlacementStatusUpdate,
  CdcSnapshotCaptureResponse,
  CdcPlacementStatus,
} from '@/types/cdc/placements';

const BASE = '/api/cdc/placements';

// =====================================================================================
// Queries
// =====================================================================================

export function useCdcPlacements(filters: CdcPlacementFilters = {}) {
  return useQuery({
    queryKey: ['cdc-placements', filters],
    queryFn: async (): Promise<CdcPlacementListResponse> => {
      const search = new URLSearchParams();
      if (filters.drive_id) search.set('drive_id', filters.drive_id);
      if (filters.learner_id) search.set('learner_id', filters.learner_id);
      if (filters.recruiter_id) search.set('recruiter_id', filters.recruiter_id);
      if (filters.offer_type_id) search.set('offer_type_id', filters.offer_type_id);
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        statuses.forEach((s) => search.append('status', s));
      }
      if (filters.search) search.set('search', filters.search);
      if (filters.page) search.set('page', String(filters.page));
      if (filters.pageSize) search.set('pageSize', String(filters.pageSize));

      const res = await fetch(`${BASE}?${search.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}

export function useCdcPlacement(id: string | undefined) {
  return useQuery({
    queryKey: ['cdc-placement', id],
    queryFn: async (): Promise<CdcPlacementDetailResponse> => {
      const res = await fetch(`${BASE}/${id}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!id,
  });
}

// =====================================================================================
// Mutations
// =====================================================================================

export function useCreateCdcPlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CdcPlacementInsert) => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-placements'] });
    },
  });
}

export function useUpdateCdcPlacementStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      update,
    }: {
      id: string;
      update: CdcPlacementStatusUpdate;
    }) => {
      const res = await fetch(`${BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['cdc-placements'] });
      qc.invalidateQueries({ queryKey: ['cdc-placement', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCaptureCdcSnapshot() {
  return useMutation({
    mutationFn: async (cycle: string): Promise<CdcSnapshotCaptureResponse> => {
      const res = await fetch(`${BASE}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}

// =====================================================================================
// Status helpers (reused in UI)
// =====================================================================================

export const CDC_PLACEMENT_ALLOWED_TRANSITIONS: Record<CdcPlacementStatus, CdcPlacementStatus[]> = {
  offered: ['accepted', 'declined'],
  accepted: ['rescinded'],
  declined: [],
  rescinded: [],
};

export function canTransitionPlacement(
  from: CdcPlacementStatus,
  to: CdcPlacementStatus
): boolean {
  return CDC_PLACEMENT_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
