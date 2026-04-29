// GET /api/admission/counselors/productivity — Real-time counselor KPIs for today
// Returns: team KPI totals + per-counselor breakdown

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();
    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institution_id');
    const dateStr = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Validate institution access
    if (institutionId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('institution_id, is_super_admin, role')
        .eq('id', user.id)
        .single();

      const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';
      if (!isSuperAdmin) {
        // Check if user has access to this institution
        const { data: userRolesData } = await supabase
          .from('user_roles')
          .select('custom_roles!inner(institution_scope)')
          .eq('user_id', user.id);

        const hasGlobalScope = (userRolesData || []).some(
          (ur: any) => ur.custom_roles?.institution_scope === 'all'
        );

        if (!hasGlobalScope && profile?.institution_id !== institutionId) {
          return NextResponse.json({ error: 'No access to this institution' }, { status: 403 });
        }
      }
    }

    // Date range for the requested day
    const dayStart = `${dateStr}T00:00:00`;
    const dayEnd = `${dateStr}T23:59:59`;

    // 1. Get all counselors for this institution
    let counselorQuery = supabase
      .from('admission_counselors')
      .select('id, name, designation, is_active')
      .eq('is_active', true);
    if (institutionId) counselorQuery = counselorQuery.eq('institution_id', institutionId);
    const { data: counselors } = await counselorQuery;

    if (!counselors || counselors.length === 0) {
      return NextResponse.json({
        success: true,
        data: { team: emptyTeamKPIs(), counselors: [], date: dateStr },
      });
    }

    // 2. Get today's call logs
    let callQuery = supabase
      .from('admission_call_logs')
      .select('id, counselor_id, status, call_disposition, duration_seconds, created_at, started_at')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .eq('is_admission_call', true);
    if (institutionId) callQuery = callQuery.eq('institution_id', institutionId);
    const { data: calls } = await callQuery;

    // 3. Get today's activities (WhatsApp, SMS, etc.)
    let activityQuery = supabase
      .from('admission_lead_activities')
      .select('id, lead_id, activity_type, created_by, created_at');
    // Filter by date — activities don't have institution_id, filter by created_at
    activityQuery = activityQuery.gte('created_at', dayStart).lte('created_at', dayEnd);
    const { data: activities } = await activityQuery;

    // 4. Get today's conversions — authoritative signal is "lead has a row in admission_applications".
    // Previously this filtered admission_leads.funnel_stage IN (enrolled/offer_accepted/...),
    // but funnel_stage doesn't reliably advance to those values (the application step happens
    // before any funnel_stage transition). The TRUE "applied" signal is admission_applications.
    // Funnel_stage semantics elsewhere (kanban, non-converted bucketing) remain unchanged.
    let applicationsQuery = supabase
      .from('admission_applications')
      .select('id, lead_id, created_at, institution_id')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .not('lead_id', 'is', null);
    if (institutionId) applicationsQuery = applicationsQuery.eq('institution_id', institutionId);
    const { data: applicationsToday } = await applicationsQuery;

    // Resolve lead_id → counselor_id (lead's assigned counselor at conversion time)
    const conversionLeadIds = Array.from(new Set((applicationsToday || []).map((a) => a.lead_id).filter(Boolean)));
    let conversions: { id: string; counselor_id: string | null }[] = [];
    if (conversionLeadIds.length > 0) {
      let convLeadsQuery = supabase
        .from('admission_leads')
        .select('id, counselor_id')
        .in('id', conversionLeadIds)
        .not('counselor_id', 'is', null);
      if (institutionId) convLeadsQuery = convLeadsQuery.eq('institution_id', institutionId);
      const { data: convLeads } = await convLeadsQuery;
      conversions = convLeads || [];
    }

    // 5. Get today's assigned leads for response time calculation
    let assignedQuery = supabase
      .from('admission_leads')
      .select('id, counselor_id, assigned_at, last_contact_at')
      .gte('assigned_at', dayStart)
      .lte('assigned_at', dayEnd)
      .not('counselor_id', 'is', null);
    if (institutionId) assignedQuery = assignedQuery.eq('institution_id', institutionId);
    const { data: assignedLeads } = await assignedQuery;

    // ── Build per-counselor metrics ──

    // Map counselor profile IDs from admission_counselors
    // Note: counselor_id on leads/calls refers to profiles.id, but
    // admission_counselors.id is its own PK. We need the user_id field.
    const counselorMap = new Map<string, any>();
    for (const c of counselors) {
      counselorMap.set(c.id, {
        id: c.id,
        name: c.name,
        designation: c.designation,
        callsAttempted: 0,
        callsConnected: 0,
        callsNotConnected: 0,
        whatsappSent: 0,
        smsSent: 0,
        conversions: 0,
        avgResponseMin: 0,
        totalDuration: 0,
        // Hourly buckets for heatmap (9am-7pm = indices 0-10)
        hourly: Array(11).fill(0),
      });
    }

    // Map calls to counselors
    for (const call of calls || []) {
      const c = counselorMap.get(call.counselor_id);
      if (!c) continue;
      c.callsAttempted++;
      if (call.status === 'completed' && (call.duration_seconds || 0) > 0) {
        c.callsConnected++;
        c.totalDuration += call.duration_seconds || 0;
      } else if (['busy', 'no-answer', 'failed', 'cancelled'].includes(call.status)) {
        c.callsNotConnected++;
      }
      // Hourly bucket
      const hour = new Date(call.created_at).getHours();
      if (hour >= 9 && hour <= 19) c.hourly[hour - 9]++;
    }

    // Map activities to counselors (via created_by → counselor match)
    for (const act of activities || []) {
      // Try to match created_by to a counselor
      const c = counselorMap.get(act.created_by);
      if (!c) continue;
      if (act.activity_type === 'whatsapp') c.whatsappSent++;
      if (act.activity_type === 'sms') c.smsSent++;
      const hour = new Date(act.created_at).getHours();
      if (hour >= 9 && hour <= 19) c.hourly[hour - 9]++;
    }

    // Map conversions — count DISTINCT leads per counselor (a lead may have >1 application
    // but counts as 1 conversion). conversionLeadIds was already deduped via Set above; we
    // also dedupe at the per-counselor accumulator level for safety.
    const seenConvLeads = new Set<string>();
    for (const conv of conversions) {
      if (!conv.counselor_id || seenConvLeads.has(conv.id)) continue;
      seenConvLeads.add(conv.id);
      const c = counselorMap.get(conv.counselor_id);
      if (c) c.conversions++;
    }

    // Calculate response times
    for (const lead of assignedLeads || []) {
      if (!lead.last_contact_at || !lead.assigned_at) continue;
      const c = counselorMap.get(lead.counselor_id);
      if (!c) continue;
      const responseMs = new Date(lead.last_contact_at).getTime() - new Date(lead.assigned_at).getTime();
      const responseMin = Math.max(0, responseMs / 60000);
      if (!c._responseTimes) c._responseTimes = [];
      c._responseTimes.push(responseMin);
    }

    // Finalize per-counselor
    const counselorRows = Array.from(counselorMap.values()).map((c) => {
      const responseTimes = c._responseTimes || [];
      const avgResponse = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
        : 0;
      return {
        id: c.id,
        name: c.name,
        designation: c.designation,
        callsAttempted: c.callsAttempted,
        callsConnected: c.callsConnected,
        callsNotConnected: c.callsNotConnected,
        whatsappSent: c.whatsappSent,
        smsSent: c.smsSent,
        conversions: c.conversions,
        avgResponseMin: avgResponse,
        avgCallDuration: c.callsConnected > 0 ? Math.round(c.totalDuration / c.callsConnected) : 0,
        hourly: c.hourly,
      };
    }).sort((a, b) => b.callsAttempted - a.callsAttempted);

    // Team totals
    const team = {
      callsAttempted: counselorRows.reduce((s, c) => s + c.callsAttempted, 0),
      callsConnected: counselorRows.reduce((s, c) => s + c.callsConnected, 0),
      callsNotConnected: counselorRows.reduce((s, c) => s + c.callsNotConnected, 0),
      whatsappSent: counselorRows.reduce((s, c) => s + c.whatsappSent, 0),
      smsSent: counselorRows.reduce((s, c) => s + c.smsSent, 0),
      conversions: counselorRows.reduce((s, c) => s + c.conversions, 0),
      avgResponseMin: counselorRows.length > 0
        ? Math.round(counselorRows.reduce((s, c) => s + c.avgResponseMin, 0) / counselorRows.filter(c => c.avgResponseMin > 0).length || 1)
        : 0,
    };

    logger.info('admission/counselors', 'Productivity data fetched', {
      date: dateStr,
      counselors: counselorRows.length,
      totalCalls: team.callsAttempted,
    });

    return NextResponse.json({
      success: true,
      data: { team, counselors: counselorRows, date: dateStr },
    });
  } catch (error: any) {
    logger.error('admission/counselors', 'Productivity fetch failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function emptyTeamKPIs() {
  return {
    callsAttempted: 0, callsConnected: 0, callsNotConnected: 0,
    whatsappSent: 0, smsSent: 0, conversions: 0, avgResponseMin: 0,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
