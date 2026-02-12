/**
 * Social Media Dashboard API
 * GET /api/social-media/dashboard - Get dashboard overview
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

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(institutionId)) {
      return NextResponse.json({ error: 'institution_id must be a valid UUID' }, { status: 400 });
    }

    // Fetch all accounts
    const { data: accounts, error: accError } = await supabase
      .from('sm_accounts')
      .select('*')
      .eq('institution_id', institutionId);

    if (accError) {
      return NextResponse.json({ error: accError.message }, { status: 500 });
    }

    const allAccounts = accounts || [];

    // Health breakdown
    const healthBreakdown = { green: 0, yellow: 0, red: 0, dormant: 0 };
    allAccounts.forEach((a: any) => {
      if (a.health_status in healthBreakdown) {
        healthBreakdown[a.health_status as keyof typeof healthBreakdown]++;
      }
    });

    // Platform breakdown
    const platformBreakdown: Record<string, number> = {};
    allAccounts.forEach((a: any) => {
      platformBreakdown[a.platform] = (platformBreakdown[a.platform] || 0) + 1;
    });

    // Latest snapshots for stats
    const { data: latestSnapshots } = await supabase
      .from('sm_snapshots')
      .select('*')
      .eq('institution_id', institutionId)
      .order('snapshot_date', { ascending: false })
      .limit(1000);

    const snapshots = latestSnapshots || [];
    const latestByAccount = new Map<string, any>();
    snapshots.forEach((s: any) => {
      if (!latestByAccount.has(s.account_id)) {
        latestByAccount.set(s.account_id, s);
      }
    });

    let totalFollowers = 0;
    let totalEngagement = 0;
    let engagementCount = 0;
    latestByAccount.forEach((s) => {
      totalFollowers += s.followers_count || 0;
      if (s.engagement_rate > 0) {
        totalEngagement += Number(s.engagement_rate);
        engagementCount++;
      }
    });

    // Top posts
    const { data: topPosts } = await supabase
      .from('sm_post_metrics')
      .select('*')
      .eq('institution_id', institutionId)
      .order('engagement_rate', { ascending: false })
      .limit(10);

    return NextResponse.json({
      totalAccounts: allAccounts.length,
      connectedAccounts: allAccounts.filter((a: any) => a.is_connected).length,
      healthBreakdown,
      platformBreakdown,
      totalFollowers,
      avgEngagementRate: engagementCount > 0 ? totalEngagement / engagementCount : 0,
      topPosts: topPosts || [],
      recentSnapshots: snapshots.slice(0, 20),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
