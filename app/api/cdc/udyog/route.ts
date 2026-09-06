// app/api/cdc/udyog/route.ts — UNNATI → UDYOG apply-tracker (BUG-004075).
// GET: list UDYOG requirements for the caller's institution scope, joined with
// learner + source-programme names, plus the configured external portal URL.
//
// Reads use the SERVICE-ROLE client because CDC staff hold cdc.* but NOT
// learners.* (the BUG-004044 class) — the same pattern as the learner picker and
// the career-guidance route. Institution scope is re-imposed so no cross-tenant
// requirement is ever returned.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';
import type { UdyogRequirementRow } from '@/types/cdc/udyog';

const PORTAL_URL_KEY = 'cdc.udyog.portal_url';

async function readPortalUrl(svc: ReturnType<typeof createServiceRoleClient>): Promise<string> {
  const { data } = await svc
    .from('platform_policies')
    .select('value')
    .eq('policy_key', PORTAL_URL_KEY)
    .eq('scope_type', 'global')
    .maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  return typeof v === 'string' ? v : '';
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: canView } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.udyog.view' });
    if (canView !== true) return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });

    const filter = await createApiInstitutionFilter(req);
    if (!filter.isAllowed) {
      return NextResponse.json({ error: filter.reason ?? 'Not authorized' },
        { status: filter.reason === 'User not authenticated' ? 401 : 403 });
    }

    const svc = createServiceRoleClient();
    let query: any = svc
      .from('cdc_udyog_requirements')
      .select(`
        id, learner_id, source_programme_id, institution_id, status, udyog_reference,
        due_date, directed_at, applied_at, waived_reason, created_at, updated_at,
        learner:learners_profiles(first_name, last_name, register_number),
        programme:cdc_training_programmes(name)
      `)
      .order('created_at', { ascending: false });
    query = applyInstitutionFilterToQuery(query, filter, 'institution_id');
    const { data, error } = await query;

    if (error) {
      console.error('[cdc/udyog] list failed:', error);
      return NextResponse.json({ error: 'Could not load requirements.' }, { status: 500 });
    }

    const portalUrl = await readPortalUrl(svc);
    return NextResponse.json({ requirements: (data ?? []) as UdyogRequirementRow[], portalUrl });
  } catch (e) {
    console.error('[cdc/udyog] GET unexpected error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
