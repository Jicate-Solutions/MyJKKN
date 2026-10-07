// Login-free access code on a tournament entry (shown on the entry's pass).
// Shared by self-service registration (public-register) and organiser spot
// entries (spot-entry), so both mint codes the same way.

import type { SupabaseClient } from '@supabase/supabase-js';

// Unambiguous alphabet for the login-free access code: no O/0/I/1.
const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateAccessCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ACCESS_CODE_ALPHABET[Math.floor(Math.random() * ACCESS_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Insert a tournament_entries row with a unique access code. The code is
 * retried on the unique-index collision (23505 on uq_tournament_entries_access_code).
 * If the migration that adds access_code / institution_school_id has not been
 * applied (42703 undefined_column), it falls back to a plain insert so the
 * entry is still created — the code is simply absent until the column exists.
 */
export async function insertEntryWithAccessCode(
  svc: SupabaseClient,
  entryBase: Record<string, unknown>,
  institutionSchoolId: string | null
): Promise<{
  entry: { id: string } | null;
  accessCode: string | null;
  error: { code?: string; message?: string; details?: string } | null;
}> {
  let entry: { id: string } | null = null;
  let entryErr: { code?: string; message?: string; details?: string } | null = null;
  let accessCode: string | null = null;
  let extendedCols = true; // access_code + institution_school_id columns present?

  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateAccessCode();
    const payload = extendedCols
      ? { ...entryBase, access_code: candidate, institution_school_id: institutionSchoolId }
      : { ...entryBase };
    const ins = await (svc as any)
      .from('tournament_entries')
      .insert(payload)
      .select('id')
      .single();
    if (!ins.error && ins.data) {
      entry = ins.data as { id: string };
      entryErr = null;
      accessCode = extendedCols ? candidate : null;
      break;
    }
    entryErr = ins.error;
    const blob = `${ins.error?.code ?? ''} ${ins.error?.message ?? ''} ${ins.error?.details ?? ''}`;
    if (ins.error?.code === '23505' && /access_code/i.test(blob)) {
      continue; // code already taken — regenerate and retry
    }
    if (ins.error?.code === '42703' && /(access_code|institution_school_id)/i.test(blob) && extendedCols) {
      extendedCols = false; // migration not applied yet — retry without the new columns
      continue;
    }
    break; // a genuinely different failure — stop retrying
  }

  return { entry, accessCode, error: entry ? null : entryErr };
}
