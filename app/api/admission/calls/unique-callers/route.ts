export const dynamic = 'force-dynamic';

// app/api/admission/calls/unique-callers/route.ts
// GET /api/admission/calls/unique-callers — Group inbound calls by unique caller
// Returns caller journey data: attempt counts, location, callback status, etc.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { PhoneNumberIntelligence } from '@/lib/services/telephony/phone-number-intelligence';
import { normalizePhone } from '@/lib/utils/phone';
import { logger } from '@/lib/utils/enhanced-logger';

// Statuses that mean the call reached a human. We treat any of these as
// "answered" rather than relying on cost_amount, which Exotel populates
// asynchronously and is NULL on ~89% of rows (see /api/admission/calls/
// backfill-cost for the out-of-band backfill). Previously the gate was
// `cost_amount > 0 AND duration_seconds > 0`, which mislabeled 1,266+ rows
// with `status='completed' AND duration_seconds > 0` as "missed" whenever
// cost_amount lagged — producing a ~276 false "Never Reached" count.
const ANSWERED_STATUSES = new Set(['completed', 'answered', 'in-progress']);

function isCallAnswered(call: {
  status?: string | null;
  duration_seconds?: number | null;
  answered_at?: string | null;
  cost_amount?: number | null;
}): boolean {
  // Positive connection signals, in order of reliability:
  //   1. status is a terminal "connected" value → the call bridged
  //   2. answered_at is set → webhook recorded an answer event
  //   3. duration_seconds > 0 → someone was on the line
  //   4. cost_amount > 0 → Exotel billed airtime (lagging, last resort)
  if (call.status && ANSWERED_STATUSES.has(call.status.toLowerCase())) return true;
  if (call.answered_at) return true;
  if ((call.duration_seconds ?? 0) > 0) return true;
  if ((call.cost_amount ?? 0) > 0) return true;
  return false;
}

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
    // When true, include callers whose calls have already been linked to a
    // lead. Default behavior unchanged (BUG-003220): exclude them so the
    // KPI reflects top-of-funnel only.
    const includeConverted = searchParams.get('include_converted') === 'true';

    const supabase = createServiceRoleClient();

    // Fetch all inbound calls with lead + callback queue info.
    // Added `answered_at` so isCallAnswered() can read it.
    let query = supabase
      .from('admission_call_logs')
      .select(`
        id, from_number, lead_id, status, duration_seconds, cost_amount,
        answered_at, created_at, auto_sms_sent, caller_location,
        caller_attempt_number, callback_queued, callback_queue_id,
        lead:admission_leads(id, full_name, priority)
      `)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false });

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    const { data: calls, error } = await query;
    if (error) throw new Error(error.message);

    // Group by NORMALIZED E.164 phone so the same human stored as both
    // `+919894116664` and `09894116664` aggregates as one caller. Previously
    // these counted as two distinct entries, inflating "Unique Callers" and
    // letting the unlinked format survive the lead filter even when the
    // linked format was excluded.
    const callerMap: Record<string, {
      from_number: string;           // display-friendly raw (first-seen)
      phone_key: string;             // normalized E.164 used for grouping
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
      if (!call.from_number) continue;
      const phoneKey = normalizePhone(call.from_number);
      if (!phoneKey) continue;

      const answered = isCallAnswered(call);

      if (!callerMap[phoneKey]) {
        // Derive location from the phone prefix if not on the call log. Use
        // the normalized form so the lookup works regardless of which raw
        // format the first-seen call happened to be stored in.
        const location = call.caller_location || PhoneNumberIntelligence.getLocationFromPhone(phoneKey);

        callerMap[phoneKey] = {
          from_number: call.from_number,
          phone_key: phoneKey,
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

      const caller = callerMap[phoneKey];
      caller.total_attempts++;
      if (answered) {
        caller.answered_count++;
      } else {
        caller.missed_count++;
      }
      if (call.auto_sms_sent) caller.auto_sms_sent = true;

      // Update lead info if available (take first non-null as we iterate
      // DESC by created_at, so this is effectively the most-recent lead).
      if (call.lead_id && !caller.lead_id) {
        caller.lead_id = call.lead_id;
        caller.lead_name = (call.lead as any)?.full_name ?? null;
        caller.current_lead_priority = (call.lead as any)?.priority ?? null;
      }

      // Prefer ANY non-null caller_location seen across the caller's history
      // (not just the first-seen row). If the first call had caller_location
      // NULL and a later call had 'Tamil Nadu', take the 'Tamil Nadu' value.
      if (!caller.caller_location && call.caller_location) {
        caller.caller_location = call.caller_location;
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

    // Build final caller list with callback enrichment.
    // BUG-003220: By default, exclude callers who have already been converted
    // to leads — they show up in the leads list and would otherwise duplicate
    // here. Callers can pass `?include_converted=true` to see all.
    const callers = Object.values(callerMap)
      .filter(caller => includeConverted || !caller.lead_id)
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
      if (a.answered_count === 0 && b.answered_count > 0) return -1;
      if (a.answered_count > 0 && b.answered_count === 0) return 1;
      return b.total_attempts - a.total_attempts;
    });

    // Summary — use the POST-FILTER caller set for BOTH numerator and
    // denominator. Previously `totalCalls = (calls || []).length` was the
    // raw fetch count (pre-lead-filter) while `uniqueCallers` was post-filter,
    // producing a structurally wrong ~2× avg (e.g., 1898/578 = 3.3 instead
    // of the correct 1.6). The right denominator is the population we're
    // reporting on.
    const totalCalls = callers.reduce((sum, c) => sum + c.total_attempts, 0);
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
          include_converted: includeConverted,
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
