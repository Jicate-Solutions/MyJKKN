// app/api/admission/counselors/pulse/route.ts
// GET — server-side aggregate for the Director Pulse dashboard.
// Returns: { kpis, todayCallsByCounselor, silentCounselors, recentCalls }
//
// Auth: super_admin OR admission-global users only. The page uses client-side
// hooks for realtime, but this endpoint is provided so external schedulers
// (digests, alerts) can pull the same payload server-side.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface CounselorRow {
  counselor_id: string;
  user_id: string | null;
  name: string;
  designation: string | null;
  institution_id: string | null;
  calls_today: number;
  last_call_at: string | null;
  days_since_last_call: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();
    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institution_id') || undefined;

    // Permission gate: super_admin OR admission-global scope
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

    if (!isSuperAdmin) {
      const { data: userRolesData } = await supabase
        .from('user_roles')
        .select('custom_roles!inner(institution_scope)')
        .eq('user_id', user.id);

      const hasGlobalScope = (userRolesData || []).some(
        (ur: any) => ur.custom_roles?.institution_scope === 'all'
      );

      if (!hasGlobalScope) {
        // Non-global users: only allow their own institution
        if (institutionId && institutionId !== profile?.institution_id) {
          return NextResponse.json({ error: 'No access to this institution' }, { status: 403 });
        }
      }
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Active counselors
    let counselorsQuery = supabase
      .from('admission_counselors')
      .select('id, user_id, name, designation, institution_id, is_active')
      .eq('is_active', true);
    if (institutionId) counselorsQuery = counselorsQuery.eq('institution_id', institutionId);
    const { data: counselors } = await counselorsQuery;

    const userIds = (counselors || []).map((c) => c.user_id).filter(Boolean) as string[];

    // Today's calls
    let todayCallsQuery = supabase
      .from('admission_call_logs')
      .select('counselor_id')
      .gte('created_at', todayStart);
    if (institutionId) todayCallsQuery = todayCallsQuery.eq('institution_id', institutionId);
    const { data: todayCalls } = await todayCallsQuery;

    const callsByCounselor = new Map<string, number>();
    (todayCalls || []).forEach((c) => {
      if (!c.counselor_id) return;
      callsByCounselor.set(c.counselor_id, (callsByCounselor.get(c.counselor_id) || 0) + 1);
    });

    // 7-day window for KPI silence count
    let sevenDayQuery = supabase
      .from('admission_call_logs')
      .select('counselor_id')
      .gte('created_at', sevenDaysAgo);
    if (institutionId) sevenDayQuery = sevenDayQuery.eq('institution_id', institutionId);
    const { data: sevenDayCalls } = await sevenDayQuery;
    const counselors7d = new Set(
      (sevenDayCalls || []).map((c) => c.counselor_id).filter(Boolean) as string[]
    );

    // 30-day silence count
    let thirtyDayQuery = supabase
      .from('admission_call_logs')
      .select('counselor_id')
      .gte('created_at', thirtyDaysAgo);
    if (institutionId) thirtyDayQuery = thirtyDayQuery.eq('institution_id', institutionId);
    const { data: thirtyDayCalls } = await thirtyDayQuery;
    const counselors30d = new Set(
      (thirtyDayCalls || []).map((c) => c.counselor_id).filter(Boolean) as string[]
    );

    // Last-call-at — only need top 1 per user, but we can pull recent rows and pick first per counselor
    let allCallsQuery = supabase
      .from('admission_call_logs')
      .select('counselor_id, created_at')
      .order('created_at', { ascending: false });
    if (institutionId) allCallsQuery = allCallsQuery.eq('institution_id', institutionId);
    if (userIds.length > 0) allCallsQuery = allCallsQuery.in('counselor_id', userIds);
    allCallsQuery = allCallsQuery.limit(2000);
    const { data: allCalls } = await allCallsQuery;

    const lastCallByCounselor = new Map<string, string>();
    (allCalls || []).forEach((c) => {
      if (!c.counselor_id || !c.created_at) return;
      if (!lastCallByCounselor.has(c.counselor_id)) {
        lastCallByCounselor.set(c.counselor_id, c.created_at);
      }
    });

    const nowMs = now.getTime();
    const todayCallsByCounselor: CounselorRow[] = (counselors || []).map((c) => {
      const callsToday = c.user_id ? callsByCounselor.get(c.user_id) || 0 : 0;
      const lastCallAt = c.user_id ? lastCallByCounselor.get(c.user_id) || null : null;
      const daysSince = lastCallAt
        ? Math.floor((nowMs - new Date(lastCallAt).getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return {
        counselor_id: c.id,
        user_id: c.user_id,
        name: c.name,
        designation: c.designation,
        institution_id: c.institution_id,
        calls_today: callsToday,
        last_call_at: lastCallAt,
        days_since_last_call: daysSince,
      };
    }).sort((a, b) => b.calls_today - a.calls_today);

    const silentCounselors = todayCallsByCounselor
      .filter((c) => c.calls_today === 0)
      .sort((a, b) => {
        if (a.last_call_at === null && b.last_call_at !== null) return -1;
        if (a.last_call_at !== null && b.last_call_at === null) return 1;
        if (a.last_call_at === null && b.last_call_at === null) return 0;
        return new Date(a.last_call_at!).getTime() - new Date(b.last_call_at!).getTime();
      });

    const counselorsCalledTodaySet = new Set(
      (todayCalls || []).map((c) => c.counselor_id).filter(Boolean) as string[]
    );

    let silent7d = 0;
    let silent30d = 0;
    userIds.forEach((uid) => {
      if (!counselors7d.has(uid)) silent7d++;
      if (!counselors30d.has(uid)) silent30d++;
    });

    const totalCallsToday = (todayCalls || []).length;
    const callsPerActiveAvg = counselorsCalledTodaySet.size > 0
      ? Math.round((totalCallsToday / counselorsCalledTodaySet.size) * 10) / 10
      : 0;

    // Recent 20 calls
    let recentQuery = supabase
      .from('admission_call_logs')
      .select(
        'id, call_sid, counselor_id, lead_id, to_number, from_number, direction, status, duration_seconds, started_at, created_at, call_disposition, institution_id'
      )
      .order('created_at', { ascending: false })
      .limit(20);
    if (institutionId) recentQuery = recentQuery.eq('institution_id', institutionId);
    const { data: recentCalls } = await recentQuery;

    // Resolve counselor names for the recent feed
    const recentCounselorIds = Array.from(
      new Set((recentCalls || []).map((c) => c.counselor_id).filter(Boolean) as string[])
    );
    const nameMap = new Map<string, string>();
    if (recentCounselorIds.length > 0) {
      const { data: nameRows } = await supabase
        .from('admission_counselors')
        .select('user_id, name')
        .in('user_id', recentCounselorIds);
      (nameRows || []).forEach((c) => {
        if (c.user_id && c.name) nameMap.set(c.user_id, c.name);
      });
    }

    const enrichedRecentCalls = (recentCalls || []).map((c) => ({
      ...c,
      counselor_name: c.counselor_id ? nameMap.get(c.counselor_id) || null : null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          total_active_counselors: userIds.length,
          counselors_called_today: counselorsCalledTodaySet.size,
          counselors_called_7d: counselors7d.size,
          total_calls_today: totalCallsToday,
          calls_per_active_counselor_avg: callsPerActiveAvg,
          silent_7d_count: silent7d,
          silent_30d_count: silent30d,
          computed_at: new Date().toISOString(),
        },
        todayCallsByCounselor,
        silentCounselors,
        recentCalls: enrichedRecentCalls,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error', details: (err as Error).message },
      { status: 500 }
    );
  }
}
