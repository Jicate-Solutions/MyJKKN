export const dynamic = 'force-dynamic';

// app/api/admission/calls/initiate/route.ts
// POST /api/admission/calls/initiate — Initiate a click-to-call via Exotel

import { NextRequest, NextResponse } from 'next/server';
import { isValidIndianMobile, maskPhone, normalizeIndianPhone } from '@/lib/utils/phone-number';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check Exotel configuration
    if (!TelephonyService.isConfigured()) {
      return NextResponse.json(
        { error: 'NOT_CONFIGURED', message: 'Telephony service is not configured. Please set Exotel environment variables.' },
        { status: 503 }
      );
    }

    // Parse body
    const body = await request.json();
    const { institution_id, counselor_phone, prospect_phone, lead_id, caller_id } = body;

    // Validate required fields
    if (!institution_id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'institution_id is required' },
        { status: 400 }
      );
    }
    if (!counselor_phone) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'counselor_phone is required' },
        { status: 400 }
      );
    }
    if (!prospect_phone) {
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

    const supabase = createServiceRoleClient();

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
      counselor_phone: normalizeIndianPhone(counselor_phone),
      prospect_phone: normalizeIndianPhone(prospect_phone),
      lead_id,
      caller_id,
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
}
