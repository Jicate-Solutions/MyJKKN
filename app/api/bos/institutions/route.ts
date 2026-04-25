import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';

interface CoeInstitution {
  id: string;
  institution_code: string;
  name: string;
  myjkkn_institution_ids: string[] | null;
  is_active: boolean;
}

interface InstitutionOption {
  id: string;                    // MyJKKN UUID (used as FK in bos_* tables)
  name: string;                  // Display name sourced from COE (authoritative)
  institution_code: string;
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

    // Flatten: one row per (COE institution × MyJKKN UUID), then dedupe by `id`.
    // The same MyJKKN UUID can appear under multiple COE institutions' mapping arrays
    // (data-entry artifact); we keep the first occurrence so the dropdown shows
    // each MyJKKN institution exactly once.
    const dedupedById = new Map<string, InstitutionOption>();
    for (const ci of coeInstitutions ?? []) {
      for (const myjkknId of ci.myjkkn_institution_ids ?? []) {
        if (!myjkknId || dedupedById.has(myjkknId)) continue;
        dedupedById.set(myjkknId, {
          id: myjkknId,
          name: ci.name,
          institution_code: ci.institution_code,
        });
      }
    }

    // Secondary dedupe: same display (institution_code|name) → keep first.
    // Guards against COE-side data where two distinct rows share name/code.
    const dedupedByDisplay = new Map<string, InstitutionOption>();
    for (const row of dedupedById.values()) {
      const key = `${row.institution_code}|${row.name}`;
      if (!dedupedByDisplay.has(key)) dedupedByDisplay.set(key, row);
    }

    const flattened = Array.from(dedupedByDisplay.values());

    // Non-admin scope → only the caller's own institution.
    const visible = scope.isSuperAdmin
      ? flattened
      : scope.institutionsId
        ? flattened.filter((r) => r.id === scope.institutionsId)
        : [];

    visible.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(visible);
  } catch (error) {
    console.error('[bos/institutions] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 });
  }
}
