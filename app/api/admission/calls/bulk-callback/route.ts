export const dynamic = 'force-dynamic';

// app/api/admission/calls/bulk-callback/route.ts
// GET  /api/admission/calls/bulk-callback?institution_id=&status=pending — List callback queue entries
// POST /api/admission/calls/bulk-callback — Initiate calls for queued callbacks

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
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
    const institutionId = searchParams.get('institution_id') || undefined;
    const status = searchParams.get('status') || 'pending';

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('admission_callback_queue')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(50);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('admission/calls', 'Fetch callback queue error', error);
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error) {
    logger.error('admission/calls', 'Callback queue GET error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

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

    const supabase = createServiceRoleClient();
    const { callbackIds } = await request.json();

    if (!Array.isArray(callbackIds) || callbackIds.length === 0) {
      return NextResponse.json({ error: 'callbackIds required' }, { status: 400 });
    }

    if (callbackIds.length > 20) {
      return NextResponse.json({ error: 'Max 20 callbacks at once' }, { status: 400 });
    }

    // Get authenticated user's profile for counselor_phone
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, phone')
      .eq('id', user.id)
      .single();

    const counselorPhone = profile?.phone || '';

    // Fetch callback entries
    const { data: entries } = await supabase
      .from('admission_callback_queue')
      .select('id, caller_number, institution_id, lead_id')
      .in('id', callbackIds)
      .eq('status', 'pending');

    if (!entries?.length) {
      return NextResponse.json({ error: 'No pending callbacks found' }, { status: 404 });
    }

    logger.info('admission/calls', 'Bulk callback initiated', {
      userId: user.id,
      count: entries.length,
    });

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const entry of entries) {
      try {
        // Mark as in_progress
        await supabase
          .from('admission_callback_queue')
          .update({ status: 'in_progress' })
          .eq('id', entry.id);

        // Initiate call via TelephonyService
        // counselor_id = authenticated user, caller_id falls back to EXOTEL_CALLER_ID env var
        const callResult = await TelephonyService.initiateCall({
          institution_id: entry.institution_id,
          counselor_id: user.id,
          counselor_phone: counselorPhone,
          prospect_phone: entry.caller_number,
          lead_id: entry.lead_id ?? undefined,
        }, supabase);

        if (callResult.success) {
          // Link callback to return call
          await supabase
            .from('admission_callback_queue')
            .update({
              callback_call_id: callResult.call_log_id,
            })
            .eq('id', entry.id);
        }

        results.push({ id: entry.id, success: callResult.success, error: callResult.error });
      } catch (error) {
        results.push({ id: entry.id, success: false, error: String(error) });
      }
    }

    return NextResponse.json({ results, initiated: results.filter(r => r.success).length });
  } catch (error) {
    logger.error('admission/calls', 'Bulk callback POST error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
