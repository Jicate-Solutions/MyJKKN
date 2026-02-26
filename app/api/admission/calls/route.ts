// app/api/admission/calls/route.ts
// GET /api/admission/calls — List call logs with filters

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { TelephonyService, type CallLogFilters, type CallStatus, type CallDisposition, type CallDirection } from '@/lib/services/telephony/telephony-service';
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

    // Parse query params
    const { searchParams } = request.nextUrl;
    const institution_id = searchParams.get('institution_id');

    if (!institution_id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'institution_id query parameter is required' },
        { status: 400 }
      );
    }

    const filters: CallLogFilters = {
      institution_id,
      counselor_id: searchParams.get('counselor_id') || undefined,
      lead_id: searchParams.get('lead_id') || undefined,
      status: (searchParams.get('status') as CallStatus) || undefined,
      disposition: (searchParams.get('disposition') as CallDisposition) || undefined,
      direction: (searchParams.get('direction') as CallDirection) || undefined,
      from_date: searchParams.get('from') || searchParams.get('from_date') || undefined,
      to_date: searchParams.get('to') || searchParams.get('to_date') || undefined,
      has_notes: searchParams.get('has_notes') === 'true' ? true : searchParams.get('has_notes') === 'false' ? false : undefined,
      search: searchParams.get('search') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
    };

    const result = await TelephonyService.getCallLogs(filters);

    return NextResponse.json({
      success: true,
      data: result.logs,
      metadata: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    logger.error('admission/calls', 'Get call logs error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
