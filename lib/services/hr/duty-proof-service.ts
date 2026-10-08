/**
 * Duty proof service — reads and records proof of done on HR duties.
 *
 * Every write goes through a SECURITY DEFINER function that checks the caller
 * (supabase/migrations/20271007161123_hr_duty_proofs.sql); reads go through RLS.
 * Pass a session-scoped client, never the service-role client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DutyProof,
  DutyProofAttachFileInput,
  DutyProofCode,
  DutyProofGap,
  DutyProofSecondCheckInput,
} from '@/types/hr-duty-proof';

/** An error carrying the HTTP status a route should answer with. */
export class DutyProofError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'DutyProofError';
  }
}

/** Map a Postgres error from the proof functions to an HTTP status. */
export function toDutyProofError(err: { code?: string; message?: string } | null | undefined): DutyProofError {
  const message = err?.message || 'Something went wrong';
  switch (err?.code) {
    case '42501': return new DutyProofError(message, 403);
    case '23505': return new DutyProofError(message, 409);
    case '22023':
    case '23514': return new DutyProofError(message, 400);
    default: return new DutyProofError(message, 500);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export const DutyProofService = {
  /** Done items with no proof yet, in the caller's colleges. Raises 403 without the key. */
  async listGaps(supabase: SupabaseClient, duty: DutyProofCode, since: string | null): Promise<DutyProofGap[]> {
    const { data, error } = await supabase.rpc('fn_hr_duty_proof_gaps', { p_duty: duty, p_since: since });
    if (error) throw toDutyProofError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      item_id: String(r.item_id),
      done_at: String(r.done_at),
      institution_id: (r.institution_id as string | null) ?? null,
      amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
      caller_is_doer: r.caller_is_doer === true,
    }));
  },

  /** Active proofs on the given items that the caller may see (RLS). */
  async listProofs(supabase: SupabaseClient, duty: DutyProofCode, itemIds: string[]): Promise<DutyProof[]> {
    if (itemIds.length === 0) return [];
    const { data, error } = await supabase
      .from('hr_duty_proofs')
      .select('id, duty_code, item_id, kind, storage_path, file_name, recorded_by, recorded_at, check_result, corrected_amount, check_note, revoked_at')
      .eq('duty_code', duty)
      .in('item_id', itemIds)
      .is('revoked_at', null);
    if (error) throw toDutyProofError(error);
    const rows = (data ?? []) as Array<Record<string, unknown>>;

    const ids = Array.from(new Set(rows.map((r) => String(r.recorded_by))));
    const names = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      for (const p of (people ?? []) as Array<{ id: string; full_name: string | null }>) {
        names.set(p.id, p.full_name);
      }
    }

    return rows.map((r) => ({
      id: String(r.id),
      duty_code: r.duty_code as DutyProofCode,
      item_id: String(r.item_id),
      kind: r.kind as DutyProof['kind'],
      storage_path: (r.storage_path as string | null) ?? null,
      file_name: (r.file_name as string | null) ?? null,
      recorded_by: String(r.recorded_by),
      recorded_by_name: names.get(String(r.recorded_by)) ?? null,
      recorded_at: String(r.recorded_at),
      check_result: (r.check_result as DutyProof['check_result']) ?? null,
      corrected_amount: r.corrected_amount === null || r.corrected_amount === undefined ? null : Number(r.corrected_amount),
      check_note: (r.check_note as string | null) ?? null,
      revoked_at: (r.revoked_at as string | null) ?? null,
    }));
  },

  /** Record a second check. Never changes the item itself. */
  async recordSecondCheck(supabase: SupabaseClient, input: DutyProofSecondCheckInput): Promise<string> {
    const { data, error } = await supabase.rpc('fn_hr_duty_proof_second_check', {
      p_duty: input.duty,
      p_item_id: input.itemId,
      p_result: input.result,
      p_corrected_amount: input.result === 'corrected' ? input.correctedAmount ?? null : null,
      p_note: input.note ?? null,
    });
    if (error) throw toDutyProofError(error);
    return String(data);
  },

  /** Record a file already uploaded to the hr-duty-proofs bucket. */
  async attachFile(supabase: SupabaseClient, input: DutyProofAttachFileInput): Promise<string> {
    const { data, error } = await supabase.rpc('fn_hr_duty_proof_attach_file', {
      p_duty: input.duty,
      p_item_id: input.itemId,
      p_storage_path: input.storagePath,
      p_file_name: input.fileName,
    });
    if (error) throw toDutyProofError(error);
    return String(data);
  },
};
