// GET /api/admission/chat/counselor-performance
// Counselor performance metrics and response time distribution

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppCounselorAnalyticsService } from '@/lib/services/whatsapp/whatsapp-counselor-analytics-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    const dateFrom = searchParams.get('from') || undefined;
    const dateTo = searchParams.get('to') || undefined;
    const counselorId = searchParams.get('counselor_id') || undefined;

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Verify institution access
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (profile?.institution_id !== institutionId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // If counselor_id provided, return timeline for that counselor
    if (counselorId) {
      const from = dateFrom || new Date(Date.now() - 30 * 86400000).toISOString();
      const to = dateTo || new Date().toISOString();

      const timeline = await WhatsAppCounselorAnalyticsService.getCounselorTimeline(
        counselorId,
        institutionId,
        from,
        to
      );

      return NextResponse.json({ timeline });
    }

    // Otherwise return all counselor metrics + distribution
    const [counselors, distribution] = await Promise.all([
      WhatsAppCounselorAnalyticsService.getCounselorPerformance(
        institutionId,
        dateFrom,
        dateTo
      ),
      WhatsAppCounselorAnalyticsService.getResponseTimeDistribution(
        institutionId,
        dateFrom,
        dateTo
      ),
    ]);

    return NextResponse.json({ counselors, distribution });
  } catch (error) {
    console.error('[chat/counselor-performance] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
