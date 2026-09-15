'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CdcDriveEligibilityInput, CdcDriveEligibilityResponse } from '@/types/cdc';

const BASE = '/api/cdc';

export interface CdcProgramOption {
  /** Stable key for the option — the first master row id sharing this name. */
  value: string;
  label: string;
  /**
   * EVERY program id that shares this name at this institution. `programs` holds
   * duplicate active rows for some programs and learners are split across them,
   * so saving must store all of these, not just `value`.
   */
  ids: string[];
  institution_id: string | null;
}

/** The drive's eligibility criteria, plus how many learners they currently match. */
export function useCdcDriveEligibility(driveId: string | undefined) {
  return useQuery({
    queryKey: ['cdc-drive-eligibility', driveId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/drives/${driveId}/eligibility`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Eligibility fetch failed: ${res.status}`);
      }
      return (await res.json()) as CdcDriveEligibilityResponse;
    },
    enabled: !!driveId,
  });
}

/** Programs the drive can target, scoped to the drive's institutions. */
export function useCdcProgramOptions(driveId: string | undefined) {
  return useQuery({
    queryKey: ['cdc-program-options', driveId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/pickers/programs?drive_id=${driveId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Programs fetch failed: ${res.status}`);
      }
      return ((await res.json()).options ?? []) as CdcProgramOption[];
    },
    enabled: !!driveId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveCdcDriveEligibility(driveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CdcDriveEligibilityInput) => {
      const res = await fetch(`${BASE}/drives/${driveId}/eligibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Saving eligibility failed');
      }
      return (await res.json()) as CdcDriveEligibilityResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-drive-eligibility', driveId] });
      // The state-machine guard reads eligibility, so the drive's allowed next
      // states change the moment criteria are saved.
      qc.invalidateQueries({ queryKey: ['cdc-drive', driveId] });
    },
  });
}
