// app/api/admission/calls/[id]/notes/route.ts
// PUT /api/admission/calls/[id]/notes — Update post-call notes

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { TelephonyService, type CallDisposition } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
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

    const body = await request.json();
    const { call_notes, call_disposition, follow_up_date } = body;

    logger.info('admission/calls', 'Updating call notes', {
      callId: id,
      userId: user.id,
      disposition: call_disposition,
    });

    const updatedLog = await TelephonyService.updateCallNotes(id, {
      call_notes,
      call_disposition: call_disposition as CallDisposition,
      follow_up_date: follow_up_date || null,
    });

    return NextResponse.json({
      success: true,
      data: updatedLog,
      message: 'Call notes updated successfully',
    });
  } catch (error) {
    logger.error('admission/calls', 'Update call notes error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
