'use client';

/**
 * HR Biometric import purge — React Query hooks.
 * Created: 2026-08-20.
 *
 * Module-local query keys, matching hooks/hr/use-biometric-mapping.ts.
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { BiometricImportPurgeService } from '@/lib/services/hr/biometric-import-purge-service';
import type { BiometricPurgeReceipt } from '@/types/hr-biometric';

const KEY = 'hr-biometric-import-batches';

/** Exported so the import page can refresh this list without retyping it. */
export const BIOMETRIC_BATCHES_KEY = KEY;

/**
 * Refresh the imported-months list.
 *
 * The importer and this list are siblings on /hr/attendance/import with no
 * shared state between them, so a finished import left the table showing the
 * month it had a moment ago until somebody reloaded the page. The purge
 * mutation below has always invalidated this key; the import had nothing to
 * invalidate it with.
 */
export function useInvalidateBiometricBatches() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: [KEY] });
  }, [qc]);
}

/**
 * @param enabled false for anyone who is not a super admin — the RPC would
 *   raise 42501 and React Query would retry it three times before surfacing an
 *   error nobody can act on.
 */
export function useBiometricImportBatches(enabled: boolean) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY],
    queryFn: () => BiometricImportPurgeService.listBatches(supabase),
    enabled,
    // A month can be imported or purged from another tab or by another super
    // admin, and this list is what you read before deleting a month of
    // attendance — coming back to a stale one is the dangerous case. The
    // staleTime keeps a tab switch from re-running the RPC on every focus.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/** Only fetches while a confirm dialog is open, so a closed dialog costs nothing. */
export function useBiometricPurgePreview(
  machineInstitutionId: string | null,
  monthStart: string | null,
  enabled: boolean,
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'preview', machineInstitutionId, monthStart],
    queryFn: () =>
      BiometricImportPurgeService.preview(supabase, machineInstitutionId!, monthStart!),
    enabled: enabled && Boolean(machineInstitutionId) && Boolean(monthStart),
    staleTime: 0,
  });
}

export function usePurgeBiometricImport() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({
      machineInstitutionId,
      monthStart,
    }: {
      machineInstitutionId: string;
      monthStart: string;
    }): Promise<BiometricPurgeReceipt> =>
      BiometricImportPurgeService.purge(supabase, machineInstitutionId, monthStart),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
