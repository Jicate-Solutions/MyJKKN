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
    const fromDate = searchParams.get('from_date') || undefined;
    const toDate = searchParams.get('to_date') || undefined;

    const supabase = createServiceRoleClient();

    // Fetch all inbound calls with lead + callback queue info
    let query = supabase
      .from('admission_call_logs')
      .select(`
        id, from_number, lead_id, status, duration_seconds, cost_amount,
        created_at, auto_sms_sent, caller_location, caller_attempt_number,
        callback_queued, callback_queue_id,
        lead:admission_leads(id, full_name, priority)
      `)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false });

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    const { data: calls, error } = await query;
    if (error) throw new Error(error.message);

    // Group by from_number
    const callerMap: Record<string, {
      from_number: string;
      lead_id: string | null;
      lead_name: string | null;
      caller_location: string | null;
      total_attempts: number;
      missed_count: number;
      answered_count: number;
      first_call_at: string;
      last_call_at: string;
      auto_sms_sent: boolean;
      callback_queue_id: string | null;
      current_lead_priority: string | null;
    }> = {};

    for (const call of (calls || [])) {
      const phone = call.from_number;
      if (!phone) continue;

      const isAnswered = (call.cost_amount ?? 0) > 0 && (call.duration_seconds ?? 0) > 0;

      if (!callerMap[phone]) {
        // Derive location from phone prefix if not already on the call log
        const location = call.caller_location || PhoneNumberIntelligence.getLocationFromPhone(phone);

        callerMap[phone] = {
          from_number: phone,
          lead_id: call.lead_id ?? (call.lead as any)?.id ?? null,
          lead_name: (call.lead as any)?.full_name ?? null,
          caller_location: location,
          total_attempts: 0,
          missed_count: 0,
          answered_count: 0,
          first_call_at: call.created_at,
          last_call_at: call.created_at,
          auto_sms_sent: false,
          callback_queue_id: call.callback_queue_id ?? null,
          current_lead_priority: (call.lead as any)?.priority ?? null,
        };
      }

      const caller = callerMap[phone];
      caller.total_attempts++;
      if (isAnswered) {
        caller.answered_count++;
      } else {
        caller.missed_count++;
      }
      if (call.auto_sms_sent) caller.auto_sms_sent = true;

      // Update lead info if available (take most recent)
      if (call.lead_id && !caller.lead_id) {
        caller.lead_id = call.lead_id;
        caller.lead_name = (call.lead as any)?.full_name ?? null;
        caller.current_lead_priority = (call.lead as any)?.priority ?? null;
      }

      // Track first/last call timestamps
      if (call.created_at < caller.first_call_at) caller.first_call_at = call.created_at;
      if (call.created_at > caller.last_call_at) caller.last_call_at = call.created_at;

      // Update callback info
      if (call.callback_queue_id) caller.callback_queue_id = call.callback_queue_id;
    }

    // Fetch callback statuses for all callers with callbacks
    const callbackIds = Object.values(callerMap)
      .map(c => c.callback_queue_id)
      .filter(Boolean) as string[];

    let callbackStatusMap: Record<string, { status: string; priority: string; sla_breached: boolean }> = {};
    if (callbackIds.length > 0) {
      const { data: callbacks } = await supabase
        .from('admission_callback_queue')
        .select('id, status, priority, sla_breached')
        .in('id', callbackIds);

      if (callbacks) {
        for (const cb of callbacks) {
          callbackStatusMap[cb.id] = {
            status: cb.status,
            priority: cb.priority,
            sla_breached: cb.sla_breached ?? false,
          };
        }
      }
    }

    // Build final caller list with callback enrichment
    // BUG-003220: Exclude callers who have already been converted to leads.
    // Once any call for a phone number has `lead_id` set, that caller is now a
    // regular admission lead and should appear in the leads list only — not
    // duplicated in the "Unique Callers" tab. We filter at the caller level
    // (post-aggregation) so we naturally hide phones where ANY call was linked
    // to a lead, even if older calls for the same phone are still `lead_id = null`.
    const callers = Object.values(callerMap)
      .filter(caller => !caller.lead_id)
      .map(caller => {
        const cb = caller.callback_queue_id ? callbackStatusMap[caller.callback_queue_id] : null;
        const firstCall = new Date(caller.first_call_at).getTime();
        const lastCall = new Date(caller.last_call_at).getTime();
        const daysTrying = Math.max(1, Math.ceil((lastCall - firstCall) / (1000 * 60 * 60 * 24)));

        return {
          ...caller,
          days_trying: daysTrying,
          callback_status: cb?.status ?? null,
          callback_priority: cb?.priority ?? null,
          sla_breached: cb?.sla_breached ?? false,
        };
      });

    // Sort: callers never reached first, then by attempt count descending
    callers.sort((a, b) => {
      // Never reached first
      if (a.answered_count === 0 && b.answered_count > 0) return -1;
      if (a.answered_count > 0 && b.answered_count === 0) return 1;
      // Then by total attempts
      return b.total_attempts - a.total_attempts;
    });

    // Summary
    const totalCalls = (calls || []).length;
    const uniqueCallers = callers.length;
    const callersNeverReached = callers.filter(c => c.answered_count === 0).length;
    const callersWithBreachedSla = callers.filter(c => c.sla_breached).length;

    return NextResponse.json({
      success: true,
      data: {
        callers,
        summary: {
          unique_callers: uniqueCallers,
          total_calls: totalCalls,
          avg_attempts_per_caller: uniqueCallers > 0 ? Math.round((totalCalls / uniqueCallers) * 10) / 10 : 0,
          callers_never_reached: callersNeverReached,
          callers_with_breached_sla: callersWithBreachedSla,
        },
      },
    });
  } catch (error) {
    logger.error('admission/calls/unique-callers', 'Error fetching unique callers', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
