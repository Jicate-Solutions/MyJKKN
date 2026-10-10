export const dynamic = 'force-dynamic';

// app/api/admission/calls/initiate/route.ts
// POST /api/admission/calls/initiate — Initiate a click-to-call via Exotel
//
// Guard: this bridges two phones through JKKN's billed Exotel account with
// JKKN's caller ID. Placing a billed call is a write on a lead, so it requires
// 'admission.leads.edit' through withAuth, an institution_id inside the
// caller's institutions, and a lead (when given) from that institution.
// The counsellor leg always rings the caller's OWN profile phone; the body's
// counselor_phone and caller_id are accepted for compatibility but ignored.
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
    const body = await request.json();
    // counselor_phone and caller_id are deliberately not read (see header).
    const { institution_id, prospect_phone, lead_id } = body;

    // Validate required fields
    if (!isUuid(institution_id)) {
      return errorResponse('institution_id is required and must be a valid id', 400);
    }
    if (lead_id !== undefined && lead_id !== null && lead_id !== '' && !isUuid(lead_id)) {
      return errorResponse('lead_id must be a valid id', 400);
    }
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
      allowSpecificInstitution: institution_id,
    });
    if (!institutionInScope(scope, institution_id)) {
      return errorResponse('You do not have access to place calls for this institution', 403);
    }

    const supabase = createServiceRoleClient();

    // A lead, when given, must exist and belong to the same institution.
    if (lead_id) {
      const { data: lead, error: leadError } = await supabase
        .from('admission_leads')
        .select('id, institution_id')
        .eq('id', lead_id)
        .maybeSingle();
      if (leadError) {
        logger.error('admission/calls', 'Initiate call lead lookup error', leadError);
        return errorResponse('Could not verify the lead for this call', 500);
      }
      if (!lead || lead.institution_id !== institution_id) {
        return errorResponse('This lead does not belong to the selected institution', 403);
      }
    }

    // The counsellor leg always rings the caller's own profile phone.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, phone')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) {
      logger.error('admission/calls', 'Initiate call profile lookup error', profileError);
      return errorResponse('Could not read your profile to place the call', 500);
    }
    const profilePhone: string = profile?.phone || '';
    if (!profilePhone || !isValidIndianMobile(profilePhone)) {
      return errorResponse('Add your mobile number to your profile to place calls', 400);
    }
    const counselorPhone = normalizeIndianPhone(profilePhone);

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
      leadId: lead_id,
      to: maskPhone(prospect_phone),
    });

    const result = await TelephonyService.initiateCall({
      institution_id,
      counselor_id: user.id,
      counselor_phone: counselorPhone,
      prospect_phone: normalizeIndianPhone(prospect_phone),
      lead_id,
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
