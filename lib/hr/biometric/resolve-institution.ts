/**
 * Resolve the institution a biometric export came from.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
 *
 * Each machine is configured with:
 *   Dept. Name → institutions.counselling_code
 *   CompName   → institutions.name
 *
 * Both are used, because counselling_code is NOT unique: "CAS" belongs to both
 * Arts and Science (Self) and (Aided), and Testing Institution / Incubation
 * Forum carry the placeholder codes "1234" / "123". Rather than migrate
 * counselling_code — which admissions also depends on — the name breaks the tie.
 *
 * The whole table is 14 rows, so it is fetched once and matched in JS. That
 * avoids escaping a user-supplied string into an ilike pattern.
 *
 * NOTE: this resolves which MACHINE produced the file. It does NOT determine
 * any employee's institution — verified against the real export, 13 of the 36
 * identified people on the Main Office machine belong to other institutions.
 * Each staff member's institution always comes from staff.institution_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface InstitutionCandidate {
  id: string;
  name: string;
  counselling_code: string | null;
}

export interface InstitutionResolution {
  institution: InstitutionCandidate | null;
  matchedBy: 'code' | 'code+name' | 'name' | null;
  /** Set when resolution failed; safe to show the user. */
  error: string | null;
  /** Populated on an ambiguous match so the UI can name the options. */
  candidates: InstitutionCandidate[];
}

const norm = (v: string | null | undefined): string =>
  (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export async function resolveInstitutionFromReport(
  supabase: SupabaseClient,
  deptName: string,
  compName: string,
): Promise<InstitutionResolution> {
  const { data, error } = await supabase
    .from('institutions')
    .select('id, name, counselling_code')
    .limit(500);

  if (error) throw error;

  const all = (data ?? []) as InstitutionCandidate[];
  const wantCode = norm(deptName);
  const wantName = norm(compName);

  const empty: InstitutionResolution = {
    institution: null, matchedBy: null, error: null, candidates: [],
  };

  if (!wantCode && !wantName) {
    return {
      ...empty,
      error:
        'The file carries neither a Dept. Name nor a CompName, so the institution cannot be identified. Configure the machine with the institution code and name.',
    };
  }

  // 1. By code.
  const byCode = wantCode ? all.filter((i) => norm(i.counselling_code) === wantCode) : [];

  if (byCode.length === 1) {
    return { ...empty, institution: byCode[0], matchedBy: 'code' };
  }

  // 2. Ambiguous code — break the tie with the name (the CAS case).
  if (byCode.length > 1) {
    const tie = byCode.filter((i) => norm(i.name) === wantName);
    if (tie.length === 1) {
      return { ...empty, institution: tie[0], matchedBy: 'code+name' };
    }
    return {
      ...empty,
      candidates: byCode,
      error:
        `The code "${deptName}" matches ${byCode.length} institutions (${byCode.map((i) => i.name).join(', ')}) ` +
        `and CompName "${compName}" does not single one out. Set CompName on the machine to the exact institution name.`,
    };
  }

  // 3. No code match — fall back to the name.
  const byName = wantName ? all.filter((i) => norm(i.name) === wantName) : [];
  if (byName.length === 1) {
    return { ...empty, institution: byName[0], matchedBy: 'name' };
  }
  if (byName.length > 1) {
    return {
      ...empty,
      candidates: byName,
      error: `CompName "${compName}" matches ${byName.length} institutions. Set a unique institution code in Dept. Name on the machine.`,
    };
  }

  return {
    ...empty,
    error:
      `No institution matches Dept. Name "${deptName}" or CompName "${compName}". ` +
      `Set Dept. Name on the machine to the institution's code (e.g. MO, DCH, CET).`,
  };
}
