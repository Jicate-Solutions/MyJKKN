'use client';

/**
 * HR Biometric mapping — React Query hooks.
 * Created: 2026-08-06.
 *
 * Module-local query keys, matching hooks/hr/use-hr-leave-types.ts.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { BiometricMappingService } from '@/lib/services/hr/biometric-mapping-service';
import type { BiometricMappingSave, BiometricSuggestResponse } from '@/types/hr-biometric';

const KEY = 'hr-biometric-mapping';

/** Staff already enrolled on a machine. */
export function useMachineEnrolments(institutionId: string | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, institutionId],
    queryFn: () => BiometricMappingService.listForMachine(supabase, institutionId!),
    enabled: Boolean(institutionId),
  });
}

export function useSaveBiometricMappings() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (params: BiometricMappingSave) =>
      BiometricMappingService.saveMappings(supabase, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/** Upload a device export and get per-code staff suggestions. Writes nothing. */
export function useSuggestMappings() {
  return useMutation({
    mutationFn: async (file: File): Promise<BiometricSuggestResponse> => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/hr/biometric-mapping/suggest', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || `Request failed (${res.status})`);
      return body as BiometricSuggestResponse;
    },
  });
}
