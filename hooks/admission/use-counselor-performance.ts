// hooks/admission/use-counselor-performance.ts
// React Query hooks for Counselor Performance Dashboard
// Queries admission_leads + admission_counselors directly (no WhatsApp dependency)

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// =============================================================================
// Types
// =============================================================================

export interface CounselorPerformanceMetrics {
  counselorId: string;
  counselorName: string;
  leadsAssigned: number;
  conversions: number;
  conversionRate: number;
  avgResponseTime: number; // minutes
  messagesSent: number; // activity count
}

export interface ResponseTimeDistribution {
  bucket: string;
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
// Query Keys
// =============================================================================

export const counselorPerfKeys = {
  all: ['counselor-performance'] as const,
  list: (institutionId: string, from?: string, to?: string) =>
    [...counselorPerfKeys.all, 'list', institutionId, from, to] as const,
  timeline: (counselorId: string, institutionId?: string, from?: string, to?: string) =>
    [...counselorPerfKeys.all, 'timeline', counselorId, institutionId, from, to] as const,
};

// Stages that count as successful conversions
const CONVERSION_STAGES = ['enrolled', 'offer_accepted', 'token_paid'];

// =============================================================================
// Data Fetcher — queries admission_leads directly
// =============================================================================

async function fetchAdmissionPerformance(
  institutionId: string,
  from?: string,
  to?: string
): Promise<{ counselors: CounselorPerformanceMetrics[]; distribution: ResponseTimeDistribution[] }> {
  const supabase = createClientSupabaseClient();

  // 1. Get all active counselors for this institution
  const { data: counselors, error: counselorError } = await (supabase as any)
    .from('admission_counselors')
    .select('id, name, email')
    .eq('institution_id', institutionId)
    .eq('is_active', true);

  if (counselorError) throw new Error(`Failed to fetch counselors: ${counselorError.message}`);
  if (!counselors?.length) return { counselors: [], distribution: [] };

  // 2. Get leads assigned to any counselor in this institution
  let leadsQuery = (supabase as any)
    .from('admission_leads')
    .select('id, counselor_id, funnel_stage, created_at, assigned_at, last_contact_at')
    .eq('institution_id', institutionId)
    .not('counselor_id', 'is', null);

  if (from) leadsQuery = leadsQuery.gte('created_at', from);
  if (to) leadsQuery = leadsQuery.lte('created_at', to);

  const { data: leads, error: leadsError } = await leadsQuery;
  if (leadsError) throw new Error(`Failed to fetch leads: ${leadsError.message}`);

  // 3. Get activity counts per lead (for "messages sent" metric)
  const leadIds = (leads || []).map((l: any) => l.id);
  const counselorActivityCounts = new Map<string, number>();

  if (leadIds.length > 0) {
    // Supabase .in() has a practical limit; batch if needed
    const batchSize = 200;
    for (let i = 0; i < leadIds.length; i += batchSize) {
      const batch = leadIds.slice(i, i + batchSize);
      const { data: activities } = await (supabase as any)
        .from('admission_lead_activities')
        .select('lead_id')
        .in('lead_id', batch);

      // Map activity counts back to counselor_id via the lead
      const leadCounselorMap = new Map<string, string>();
      for (const lead of (leads || [])) {
        leadCounselorMap.set(lead.id, lead.counselor_id);
      }

      for (const a of (activities || [])) {
        const cId = leadCounselorMap.get(a.lead_id);
        if (cId) {
          counselorActivityCounts.set(cId, (counselorActivityCounts.get(cId) || 0) + 1);
        }
      }
    }
  }

  // 4. Build metrics per counselor
  const metrics: CounselorPerformanceMetrics[] = counselors.map((counselor: any) => {
    const counselorLeads = (leads || []).filter((l: any) => l.counselor_id === counselor.id);
    const conversions = counselorLeads.filter((l: any) =>
      CONVERSION_STAGES.includes(l.funnel_stage)
    );

    // Avg response time: time between lead creation and counselor assignment (in minutes)
    const responseTimes = counselorLeads
      .filter((l: any) => l.assigned_at && l.created_at)
      .map((l: any) => {
        const created = new Date(l.created_at).getTime();
        const assigned = new Date(l.assigned_at).getTime();
        return (assigned - created) / (1000 * 60);
      })
      .filter((t: number) => t >= 0 && t < 60 * 24 * 30); // exclude unreasonable (>30 days)

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum: number, t: number) => sum + t, 0) / responseTimes.length
      : 0;

    return {
      counselorId: counselor.id,
      counselorName: counselor.name || 'Unknown',
      leadsAssigned: counselorLeads.length,
      conversions: conversions.length,
      conversionRate: counselorLeads.length > 0
        ? (conversions.length / counselorLeads.length) * 100
        : 0,
      avgResponseTime,
      messagesSent: counselorActivityCounts.get(counselor.id) || 0,
    };
  });

  return { counselors: metrics, distribution: [] };
}

// =============================================================================
// Hooks
// =============================================================================

export function useCounselorPerformance(
  institutionId: string | undefined,
  dateRange?: { from?: string; to?: string }
) {
  const query = useQuery({
    queryKey: counselorPerfKeys.list(
      institutionId || '',
      dateRange?.from,
      dateRange?.to
    ),
    queryFn: () =>
      fetchAdmissionPerformance(institutionId!, dateRange?.from, dateRange?.to),
    enabled: !!institutionId,
  });

  return {
    counselors: (query.data?.counselors || []) as CounselorPerformanceMetrics[],
    distribution: query.data?.distribution || [],
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
  };
}

export function useCounselorTimeline(
  counselorId: string | undefined,
  institutionId: string | undefined,
  dateRange?: { from: string; to: string }
) {
  const query = useQuery<CounselorTimelineEntry[]>({
    queryKey: counselorPerfKeys.timeline(counselorId || '', institutionId, dateRange?.from, dateRange?.to),
    queryFn: async () => {
      // Timeline not yet implemented for admission-based metrics
      return [];
    },
    enabled: !!counselorId && !!institutionId,
  });

  return {
    timeline: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
