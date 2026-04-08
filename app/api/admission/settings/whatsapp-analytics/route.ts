

// GET /api/admission/settings/whatsapp-analytics
// WhatsApp analytics dashboard data — message stats, conversation stats, template usage, costs

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    const daysParam = searchParams.get('days');
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10) || 30, 1), 90) : 30;

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Verify institution access
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isProfileMatch = profile?.institution_id === institutionId;
    const isSuperAdmin = profile?.role === 'super_admin';

    if (!isProfileMatch && !isSuperAdmin) {
      const { data: access } = await supabase
        .from('user_institution_access')
        .select('id')
        .eq('user_id', user.id)
        .eq('institution_id', institutionId)
        .maybeSingle();

      if (!access) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const serviceClient = getServiceClient();
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateStr = sinceDate.toISOString();

    // Run all queries in parallel
    const [dailyStatsResult, conversationStatsResult, templateStatsResult, costResult] =
      await Promise.all([
        // 1. Daily message stats — join wa_messages via wa_conversations (messages don't have institution_id)
        (async () => {
          // Get conversation IDs for this institution
          const { data: convos } = await serviceClient
            .from('wa_conversations')
            .select('id')
            .eq('institution_id', institutionId);
          const convoIds = (convos || []).map((c: { id: string }) => c.id);
          if (convoIds.length === 0) return { data: [], error: null };
          return serviceClient
            .from('wa_messages')
            .select('status, created_at')
            .in('conversation_id', convoIds)
            .eq('direction', 'outbound')
            .gte('created_at', sinceDateStr)
            .order('created_at', { ascending: true });
        })(),

        // 2. Conversation stats from wa_conversations
        serviceClient
          .from('wa_conversations')
          .select('status')
          .eq('institution_id', institutionId),

        // 3. Template usage from wa_templates
        serviceClient
          .from('wa_templates')
          .select('name, sent_count, delivered_count')
          .eq('institution_id', institutionId)
          .order('sent_count', { ascending: false }),

        // 4. Cost data from communication_cost_log (may not exist)
        serviceClient
          .from('communication_cost_log')
          .select('category, cost, created_at')
          .eq('institution_id', institutionId)
          .gte('created_at', sinceDateStr)
          .then((res) => res)
          .catch(() => ({ data: null, error: null })),
      ]);

    // --- Process daily stats ---
    const dailyMap = new Map<
      string,
      { date: string; sent: number; delivered: number; read: number; failed: number }
    >();

    if (dailyStatsResult.data) {
      for (const msg of dailyStatsResult.data) {
        const date = new Date(msg.created_at).toISOString().split('T')[0];
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { date, sent: 0, delivered: 0, read: 0, failed: 0 });
        }
        const entry = dailyMap.get(date)!;
        entry.sent++;
        if (msg.status === 'delivered') entry.delivered++;
        if (msg.status === 'read') entry.read++;
        if (msg.status === 'failed') entry.failed++;
      }
    }

    const daily_stats = Array.from(dailyMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    // --- Process conversation stats ---
    const conversationData = conversationStatsResult.data || [];
    const conversation_stats = {
      open: conversationData.filter((c) => c.status === 'open').length,
      resolved: conversationData.filter((c) => c.status === 'resolved').length,
      total: conversationData.length,
    };

    // --- Process template stats ---
    const template_stats = (templateStatsResult.data || []).map((t) => ({
      name: t.name,
      sent_count: t.sent_count || 0,
      delivery_rate:
        t.sent_count && t.sent_count > 0
          ? Math.round(((t.delivered_count || 0) / t.sent_count) * 100) / 100
          : 0,
    }));

    // --- Process cost data ---
    let cost_summary: {
      total_cost: number;
      by_category: Record<string, number>;
    } = { total_cost: 0, by_category: {} };

    if (costResult.data && costResult.data.length > 0) {
      const byCategory: Record<string, number> = {};
      let totalCost = 0;
      for (const entry of costResult.data) {
        const cost = parseFloat(entry.cost) || 0;
        totalCost += cost;
        const cat = entry.category || 'uncategorized';
        byCategory[cat] = (byCategory[cat] || 0) + cost;
      }
      cost_summary = {
        total_cost: Math.round(totalCost * 100) / 100,
        by_category: byCategory,
      };
    }

    return NextResponse.json({
      data: {
        daily_stats,
        conversation_stats,
        template_stats,
        cost_summary,
      },
    });
  } catch (error) {
    console.error('[settings/whatsapp-analytics] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
