

// app/api/admission/calls/[id]/intelligence/route.ts
// GET /api/admission/calls/[id]/intelligence — Fetch call intelligence data

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(
  _request: NextRequest,
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

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('admission_call_intelligence')
      .select('*')
      .eq('call_log_id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ intelligence: null });
    }

    return NextResponse.json({ intelligence: data });
  } catch (error) {
    logger.error('admission/calls', 'Get call intelligence error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
