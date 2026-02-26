// GET /api/admission/chat/templates/analytics
// Template engagement analytics
// If template_id provided: return timeline. Otherwise: return all analytics + top/worst

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppTemplateAnalyticsService } from '@/lib/services/whatsapp/whatsapp-template-analytics-service';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const templateId = searchParams.get('template_id');
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

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

    // If template_id provided, return daily timeline
    if (templateId) {
      const from = dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);
      const to = dateTo || new Date().toISOString().substring(0, 10);

      const timeline = await WhatsAppTemplateAnalyticsService.getTemplateTimeline(
        templateId,
        institutionId,
        from,
        to
      );

      return NextResponse.json({ timeline });
    }

    // Otherwise return full analytics
    const [analytics, topPerforming, worstPerforming] = await Promise.all([
      WhatsAppTemplateAnalyticsService.getTemplateAnalytics(
        institutionId,
        dateFrom || undefined,
        dateTo || undefined
      ),
      WhatsAppTemplateAnalyticsService.getTopPerformingTemplates(institutionId),
      WhatsAppTemplateAnalyticsService.getWorstPerformingTemplates(institutionId),
    ]);

    return NextResponse.json({
      analytics,
      top_performing: topPerforming,
      worst_performing: worstPerforming,
    });
  } catch (error) {
    console.error('[api/chat/templates/analytics] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch template analytics' },
      { status: 500 }
    );
  }
}
