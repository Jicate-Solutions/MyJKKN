import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';
import { resolveBosAccess, hasAnyBosPermission, BOS_LOOKUP_VIEW_KEYS } from '@/lib/utils/bos/bos-access';

interface CoeInstitution {
  id: string;
  institution_code: string;
  name: string;
  myjkkn_institution_ids: string[] | null;
  is_active: boolean;
}

interface InstitutionOption {
  id: string;                       // Primary MyJKKN UUID (first in the list)
  name: string;                     // Display name sourced from COE (authoritative)
  institution_code: string;
  myjkkn_institution_ids: string[]; // All related MyJKKN UUIDs (>1 for CAS Aided+Self)
}

// ── GET /api/bos/institutions ─────────────────────────────────────────────────
// Institutions list for BoS dropdowns. Pulled from JKKN_COE (MDM source) and
// flattened by `myjkkn_institution_ids` so each returned row's `id` is a
// MyJKKN UUID that matches `bos_meetings.institution_id` / `bos_compositions.institution_id`
// foreign keys.
//
// Super admin → every COE-mapped MyJKKN institution.
// Non-admin   → only the caller's own institution (if it has a COE mapping).
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);

    const coe = CoeRestClient.create();
    const coeInstitutions = await coe.get<CoeInstitution[]>('/api/v1/institutions');

    // Group by COE institution (institution_code|name) — one row per COE unit.
    // CAS has ONE COE entry whose myjkkn_institution_ids contains TWO MyJKKN UUIDs
    // (Aided + Self-Financed); both are captured in myjkkn_institution_ids so
    // downstream callers (programs dropdown) can fetch programs for all variants.
    const grouped = new Map<string, InstitutionOption>();
    for (const ci of coeInstitutions ?? []) {
      const key = `${ci.institution_code}|${ci.name}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: (ci.myjkkn_institution_ids ?? [])[0] ?? '',
          name: ci.name,
          institution_code: ci.institution_code,
          myjkkn_institution_ids: [...(ci.myjkkn_institution_ids ?? [])],
        });
      } else {
        // Merge IDs from duplicate COE entries (data-entry artifact).
        const existing = grouped.get(key)!;
        for (const id of ci.myjkkn_institution_ids ?? []) {
          if (id && !existing.myjkkn_institution_ids.includes(id)) {
            existing.myjkkn_institution_ids.push(id);
          }
        }
      }
    }

    const flattened = Array.from(grouped.values()).filter((o) => !!o.id);

    // Read-only observer: any BoS lookup view grant (courses/scheme/syllabus)
    // lifts the own-institution filter so dropdowns can browse ALL institutions.
    // VIEW ONLY — writes stay gated by guard*Write on the mutating routes.
    const canReadAll =
      scope.isSuperAdmin || (await hasAnyBosPermission(user.id, BOS_LOOKUP_VIEW_KEYS));

    // Non-admin, non-observer scope → only the caller's own institution.
    const visible = canReadAll
      ? flattened
      : scope.institutionsId
        ? flattened.filter((r) => r.myjkkn_institution_ids.includes(scope.institutionsId!))
        : [];

    visible.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(visible);
  } catch (error) {
    console.error('[bos/institutions] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 });
  }
}
