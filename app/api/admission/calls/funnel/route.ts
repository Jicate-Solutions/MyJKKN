export const dynamic = 'force-dynamic';

// app/api/admission/calls/funnel/route.ts
// GET /api/admission/calls/funnel — Call-to-Enrollment funnel metrics

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export interface FunnelStage {
  name: string;
  key: string;
  count: number;
  rate: number | null; // conversion rate from previous stage (null for first stage)
}

export interface CallFunnelData {
  stages: FunnelStage[];
  total_calls: number;
  overall_conversion_rate: number; // enrolled / total_calls
}

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const institution_id = searchParams.get('institution_id') || undefined;
    const fromDate = searchParams.get('from_date') || undefined;
    const toDate = searchParams.get('to_date') || undefined;
    const admissionOnlyParam = searchParams.get('admission_only');
    const admissionOnly = admissionOnlyParam === 'false' ? false : true; // default to true

    const supabase = createServiceRoleClient();

    // ── Stage 1: Total inbound calls ──
    // FIX (2026-08-02): paged with .range() — PostgREST caps un-ranged selects
    // at 10,000 rows and still returns HTTP 200, while `count: 'exact'` stays
    // correct. So `totalCalls` was right but the `calls` array fed to stages
    // 2-3 was capped: with admission_only=false (11,594 inbound calls in
    // prod), "Answered" reported 3,452 of the true 4,031 and "Leads Created"
    // 2,726 of the true 3,134 (measured live 2026-08-02) — funnel stages that
    // disagreed with their own total. The default admission-only scope
    // (7,701 rows) crosses the same cap soon. Stage 3 needs the actual
    // distinct lead ids for stages 4-5, so pagination (not an aggregate RPC)
    // is the correct shape. Stable id ordering keeps pages from overlapping.
    // The exact count is requested on the FIRST page only: a beyond-end range
    // combined with count=exact makes PostgREST answer 416 (verified live),
    // which would fault the loop whenever the row count is an exact multiple
    // of the page size.
    const PAGE_SIZE = 1000;
    const calls: Array<{ id: string; lead_id: string | null; cost_amount: number | null }> = [];
    let totalCallsCount = 0;
    for (let from = 0; ; from += PAGE_SIZE) {
      let callsQuery = supabase
        .from('admission_call_logs')
        .select('id, lead_id, cost_amount', from === 0 ? { count: 'exact' } : {})
        .eq('direction', 'inbound')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (institution_id) callsQuery = callsQuery.eq('institution_id', institution_id);
      if (fromDate) callsQuery = callsQuery.gte('created_at', fromDate);
      if (toDate) callsQuery = callsQuery.lte('created_at', toDate);
      if (admissionOnly) callsQuery = callsQuery.eq('is_admission_call', true);

      const { data: page, count, error: callsError } = await callsQuery;
      if (callsError) throw new Error(`Calls query error: ${callsError.message}`);

      if (from === 0) totalCallsCount = count || 0;
      calls.push(...((page || []) as typeof calls));
      if (!page || page.length < PAGE_SIZE) break;
    }

    // ── Stage 2: Answered calls (cost_amount > 0) ──
    const answeredCount = calls.filter(c => c.cost_amount != null && c.cost_amount > 0).length;

    // ── Stage 3: Leads created from calls ──
    // Leads linked to inbound calls (lead_id on call log is not null)
    const callLeadIds = [...new Set(
      calls
        .filter(c => c.lead_id != null)
        .map(c => c.lead_id as string)
    )];
    const leadsFromCallsCount = callLeadIds.length;

    // ── Stage 4: Applications from call-originated leads ──
    let applicationsCount = 0;
    if (callLeadIds.length > 0) {
      // Query in batches of 200 to avoid PostgREST URL length limits
      const batchSize = 200;
      for (let i = 0; i < callLeadIds.length; i += batchSize) {
        const batch = callLeadIds.slice(i, i + batchSize);
        const { count, error: appError } = await supabase
          .from('admission_applications')
          .select('id', { count: 'exact', head: true })
          .in('lead_id', batch);

        if (appError) {
          logger.warn('admission/funnel', 'Applications query error (non-fatal)', { error: appError.message });
        } else {
          applicationsCount += count || 0;
        }
      }
    }

    // ── Stage 5: Enrollments — leads with stage = 'enrolled' ──
    let enrolledCount = 0;
    if (callLeadIds.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < callLeadIds.length; i += batchSize) {
        const batch = callLeadIds.slice(i, i + batchSize);
        const { count, error: enrollError } = await supabase
          .from('admission_leads')
          .select('id', { count: 'exact', head: true })
          .in('id', batch)
          .eq('stage', 'enrolled');

        if (enrollError) {
          logger.warn('admission/funnel', 'Enrollment query error (non-fatal)', { error: enrollError.message });
        } else {
          enrolledCount += count || 0;
        }
      }
    }

    // ── Build funnel stages ──
    const stages: FunnelStage[] = [
      {
        name: 'Total Calls',
        key: 'total_calls',
        count: totalCallsCount,
        rate: null,
      },
      {
        name: 'Answered',
        key: 'answered',
        count: answeredCount,
        rate: totalCallsCount > 0 ? Math.round((answeredCount / totalCallsCount) * 10000) / 100 : 0,
      },
      {
        name: 'Leads Created',
        key: 'leads_created',
        count: leadsFromCallsCount,
        rate: answeredCount > 0 ? Math.round((leadsFromCallsCount / answeredCount) * 10000) / 100 : 0,
      },
      {
        name: 'Applications',
        key: 'applications',
        count: applicationsCount,
        rate: leadsFromCallsCount > 0 ? Math.round((applicationsCount / leadsFromCallsCount) * 10000) / 100 : 0,
      },
      {
        name: 'Enrolled',
        key: 'enrolled',
        count: enrolledCount,
        rate: applicationsCount > 0 ? Math.round((enrolledCount / applicationsCount) * 10000) / 100 : 0,
      },
    ];

    const data: CallFunnelData = {
      stages,
      total_calls: totalCallsCount,
      overall_conversion_rate: totalCallsCount > 0
        ? Math.round((enrolledCount / totalCallsCount) * 10000) / 100
        : 0,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('admission/funnel', 'Get call funnel error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
