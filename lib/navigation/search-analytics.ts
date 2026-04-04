import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Track search queries in usage_events for analytics.
 * Admin can see "top searches with no results" to improve keywords.
 */
export async function trackSearchAnalytics(params: {
  userId: string;
  query: string;
  resultsCount: number;
  selectedPath?: string;
  institutionId?: string;
}): Promise<void> {
  try {
    const supabase = createClientSupabaseClient();
    await supabase.from('usage_events').insert({
      user_id: params.userId,
      event_type: 'search',
      module: 'navigation',
      feature: 'command_palette',
      metadata: {
        query: params.query,
        results_count: params.resultsCount,
        selected_path: params.selectedPath || null,
      },
      institution_id: params.institutionId || null,
      source: 'client',
    });
  } catch {
    // Silently fail — analytics tracking should never break UX
  }
}
