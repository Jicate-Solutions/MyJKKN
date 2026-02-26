// WhatsApp Counselor Performance Analytics Service
// Gap 10 — P2 Valuable
// Aggregates metrics from wa_conversations and wa_messages

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface CounselorMetrics {
  counselor_id: string;
  counselor_name: string;
  avatar_url: string | null;
  total_conversations: number;
  resolved_conversations: number;
  open_conversations: number;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
  messages_sent: number;
  messages_received: number;
  resolution_rate: number; // resolved / total * 100
}

export interface ResponseTimeDistribution {
  bucket: string; // '<1m' | '1-5m' | '5-15m' | '15-60m' | '>60m'
  count: number;
  percentage: number;
}

export interface CounselorTimelineEntry {
  date: string;
  conversations: number;
  messages: number;
  avg_response_min: number;
}

// =============================================================================
// Service
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class WhatsAppCounselorAnalyticsService {
  /**
   * Get performance metrics for all counselors in an institution
   */
  static async getCounselorPerformance(
    institutionId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<CounselorMetrics[]> {
    const supabase = getServiceClient();

    // Build date filter
    let dateFilter = '';
    const filterParams: string[] = [];
    if (dateFrom) {
      dateFilter += ` AND c.created_at >= '${dateFrom}'`;
    }
    if (dateTo) {
      dateFilter += ` AND c.created_at <= '${dateTo}'`;
    }

    // Query conversations grouped by counselor with profile join
    const { data: convStats, error: convError } = await supabase
      .from('wa_conversations')
      .select(`
        assigned_to,
        status,
        created_at,
        last_message_at,
        profiles!wa_conversations_assigned_to_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('institution_id', institutionId)
      .not('assigned_to', 'is', null);

    if (convError) throw new Error(`Failed to fetch conversations: ${convError.message}`);

    // Filter by date if provided
    let filteredConvs = convStats || [];
    if (dateFrom) {
      filteredConvs = filteredConvs.filter(c => c.created_at >= dateFrom);
    }
    if (dateTo) {
      filteredConvs = filteredConvs.filter(c => c.created_at <= dateTo);
    }

    // Group by counselor
    const counselorMap = new Map<string, {
      name: string;
      avatar_url: string | null;
      total: number;
      resolved: number;
      open: number;
      conversationIds: string[];
    }>();

    for (const conv of filteredConvs) {
      const counselorId = conv.assigned_to as string;
      const profileData = conv.profiles as unknown as { id: string; full_name: string; avatar_url: string | null } | { id: string; full_name: string; avatar_url: string | null }[] | null;
      const profile = Array.isArray(profileData) ? profileData[0] || null : profileData;

      if (!counselorMap.has(counselorId)) {
        counselorMap.set(counselorId, {
          name: profile?.full_name || 'Unknown',
          avatar_url: profile?.avatar_url || null,
          total: 0,
          resolved: 0,
          open: 0,
          conversationIds: [],
        });
      }

      const stats = counselorMap.get(counselorId)!;
      stats.total++;
      if (conv.status === 'resolved') stats.resolved++;
      if (conv.status === 'open' || conv.status === 'waiting') stats.open++;
    }

    // Get message counts per counselor
    const { data: msgStats, error: msgError } = await supabase
      .from('wa_messages')
      .select('sender_id, direction, conversation_id')
      .not('sender_id', 'is', null);

    // Build message counts keyed by sender_id
    const sentCounts = new Map<string, number>();
    const receivedCounts = new Map<string, number>();

    if (msgStats) {
      // Get conversation -> counselor mapping
      const convCounselorMap = new Map<string, string>();
      for (const conv of filteredConvs) {
        // We don't have conv.id in the select, so use assigned_to mapping
        // Instead, count by sender_id for outbound messages
      }

      for (const msg of msgStats) {
        if (msg.direction === 'outbound' && msg.sender_id) {
          sentCounts.set(msg.sender_id, (sentCounts.get(msg.sender_id) || 0) + 1);
        }
      }
    }

    // Get first-response times using raw query approach
    // For each counselor's conversations, find the time between first inbound and first outbound
    const responseTimesMap = new Map<string, number[]>();

    // For performance, we query the first inbound and outbound for conversations
    // We need to iterate over counselors and their conversations
    for (const [counselorId] of counselorMap) {
      // Get conversations assigned to this counselor
      const { data: counselorConvs } = await supabase
        .from('wa_conversations')
        .select('id, created_at')
        .eq('institution_id', institutionId)
        .eq('assigned_to', counselorId)
        .limit(200);

      if (!counselorConvs || counselorConvs.length === 0) continue;

      const responseTimes: number[] = [];

      for (const conv of counselorConvs.slice(0, 50)) { // Sample up to 50 for performance
        // Get first inbound message
        const { data: firstInbound } = await supabase
          .from('wa_messages')
          .select('created_at')
          .eq('conversation_id', conv.id)
          .eq('direction', 'inbound')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        if (!firstInbound) continue;

        // Get first outbound message after the first inbound
        const { data: firstOutbound } = await supabase
          .from('wa_messages')
          .select('created_at')
          .eq('conversation_id', conv.id)
          .eq('direction', 'outbound')
          .gt('created_at', firstInbound.created_at)
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        if (!firstOutbound) continue;

        const diffMs = new Date(firstOutbound.created_at).getTime() - new Date(firstInbound.created_at).getTime();
        const diffMin = diffMs / 60000;
        if (diffMin >= 0 && diffMin < 1440) { // Exclude outliers > 24h
          responseTimes.push(diffMin);
        }
      }

      responseTimesMap.set(counselorId, responseTimes);
    }

    // Build final metrics array
    const metrics: CounselorMetrics[] = [];

    for (const [counselorId, stats] of counselorMap) {
      const responseTimes = responseTimesMap.get(counselorId) || [];
      const avgFirstResponse = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : null;

      metrics.push({
        counselor_id: counselorId,
        counselor_name: stats.name,
        avatar_url: stats.avatar_url,
        total_conversations: stats.total,
        resolved_conversations: stats.resolved,
        open_conversations: stats.open,
        avg_first_response_minutes: avgFirstResponse !== null ? Math.round(avgFirstResponse * 10) / 10 : null,
        avg_resolution_minutes: null, // Would need resolved_at timestamp which isn't tracked separately
        messages_sent: sentCounts.get(counselorId) || 0,
        messages_received: 0, // Inbound messages aren't tied to counselor
        resolution_rate: stats.total > 0
          ? Math.round((stats.resolved / stats.total) * 1000) / 10
          : 0,
      });
    }

    // Sort by resolution rate descending
    metrics.sort((a, b) => b.resolution_rate - a.resolution_rate);

    return metrics;
  }

  /**
   * Get daily timeline for a specific counselor
   */
  static async getCounselorTimeline(
    counselorId: string,
    institutionId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<CounselorTimelineEntry[]> {
    const supabase = getServiceClient();

    // Get conversations for this counselor in date range
    const { data: convs, error } = await supabase
      .from('wa_conversations')
      .select('id, created_at')
      .eq('institution_id', institutionId)
      .eq('assigned_to', counselorId)
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo);

    if (error) throw new Error(`Failed to fetch timeline: ${error.message}`);

    // Group conversations by date
    const dateMap = new Map<string, { conversations: number; messages: number; responseTimes: number[] }>();

    // Initialize all dates in range
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dateMap.set(dateStr, { conversations: 0, messages: 0, responseTimes: [] });
    }

    // Count conversations per date
    for (const conv of (convs || [])) {
      const dateStr = new Date(conv.created_at).toISOString().split('T')[0];
      const entry = dateMap.get(dateStr);
      if (entry) entry.conversations++;
    }

    // Get message counts per date for this counselor
    const { data: msgs } = await supabase
      .from('wa_messages')
      .select('created_at')
      .eq('sender_id', counselorId)
      .eq('direction', 'outbound')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo);

    for (const msg of (msgs || [])) {
      const dateStr = new Date(msg.created_at).toISOString().split('T')[0];
      const entry = dateMap.get(dateStr);
      if (entry) entry.messages++;
    }

    // Convert to array
    const timeline: CounselorTimelineEntry[] = [];
    for (const [date, data] of dateMap) {
      const avgResponse = data.responseTimes.length > 0
        ? data.responseTimes.reduce((a, b) => a + b, 0) / data.responseTimes.length
        : 0;

      timeline.push({
        date,
        conversations: data.conversations,
        messages: data.messages,
        avg_response_min: Math.round(avgResponse * 10) / 10,
      });
    }

    timeline.sort((a, b) => a.date.localeCompare(b.date));
    return timeline;
  }

  /**
   * Get response time distribution across all counselors
   */
  static async getResponseTimeDistribution(
    institutionId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<ResponseTimeDistribution[]> {
    const supabase = getServiceClient();

    // Get all conversations for the institution
    let convQuery = supabase
      .from('wa_conversations')
      .select('id')
      .eq('institution_id', institutionId)
      .not('assigned_to', 'is', null);

    if (dateFrom) convQuery = convQuery.gte('created_at', dateFrom);
    if (dateTo) convQuery = convQuery.lte('created_at', dateTo);

    const { data: convs } = await convQuery.limit(500);
    if (!convs || convs.length === 0) {
      return [
        { bucket: '<1m', count: 0, percentage: 0 },
        { bucket: '1-5m', count: 0, percentage: 0 },
        { bucket: '5-15m', count: 0, percentage: 0 },
        { bucket: '15-60m', count: 0, percentage: 0 },
        { bucket: '>60m', count: 0, percentage: 0 },
      ];
    }

    const buckets = { '<1m': 0, '1-5m': 0, '5-15m': 0, '15-60m': 0, '>60m': 0 };
    let totalMeasured = 0;

    // Sample conversations for response times
    const sampleSize = Math.min(convs.length, 100);
    const sampled = convs.slice(0, sampleSize);

    for (const conv of sampled) {
      const { data: firstInbound } = await supabase
        .from('wa_messages')
        .select('created_at')
        .eq('conversation_id', conv.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (!firstInbound) continue;

      const { data: firstOutbound } = await supabase
        .from('wa_messages')
        .select('created_at')
        .eq('conversation_id', conv.id)
        .eq('direction', 'outbound')
        .gt('created_at', firstInbound.created_at)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (!firstOutbound) continue;

      const diffMin = (new Date(firstOutbound.created_at).getTime() - new Date(firstInbound.created_at).getTime()) / 60000;
      if (diffMin < 0 || diffMin > 1440) continue;

      totalMeasured++;
      if (diffMin < 1) buckets['<1m']++;
      else if (diffMin < 5) buckets['1-5m']++;
      else if (diffMin < 15) buckets['5-15m']++;
      else if (diffMin < 60) buckets['15-60m']++;
      else buckets['>60m']++;
    }

    return Object.entries(buckets).map(([bucket, count]) => ({
      bucket,
      count,
      percentage: totalMeasured > 0 ? Math.round((count / totalMeasured) * 1000) / 10 : 0,
    }));
  }

  /**
   * Get leaderboard sorted by a specific metric
   */
  static async getLeaderboard(
    institutionId: string,
    metric: 'resolution_rate' | 'response_time' | 'conversations' = 'resolution_rate',
    limit: number = 10
  ): Promise<CounselorMetrics[]> {
    const metrics = await this.getCounselorPerformance(institutionId);

    switch (metric) {
      case 'resolution_rate':
        metrics.sort((a, b) => b.resolution_rate - a.resolution_rate);
        break;
      case 'response_time':
        metrics.sort((a, b) => {
          if (a.avg_first_response_minutes === null) return 1;
          if (b.avg_first_response_minutes === null) return -1;
          return a.avg_first_response_minutes - b.avg_first_response_minutes;
        });
        break;
      case 'conversations':
        metrics.sort((a, b) => b.total_conversations - a.total_conversations);
        break;
    }

    return metrics.slice(0, limit);
  }
}
