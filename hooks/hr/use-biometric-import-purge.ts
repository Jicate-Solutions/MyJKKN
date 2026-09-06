'use client';

/**
 * HR Biometric import purge — React Query hooks.
 * Created: 2026-08-20.
 *
 * Module-local query keys, matching hooks/hr/use-biometric-mapping.ts.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { BiometricImportPurgeService } from '@/lib/services/hr/biometric-import-purge-service';
import type { BiometricPurgeReceipt } from '@/types/hr-biometric';

const KEY = 'hr-biometric-import-batches';

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
