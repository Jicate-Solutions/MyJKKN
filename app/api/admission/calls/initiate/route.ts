export const dynamic = 'force-dynamic';

// app/api/admission/calls/initiate/route.ts
// POST /api/admission/calls/initiate — Initiate a click-to-call via Exotel
//
// Guard: this bridges two phones through JKKN's billed Exotel account with
// JKKN's caller ID. Placing a billed call is a write on a lead, so it requires
// 'admission.leads.edit' through withAuth, an institution_id inside the
// caller's institutions, and a lead (when given) from that institution.
// Only an ACTIVE admission counsellor (a row in admission_counselors) may
// place calls, and the counsellor leg always rings that row's admin-set WORK
// number (Director ruling 11 Oct 2026: only admins set it), never the
// self-editable profile phone. The body's counselor_phone and caller_id are
// accepted for compatibility but ignored.
// The route no longer passes caller_id, so TelephonyService.initiateCall falls
// back to its existing getCounselorExoPhone() resolution (agent map, then
// EXOTEL_CALLER_ID, then the hardcoded admission IVR number).
// Refusals are explicit { success:false } responses.

import { NextRequest, NextResponse } from 'next/server';
import { isValidIndianMobile, maskPhone, normalizeIndianPhone } from '@/lib/utils/phone-number';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/auth/with-auth';
import { errorResponse } from '@/lib/api/response';
import {
  createApiInstitutionFilter,
  type ApiInstitutionFilterResult,
} from '@/lib/auth/api-institution-filter';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

const CALLS_PERMISSION = 'admission.leads.edit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * True only when the filter explicitly grants this institution. An empty list
 * means "every institution" ONLY for an explicit all-institutions answer
 * (super admin, or the admission-global scope); for anyone else an empty
 * list means no access.
 */
function institutionInScope(scope: ApiInstitutionFilterResult, institutionId: string): boolean {
  if (!scope.isAllowed) return false;
  const allInstitutions =
    scope.isSuperAdmin || (scope.userRole === 'admission' && scope.institutionIds.length === 0);
  return allInstitutions || scope.institutionIds.includes(institutionId);
}

