export const dynamic = 'force-dynamic';

// app/api/admission/calls/stats/route.ts
// GET /api/admission/calls/stats — Call analytics

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService, type CallDirection } from '@/lib/services/telephony/telephony-service';
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
    // institution_id is optional — omitting it aggregates across all institutions (super admins).
    const institution_id = searchParams.get('institution_id') || undefined;

    const fromDate = searchParams.get('from') || searchParams.get('from_date') || undefined;
    const toDate = searchParams.get('to') || searchParams.get('to_date') || undefined;
    const direction = searchParams.get('direction') as CallDirection | null;
    const admissionOnlyParam = searchParams.get('admission_only');
    const admissionOnly = admissionOnlyParam === 'false' ? false : true; // default to true

    const supabase = createServiceRoleClient();

    // If direction=inbound, return inbound-specific stats with hourly distribution, callback status, etc.
    if (direction === 'inbound') {
      const inboundStats = await TelephonyService.getInboundCallStats(
        institution_id,
        supabase,
        fromDate,
        toDate,
        admissionOnly
      );
      return NextResponse.json({ success: true, data: inboundStats });
    }

    // Default: general stats (optionally filtered by direction)
    const stats = await TelephonyService.getCallStats(
      institution_id,
      supabase,
      fromDate,
      toDate,
      admissionOnly
    );

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
