// app/api/admission/calls/stats/route.ts
// GET /api/admission/calls/stats — Call analytics

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const institution_id = searchParams.get('institution_id');

    if (!institution_id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'institution_id query parameter is required' },
        { status: 400 }
      );
    }

    const fromDate = searchParams.get('from') || searchParams.get('from_date') || undefined;
    const toDate = searchParams.get('to') || searchParams.get('to_date') || undefined;

    const stats = await TelephonyService.getCallStats(institution_id, fromDate, toDate);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('admission/calls', 'Get call stats error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
