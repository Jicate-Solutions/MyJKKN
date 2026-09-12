export const dynamic = 'force-dynamic';

// ============================================================================
// /api/hr/workload/settings — per-institution workload settings
// ----------------------------------------------------------------------------
// GET  every institution with its expected weekly teaching hours + amber/red
//      bands (nulls where the institution has not set them yet).
// PUT  { institution_id, expected_weekly_hours, amber_pct, red_pct } — saves
//      that one institution's three platform_policies rows.
//
// ACCESS: HR Admin (held as any role) or Super Admin. Everyone else gets an
// explicit 403 with the reason — never a redirect. Reads use the session
// client; the write uses the service-role client ONLY after the role check
// (platform_policies RLS admits profiles.role admins, not an hr_admin held via
// user_roles — see workload-settings-service header).
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { errorResponse, forbiddenResponse, unauthorizedResponse } from '@/lib/api/response';
import {
  WorkloadSettingsService,
  resolveWorkloadSettingsAccess,
  validateWorkloadSettings,
} from '@/lib/services/hr/recruitment-need/workload-settings-service';

async function authorise() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { denied: unauthorizedResponse('Sign in to view workload settings') };
  const access = await resolveWorkloadSettingsAccess(supabase, user.id);
  // `=== false` rather than `!`: strictNullChecks is off in tsconfig, and
  // truthiness does not narrow a discriminated union without it.
  if (access.allowed === false) return { denied: forbiddenResponse(access.reason) };
  return { supabase, user };
}

export async function GET() {
  try {
    const auth = await authorise();
    if ('denied' in auth) return auth.denied;
    const data = await WorkloadSettingsService.list(auth.supabase);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[hr/workload/settings] GET error', err);
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorise();
    if ('denied' in auth) return auth.denied;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return errorResponse('Request body must be JSON', 400, 'BAD_REQUEST');
    }
    const institutionId = typeof body?.institution_id === 'string' ? body.institution_id : '';
    if (!institutionId) return errorResponse('institution_id is required', 400, 'BAD_REQUEST');

    const parsed = validateWorkloadSettings(body);
    if (parsed.ok === false) return errorResponse(parsed.error, 400, 'BAD_REQUEST');

    const { data: institution } = await auth.supabase
      .from('institutions')
      .select('id, name')
      .eq('id', institutionId)
      .maybeSingle();
    if (!institution) return errorResponse('Institution not found', 404, 'NOT_FOUND');

    await WorkloadSettingsService.save(createServiceRoleClient(), institutionId, parsed.value, auth.user.id);

    return NextResponse.json({
      success: true,
      data: {
        institution_id: institution.id,
        institution_name: institution.name,
        ...parsed.value,
      },
    });
  } catch (err) {
    console.error('[hr/workload/settings] PUT error', err);
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
