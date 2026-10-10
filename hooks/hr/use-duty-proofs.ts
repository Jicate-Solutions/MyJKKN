'use client';

/**
 * Proof of done on HR duties (HR staff harness). See types/hr-duty-proof.ts.
 *
 * useDutyProofs returns { data: null } when the viewer may not see the duty
 * (a 403): the badge and panel then render nothing, rather than claiming a
 * proof is missing that RLS merely hid from them.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  DUTY_PROOF_BUCKET,
  buildDutyProofPath,
  type DutyProofCode,
  type DutyProofSecondCheckInput,
  type DutyProofsResponse,
} from '@/types/hr-duty-proof';

const BASE = '/api/hr/duty-proofs';
const KEY = 'hr-duty-proofs';

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return typeof j?.error === 'string' ? j.error : `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

/** The first day of the current month, YYYY-MM-DD, in local time. */
export function startOfThisMonth(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${m}-01`;
}

export function useDutyProofs(
  duty: DutyProofCode,
  opts: { itemIds?: string[]; since?: string | null; enabled?: boolean } = {},
) {
  const itemIds = opts.itemIds ?? [];
  return useQuery({
    queryKey: [KEY, duty, itemIds.join(','), opts.since ?? null],
    queryFn: async (): Promise<DutyProofsResponse | null> => {
      const params = new URLSearchParams({ duty });
      if (itemIds.length > 0) params.set('itemIds', itemIds.join(','));
      if (opts.since) params.set('since', opts.since);
      const res = await fetch(`${BASE}?${params}`);
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error(await readError(res));
      return ((await res.json()).data ?? null) as DutyProofsResponse | null;
    },
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useRecordSecondCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DutyProofSecondCheckInput) => {
      const res = await fetch(`${BASE}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      return (await res.json()).data as { id: string };
    },
    // Also on a refusal: a check refused because the amount changed must
    // show the new amount, not the one it was refused for.
    onSettled: (_d, _e, input) => qc.invalidateQueries({ queryKey: [KEY, input.duty] }),
  });
}

/**
 * Upload the file straight to the private bucket (its policy checks the
 * caller), then record it. The file never passes through the API route.
 */
export function useAttachDutyProofFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ duty, itemId, file }: { duty: DutyProofCode; itemId: string; file: File }) => {
      const path = buildDutyProofPath(duty, itemId, file.name, crypto.randomUUID());
      const supabase = createClientSupabaseClient();
      const { error: upErr } = await supabase.storage
        .from(DUTY_PROOF_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duty, itemId, storagePath: path, fileName: file.name }),
      });
      if (!res.ok) throw new Error(await readError(res));
      return (await res.json()).data as { id: string };
    },
    onSuccess: (_d, input) => qc.invalidateQueries({ queryKey: [KEY, input.duty] }),
  });
}

/** A short-lived link to open a proof file (bucket policy checks the viewer). */
export async function openDutyProofFile(storagePath: string): Promise<string | null> {
  const supabase = createClientSupabaseClient();
  const { data } = await supabase.storage.from(DUTY_PROOF_BUCKET).createSignedUrl(storagePath, 120);
  return data?.signedUrl ?? null;
}
