// app/api/admission/calls/initiate/route.ts
// POST /api/admission/calls/initiate — Initiate a click-to-call via Exotel

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
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

    logger.info('admission/calls', 'Initiating call', {
      userId: user.id,
      leadId: lead_id,
      to: prospect_phone,
    });

    const result = await TelephonyService.initiateCall({
      institution_id,
      counselor_id: user.id,
      counselor_phone,
      prospect_phone,
      lead_id,
      caller_id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: 'CALL_FAILED', message: result.error || 'Failed to initiate call' },
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
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
