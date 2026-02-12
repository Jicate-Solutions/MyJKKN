/**
 * Social Media Analytics API
 * GET /api/social-media/analytics - Get analytics deep dive data
 * RBAC: All roles can view; data scoped by RLS
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch profile for institution validation
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role, department_id')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      return NextResponse.json({ error: 'User not assigned to institution' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    const period = searchParams.get('period') || '30d';

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(institutionId)) {
      return NextResponse.json({ error: 'institution_id must be a valid UUID' }, { status: 400 });
    }

    // Prevent horizontal privilege escalation
    if (profile.role !== 'super_admin' && institutionId !== profile.institution_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Calculate date cutoff
    let dateCutoff: string | null = null;
    if (period !== 'all') {
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      dateCutoff = cutoff.toISOString().slice(0, 10);
    }

    // Fetch accounts with health scores
    const { data: accounts, error: accError } = await supabase
      .from('sm_accounts')
      .select('id, department_id, health_score, health_status, platform, username')
      .eq('institution_id', institutionId);

    if (accError) {
      return NextResponse.json({ error: accError.message }, { status: 500 });
    }

    const allAccounts = accounts || [];

    // Fetch snapshots (optionally filtered by date)
    let snapshotQuery = supabase
      .from('sm_snapshots')
      .select('account_id, snapshot_date, followers_count, engagement_rate, health_score')
      .eq('institution_id', institutionId)
      .order('snapshot_date', { ascending: true });

    if (dateCutoff) {
      snapshotQuery = snapshotQuery.gte('snapshot_date', dateCutoff);
    }

    const { data: snapshots, error: snapError } = await snapshotQuery.limit(5000);

    if (snapError) {
      return NextResponse.json({ error: snapError.message }, { status: 500 });
    }

    const allSnapshots = snapshots || [];

    // Group snapshots by ISO week for engagement trend
    const weekMap = new Map<string, { totalEngagement: number; count: number }>();

    allSnapshots.forEach((s: any) => {
      const d = new Date(s.snapshot_date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d);
      weekStart.setDate(diff);
      const weekKey = weekStart.toISOString().slice(0, 10);

      const existing = weekMap.get(weekKey) || { totalEngagement: 0, count: 0 };
      existing.totalEngagement += Number(s.engagement_rate) || 0;
      existing.count += 1;
      weekMap.set(weekKey, existing);
    });

    const engagementTrend = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, { totalEngagement, count }]) => ({
        week,
        avgEngagementRate: count > 0 ? (totalEngagement / count) * 100 : 0,
      }));

    // Group accounts by department for department scores
    const deptMap = new Map<string, {
      totalScore: number;
      totalFollowers: number;
      totalEngagement: number;
      engagementCount: number;
      count: number;
    }>();

    // Get latest snapshot per account for follower/engagement data
    const latestByAccount = new Map<string, any>();
    [...allSnapshots].reverse().forEach((s: any) => {
      if (!latestByAccount.has(s.account_id)) {
        latestByAccount.set(s.account_id, s);
      }
    });

    allAccounts.forEach((acc: any) => {
      const deptId = acc.department_id || 'unassigned';
      const existing = deptMap.get(deptId) || {
        totalScore: 0, totalFollowers: 0, totalEngagement: 0,
        engagementCount: 0, count: 0,
      };

      existing.totalScore += acc.health_score || 0;
      existing.count += 1;

      const snap = latestByAccount.get(acc.id);
      if (snap) {
        existing.totalFollowers += snap.followers_count || 0;
        if (snap.engagement_rate > 0) {
          existing.totalEngagement += Number(snap.engagement_rate);
          existing.engagementCount += 1;
        }
      }

      deptMap.set(deptId, existing);
    });

    const departmentScores = Array.from(deptMap.entries())
      .map(([deptId, data]) => ({
        department_id: deptId,
        healthScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
        followers: data.totalFollowers,
        engagementRate: data.engagementCount > 0
          ? data.totalEngagement / data.engagementCount
          : 0,
        accountCount: data.count,
      }))
      .sort((a, b) => b.healthScore - a.healthScore);

    // Summary stats
    const totalScore = departmentScores.reduce((sum, d) => sum + d.healthScore, 0);
    const topDept = departmentScores.length > 0 ? departmentScores[0].department_id : null;

    return NextResponse.json({
      engagementTrend,
      departmentScores,
      summary: {
        totalAccounts: allAccounts.length,
        avgScore: departmentScores.length > 0
          ? Math.round(totalScore / departmentScores.length)
          : 0,
        topDepartment: topDept,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
