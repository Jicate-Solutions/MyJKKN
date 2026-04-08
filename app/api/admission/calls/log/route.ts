// POST /api/admission/calls/log — Log a manual call (counselor called from personal phone)

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import type { LogCallInput } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.lead_id || !body.institution_id || !body.call_outcome || !body.phone_called) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'lead_id, institution_id, call_outcome, and phone_called are required' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const input: LogCallInput = {
      lead_id: body.lead_id,
      institution_id: body.institution_id,
      counselor_id: user.id,
      phone_called: body.phone_called,
      call_outcome: body.call_outcome,
      interest_level: body.interest_level,
      next_action: body.next_action,
      call_notes: body.call_notes,
      follow_up_date: body.follow_up_date,
      follow_up_time: body.follow_up_time,
      suggested_stage: body.suggested_stage,
      accept_stage_change: body.accept_stage_change,
    };

    const result = await TelephonyService.logManualCall(input, supabase);

    logger.info('admission/calls', 'Manual call logged', {
      lead_id: body.lead_id,
      outcome: body.call_outcome,
      interest: body.interest_level,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('admission/calls', 'Failed to log manual call', error);
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Failed to log call' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
