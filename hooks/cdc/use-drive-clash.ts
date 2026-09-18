'use client';

import { useQuery } from '@tanstack/react-query';
import type { DriveClashCheckResponse } from '@/app/api/cdc/drives/clash-check/route';

export interface UseDriveClashParams {
  /** The drive being edited; null while creating. */
  driveId: string | null;
  /** 'YYYY-MM-DD' or '' — an empty date asks nothing of the server. */
  driveDate: string;
  driveStartTime: string;
  driveEndTime: string;
  venueLabel: string;
}

/**
 * Asks the server whether the drive about to be saved clashes with another —
 * same room at the same time, or learners already committed elsewhere that day.
 *
 * Disabled until a date is picked: without a date nothing can clash, so there
 * is nothing to ask.
 */
export function useDriveClash(params: UseDriveClashParams) {
  const { driveId, driveDate, driveStartTime, driveEndTime, venueLabel } = params;
  const enabled = /^\d{4}-\d{2}-\d{2}$/.test(driveDate);

  return useQuery<DriveClashCheckResponse>({
    queryKey: ['cdc-drive-clash', driveId, driveDate, driveStartTime, driveEndTime, venueLabel],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const search = new URLSearchParams({ drive_date: driveDate });
      if (driveStartTime) search.set('drive_start_time', driveStartTime);
      if (driveEndTime) search.set('drive_end_time', driveEndTime);
      if (venueLabel.trim()) search.set('venue_label', venueLabel.trim());
      if (driveId) search.set('exclude_drive_id', driveId);

      const res = await fetch(`/api/cdc/drives/clash-check?${search}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Clash check failed: ${res.status}`);
      }
      return (await res.json()) as DriveClashCheckResponse;
    },
  });
}
