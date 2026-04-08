export const dynamic = 'force-dynamic';

// app/api/admission/calls/unique-callers/route.ts
// GET /api/admission/calls/unique-callers — Group inbound calls by unique caller
// Returns caller journey data: attempt counts, location, callback status, etc.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { PhoneNumberIntelligence } from '@/lib/services/telephony/phone-number-intelligence';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      logger.warn('admission/calls/unique-callers', 'Auth failed', { authError: authError?.message });
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }
    logger.info('admission/calls/unique-callers', 'Request', { userId: user.id });

    const { searchParams } = request.nextUrl;
    const institutionId = searchParams.get('institution_id') || undefined;
    const fromDate = searchParams.get('from_date') || undefined;
    const toDate = searchParams.get('to_date') || undefined;
    const admissionOnlyParam = searchParams.get('admission_only');
    const admissionOnly = admissionOnlyParam === 'false' ? false : true; // default to true

    const supabase = createServiceRoleClient();

    // Only select columns that exist in the base schema (pre-pipeline).
    // Pipeline columns (auto_sms_sent, caller_location, etc.) may not be
    // visible to PostgREST until its schema cache refreshes after migration.
    // We compute location from PhoneNumberIntelligence instead.
    let query = supabase
      .from('admission_call_logs')
      .select(`
        id, from_number, lead_id, status, duration_seconds, cost_amount,
        created_at, started_at,
        lead:admission_leads(id, full_name, priority)
      `)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false });

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);
    if (admissionOnly) query = query.eq('is_admission_call', true);

    const { data: calls, error } = await query;
    if (error) {
      logger.error('admission/calls/unique-callers', 'Query failed', { error: error.message, code: error.code });
      throw new Error(error.message);
    }
    logger.info('admission/calls/unique-callers', 'Query result', { callCount: (calls || []).length });

    const callerMap: Record<string, any> = {};

    for (const call of (calls || [])) {
      const phone = call.from_number;
      if (!phone) continue;

      const isAnswered = (call.cost_amount ?? 0) > 0 && (call.duration_seconds ?? 0) > 0;

      if (!callerMap[phone]) {
        const location = PhoneNumberIntelligence.getLocationFromPhone(phone);
        const callTime = call.started_at || call.created_at;
        callerMap[phone] = {
          from_number: phone,
          lead_id: call.lead_id ?? (call.lead as any)?.id ?? null,
          lead_name: (call.lead as any)?.full_name ?? null,
          caller_location: location,
          total_attempts: 0,
          missed_count: 0,
          answered_count: 0,
          first_call_at: callTime,
          last_call_at: callTime,
          auto_sms_sent: false,
          callback_status: null,
          callback_priority: null,
          sla_breached: false,
          current_lead_priority: (call.lead as any)?.priority ?? null,
        };
      }

      const caller = callerMap[phone];
      const callTime = call.started_at || call.created_at;
      caller.total_attempts++;
      if (isAnswered) caller.answered_count++;
      else caller.missed_count++;
      if (call.lead_id && !caller.lead_id) {
        caller.lead_id = call.lead_id;
        caller.lead_name = (call.lead as any)?.full_name ?? null;
        caller.current_lead_priority = (call.lead as any)?.priority ?? null;
      }
      if (callTime < caller.first_call_at) caller.first_call_at = callTime;
      if (callTime > caller.last_call_at) caller.last_call_at = callTime;
    }

    const callers = Object.values(callerMap).map((caller: any) => {
      const firstCall = new Date(caller.first_call_at).getTime();
      const lastCall = new Date(caller.last_call_at).getTime();
      const daysTrying = Math.max(1, Math.ceil((lastCall - firstCall) / (1000 * 60 * 60 * 24)));
      return { ...caller, days_trying: daysTrying };
    });

    callers.sort((a: any, b: any) => {
      if (a.answered_count === 0 && b.answered_count > 0) return -1;
      if (a.answered_count > 0 && b.answered_count === 0) return 1;
      return b.total_attempts - a.total_attempts;
    });

    const totalCalls = (calls || []).length;
    const uniqueCallers = callers.length;

    return NextResponse.json({
      success: true,
      data: {
        callers,
        summary: {
          unique_callers: uniqueCallers,
          total_calls: totalCalls,
          avg_attempts_per_caller: uniqueCallers > 0 ? Math.round((totalCalls / uniqueCallers) * 10) / 10 : 0,
          callers_never_reached: callers.filter((c: any) => c.answered_count === 0).length,
          callers_with_breached_sla: callers.filter((c: any) => c.sla_breached).length,
        },
      },
    });
  } catch (error) {
    logger.error('admission/calls/unique-callers', 'Error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
