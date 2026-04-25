// lib/services/accreditation/iiqa-service.ts
// ============================================================================
// IIQA submission service — PR-IIQA-1 (Foundation slice).
//
// At this slice the service exposes ONE function: the canonical
// "is this institution IIQA-eligible?" filter. Subsequent IIQA PRs (2-4)
// will extend this file with snapshot CRUD, certificate CRUD, readiness
// computation, and the Generate-Pack export.
//
// Eligibility rule: institutions.iqac_code IS NOT NULL AND is_active.
// This same predicate already drives:
//   - PR-A6a's grievance_categories seed (40 rows = 5 cats × 8 colleges)
//   - PR #413's super_admin institution picker
// Centralized here so the rule has ONE source of truth across all IIQA
// pages (manage/edit, certificates, snapshots, dashboard).
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface IiqaEligibleInstitution {
  id: string;
  name: string;
  iqac_code: string;
}

/**
 * Returns the 8 JKKN colleges (alphabetically) that are eligible for IIQA
 * submission. NAAC accredits HEIs only — schools (CBSE/state board), admin
 * offices (JKKN Main Office), and non-JKKN entities (Jicate Solutions, test
 * institutions) are excluded by the iqac_code IS NOT NULL filter.
 *
 * Use this everywhere the UI needs to scope to "IIQA institutions":
 *   - Landing card grid
 *   - Per-institution route param validation
 *   - Bulk-upload institution picker
 *   - Generate-Pack institution selector
 *
 * If JKKN onboards a 9th college in the future, assigning iqac_code on the
 * institutions row is enough to opt it in — no code change required.
 */
export async function listIiqaEligibleInstitutions(): Promise<IiqaEligibleInstitution[]> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await (supabase as any)
    .from('institutions')
    .select('id, name, iqac_code')
    .not('iqac_code', 'is', null)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as IiqaEligibleInstitution[];
}
