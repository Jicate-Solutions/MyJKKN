// app/api/admission/calls/[id]/details/route.ts
// GET /api/admission/calls/[id]/details — Fetch call details (DB + Exotel)

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Call ID is required' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Fetch call log from DB
    const { data: callLog, error } = await supabase
      .from('admission_call_logs')
      .select('*, lead:admission_leads(id, full_name, phone), counselor:profiles!counselor_id(id, full_name)')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('admission/calls', 'Call detail query error', { id, error });
      return NextResponse.json(
        { error: 'QUERY_ERROR', message: error.message },
        { status: 500 }
      );
    }

    if (!callLog) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Call log not found' },
        { status: 404 }
      );
    }

    // Fetch live details from Exotel (if call has a real SID)
    let exotelDetails = null;
    if (callLog.call_sid && !callLog.call_sid.startsWith('pending-')) {
      exotelDetails = await TelephonyService.getCallDetails(callLog.call_sid);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...callLog,
        exotel: exotelDetails?.Call || null,
      },
    });
  } catch (error) {
    logger.error('admission/calls', 'Get call details error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
