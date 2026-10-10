export const dynamic = 'force-dynamic';

// app/api/admission/calls/bulk-callback/route.ts
// GET  /api/admission/calls/bulk-callback?institution_id=&status=pending — List callback queue entries
// POST /api/admission/calls/bulk-callback — Initiate calls for queued callbacks
//
// Guard: the queue holds caller phone numbers of parents and prospective
// learners (lead data), and POST moves rows to in_progress and places billed
// outbound calls. Through the withAuth triad (super admin / is_admin /
// user_has_permission):
//   GET  requires 'admission.leads.view'
//   POST requires 'admission.leads.edit'
// Every row read or called must belong to an institution the caller can
// access (createApiInstitutionFilter). "All institutions" is granted ONLY
// when the filter says so explicitly (super admin, or the admission-global
// role); an empty institution list otherwise means NO institutions, so GET
// returns [] and POST is refused. Refusals are explicit { success:false }
// 403s, never silent. DB error details are logged, never sent to the client.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/auth/with-auth';
import { errorResponse } from '@/lib/api/response';
import {
  createApiInstitutionFilter,
  type ApiInstitutionFilterResult,
} from '@/lib/auth/api-institution-filter';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

const VIEW_PERMISSION = 'admission.leads.view';
const CALL_PERMISSION = 'admission.leads.edit';

const MAX_CALLBACKS = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function internalError() {
  return NextResponse.json(
    { success: false, error: 'INTERNAL_ERROR', message: 'Internal server error' },
    { status: 500 }
  );
}

/**
 * True only when the filter EXPLICITLY grants every institution: super admin,
 * or the admission-global role with an empty list (the filter's bypass answer).
 * An empty list for anyone else means no institutions, never all of them.
 * Same rule as institutionInScope() in calls/initiate/route.ts (#4321).
 */
function hasAllInstitutions(scope: ApiInstitutionFilterResult): boolean {
  return (
    scope.isAllowed &&
    (scope.isSuperAdmin || (scope.userRole === 'admission' && scope.institutionIds.length === 0))
  );
}

function institutionInScope(scope: ApiInstitutionFilterResult, institutionId: string): boolean {
  return (
    hasAllInstitutions(scope) ||
    (scope.isAllowed && scope.institutionIds.includes(institutionId))
  );
}

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const institutionId = searchParams.get('institution_id') || undefined;
    const status = searchParams.get('status') || 'pending';

    const scope = await createApiInstitutionFilter(
      request,
      institutionId ? { allowSpecificInstitution: institutionId } : {}
    );
    if (!scope.isAllowed) {
      return errorResponse(
        institutionId
          ? 'You do not have access to this institution\'s callback queue'
          : 'You do not have access to any institution\'s callback queue',
        403
      );
    }

    const allInstitutions = hasAllInstitutions(scope);
    if (!allInstitutions && scope.institutionIds.length === 0) {
      // Allowed, but with no institutions: nothing to show.
      return NextResponse.json([]);
    }

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('admission_callback_queue')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(50);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    if (!allInstitutions) {
      query = query.in('institution_id', scope.institutionIds);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('admission/calls', 'Fetch callback queue error', error);
      return internalError();
    }

    return NextResponse.json(data || []);
  } catch (error) {
    logger.error('admission/calls', 'Callback queue GET error', error);
    return internalError();
  }
}, { allowApiKey: false, requirePermission: VIEW_PERMISSION });

export const POST = withAuth(async (request: NextRequest, auth) => {
  try {
    const user = auth.user;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Request body must be JSON', 400);
    }
    const callbackIds = (body as { callbackIds?: unknown } | null)?.callbackIds;

    // 1-20 callback ids, each a UUID string, checked before any DB call.
    if (!Array.isArray(callbackIds) || callbackIds.length === 0) {
      return errorResponse('callbackIds required', 400);
    }
    if (callbackIds.length > MAX_CALLBACKS) {
      return errorResponse(`Max ${MAX_CALLBACKS} callbacks at once`, 400);
    }
    if (!callbackIds.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      return errorResponse('Every callbackId must be a UUID', 400);
    }

    // Every requested callback must sit inside the caller's institutions.
    // Checked across ALL requested ids (any status) before anything is
    // updated or any call is placed.
    const scope = await createApiInstitutionFilter(request);
    if (!scope.isAllowed || (!hasAllInstitutions(scope) && scope.institutionIds.length === 0)) {
      return errorResponse('You do not have access to any institution\'s callback queue', 403);
    }

    const supabase = createServiceRoleClient();

    const { data: requested, error: requestedError } = await supabase
      .from('admission_callback_queue')
      .select('id, institution_id')
      .in('id', callbackIds);

    if (requestedError) {
      logger.error('admission/calls', 'Bulk callback scope lookup error', requestedError);
      return internalError();
    }

    const outOfScope = (requested || []).some(
      (row: { institution_id: string }) => !institutionInScope(scope, row.institution_id)
    );
    if (outOfScope) {
      return errorResponse('One or more callbacks belong to an institution you cannot access', 403);
    }

    // Get authenticated user's profile for counselor_phone
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, phone')
      .eq('id', user.id)
      .single();

    const counselorPhone = profile?.phone || '';

    // Fetch callback entries
    const { data: entries } = await supabase
      .from('admission_callback_queue')
      .select('id, caller_number, institution_id, lead_id')
      .in('id', callbackIds)
      .eq('status', 'pending');

    if (!entries?.length) {
      return NextResponse.json({ error: 'No pending callbacks found' }, { status: 404 });
    }

    logger.info('admission/calls', 'Bulk callback initiated', {
      userId: user.id,
      count: entries.length,
    });

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const entry of entries) {
      try {
        // Mark as in_progress
        await supabase
          .from('admission_callback_queue')
          .update({ status: 'in_progress' })
          .eq('id', entry.id);

        // Initiate call via TelephonyService
        // counselor_id = authenticated user, caller_id falls back to EXOTEL_CALLER_ID env var
        const callResult = await TelephonyService.initiateCall({
          institution_id: entry.institution_id,
          counselor_id: user.id,
          counselor_phone: counselorPhone,
          prospect_phone: entry.caller_number,
          lead_id: entry.lead_id ?? undefined,
        }, supabase);

        if (callResult.success) {
          // Link callback to return call
          await supabase
            .from('admission_callback_queue')
            .update({
              callback_call_id: callResult.call_log_id,
            })
            .eq('id', entry.id);
        }

        results.push({ id: entry.id, success: callResult.success, error: callResult.error });
      } catch (error) {
        logger.error('admission/calls', 'Bulk callback call error', { id: entry.id, error });
        results.push({ id: entry.id, success: false, error: 'Call could not be placed' });
      }
    }

    return NextResponse.json({ results, initiated: results.filter(r => r.success).length });
  } catch (error) {
    logger.error('admission/calls', 'Bulk callback POST error', error);
    return internalError();
  }
}, { allowApiKey: false, requirePermission: CALL_PERMISSION });