export const POST = withAuth(async (request: NextRequest, auth) => {
  try {
    const user = auth.user;

    // Check Exotel configuration
    if (!TelephonyService.isConfigured()) {
      return NextResponse.json(
        { error: 'NOT_CONFIGURED', message: 'Telephony service is not configured. Please set Exotel environment variables.' },
        { status: 503 }
      );
    }

    // Parse body
    // A null, array, primitive, empty or malformed body is a 400, not a 500.
    let body: Record<string, any>;
    try {
      const parsed: unknown = await request.json();
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return errorResponse('Invalid request body', 400);
      }
      body = parsed as Record<string, any>;
    } catch {
      return errorResponse('Invalid request body', 400);
    }
    // counselor_phone and caller_id are deliberately not read (see header).
    const { institution_id, prospect_phone, lead_id } = body;

    // Validate required fields
    if (!isUuid(institution_id)) {
      return errorResponse('institution_id is required and must be a valid id', 400);
    }
    if (lead_id !== undefined && lead_id !== null && lead_id !== '' && !isUuid(lead_id)) {
      return errorResponse('lead_id must be a valid id', 400);
    }
    // Ids are compared case-sensitively below (scope list, lead row), so
    // lowercase them once here. An empty or absent lead_id means "no lead":
    // it never reaches the lead check or the telephony service as ''.
    const institutionId = institution_id.toLowerCase();
    const leadId = isUuid(lead_id) ? lead_id.toLowerCase() : undefined;
    if (!prospect_phone || typeof prospect_phone !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'prospect_phone is required' },
        { status: 400 }
      );
    }

    // Validate phone number format
    if (!isValidIndianMobile(prospect_phone)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid prospect phone number. Must be a valid Indian mobile number.' },
        { status: 400 }
      );
    }

    // Institution scope: super admin / admission-global = any; else own list.
    const scope = await createApiInstitutionFilter(request, {
      allowSpecificInstitution: institutionId,
    });
    if (!institutionInScope(scope, institutionId)) {
      return errorResponse('You do not have access to place calls for this institution', 403);
    }

    const supabase = createServiceRoleClient();

    // A lead, when given, must exist and belong to the same institution.
    if (leadId) {
      const { data: lead, error: leadError } = await supabase
        .from('admission_leads')
        .select('id, institution_id')
        .eq('id', leadId)
        .maybeSingle();
      if (leadError) {
        logger.error('admission/calls', 'Initiate call lead lookup error', leadError);
        return errorResponse('Could not verify the lead for this call', 500);
      }
      if (!lead || lead.institution_id !== institutionId) {
        return errorResponse('This lead does not belong to the selected institution', 403);
      }
    }

    // The counsellor leg rings the caller's WORK calling number, set by an
    // admission admin on the Counselors page (admission_counselors.phone).
    // Counsellors cannot edit that row (UPDATE needs admission.counselors.edit),
    // unlike profiles.phone_number, so the billed line never rings a number the
    // caller chose. Read with the service client because counsellors lack
    // admission.counselors.view; the filter is strictly the signed-in user id.
    const { data: counselorRows, error: counselorError } = await supabase
      .from('admission_counselors')
      .select('id, phone, institution_id')
      .eq('user_id', user.id)
      .eq('is_active', true);
    if (counselorError) {
      logger.error('admission/calls', 'Initiate call counsellor lookup error', counselorError);
      return errorResponse('Could not read your work calling number to place the call', 500);
    }
    const activeRows: Array<{ id: string; phone: string | null; institution_id: string | null }> =
      counselorRows ?? [];
    // Other roles holding admission.leads.edit (no counsellor row) may not
    // place billed calls.
    if (activeRows.length === 0) {
      return errorResponse('Only admission counsellors can place calls.', 403);
    }

    // The caller must be a counsellor FOR this institution: the row's own
    // institution_id, or an admission_counselor_institutions assignment.
    // There is no fallback to another institution's row (it would bill a call
    // to the wrong college).
    const { data: mappingRows, error: mappingError } = await supabase
      .from('admission_counselor_institutions')
      .select('counselor_id, institution_id')
      .in('counselor_id', activeRows.map((r) => r.id));
    if (mappingError) {
      logger.error('admission/calls', 'Initiate call counsellor institution lookup error', mappingError);
      return errorResponse('Could not read your work calling number to place the call', 500);
    }
    const mappedIds = new Set(
      ((mappingRows ?? []) as Array<{ counselor_id: string | null; institution_id: string | null }>)
        .filter((m) => (m.institution_id || '').toLowerCase() === institutionId)
        .map((m) => (m.counselor_id || '').toLowerCase())
    );
    const assignedRows = activeRows.filter(
      (r) =>
        (r.institution_id || '').toLowerCase() === institutionId ||
        mappedIds.has((r.id || '').toLowerCase())
    );
    if (assignedRows.length === 0) {
      return errorResponse("You're not an admission counsellor for this institution.", 403);
    }
    const workRow = assignedRows.find(
      (r) => typeof r.phone === 'string' && r.phone.trim() !== '' && isValidIndianMobile(r.phone)
    );
    if (!workRow) {
      return errorResponse(
        "Your work calling number isn't set. Ask your admission admin to add it on the Counselors page.",
        400
      );
    }
    const counselorPhone = normalizeIndianPhone(workRow.phone as string);

    // Rate limiting: max 5 calls per counselor per minute
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCallCount } = await supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('counselor_id', user.id)
      .gte('created_at', oneMinuteAgo);

    if ((recentCallCount ?? 0) >= 5) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: 'Too many calls. Please wait a moment before trying again.' },
        { status: 429 }
      );
    }

    // Duplicate call check: prevent calling same prospect within 30 seconds
    const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString();
    const normalizedProspect = normalizeIndianPhone(prospect_phone);
    const { count: duplicateCount } = await supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('counselor_id', user.id)
      .eq('to_number', normalizedProspect)
      .gte('created_at', thirtySecsAgo);

    if ((duplicateCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'DUPLICATE_CALL', message: 'A call to this number was just initiated. Please wait.' },
        { status: 429 }
      );
    }

    logger.info('admission/calls', 'Initiating call', {
      userId: user.id,
      leadId,
      to: maskPhone(prospect_phone),
    });

    const result = await TelephonyService.initiateCall({
      institution_id: institutionId,
      counselor_id: user.id,
      counselor_phone: counselorPhone,
      prospect_phone: normalizeIndianPhone(prospect_phone),
      lead_id: leadId,
    }, supabase);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'CALL_FAILED',
          message: result.error || 'Failed to initiate call',
          fallbackPhone: prospect_phone,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        call_sid: result.call_sid,
        call_log_id: result.call_log_id,
      },
      message: 'Call initiated — your phone will ring shortly',
    });
  } catch (error) {
    logger.error('admission/calls', 'Initiate call error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}, { allowApiKey: false, requirePermission: CALLS_PERMISSION });
