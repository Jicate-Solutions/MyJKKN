// lib/services/admission/feedback-service.ts
// Service for feedback collection from candidates who didn't join
// Uses admission_leads table fields: is_lost, lost_reason, lost_at, funnel_stage

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface FeedbackCandidate {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  interested_programs: string[];
  funnel_stage: string;
  is_lost: boolean;
  lost_reason: string | null;
  lost_at: string | null;
  score: number;
  engagement_score: number;
  notes: string | null;
  created_at: string;
  institution_id: string;
}

export interface FeedbackStats {
  totalCandidates: number;
  respondedCount: number;
  pendingCount: number;
  declinedOffer: number;
  withdrew: number;
  lost: number;
  topReasons: Array<{ reason: string; count: number; percent: number }>;
}

export interface FeedbackFilters {
  institutionId: string;
  status?: 'all' | 'responded' | 'pending' | 'lost' | 'declined' | 'withdrew';
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class FeedbackService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get candidates eligible for feedback (lost leads, declined, withdrew)
   */
  static async getCandidates(
    filters: FeedbackFilters
  ): Promise<{ candidates: FeedbackCandidate[]; total: number }> {
    let query = (this.supabase as any)
      .from('admission_leads')
      .select(
        'id, full_name, email, phone, interested_programs, funnel_stage, is_lost, lost_reason, lost_at, score, engagement_score, notes, created_at, institution_id',
        { count: 'exact' }
      )
      .eq('institution_id', filters.institutionId)
      .or(
        'is_lost.eq.true,funnel_stage.eq.declined,funnel_stage.eq.withdrew,funnel_stage.eq.lost,funnel_stage.eq.expired'
      )
      .order('lost_at', { ascending: false, nullsFirst: false });

    if (filters.search) {
      const s = filters.search.replace(/[%_\\]/g, '\\$&');
      query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
    }

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'lost') {
        query = query.eq('is_lost', true);
      } else if (filters.status === 'declined') {
        query = query.eq('funnel_stage', 'declined');
      } else if (filters.status === 'withdrew') {
        query = query.eq('funnel_stage', 'withdrew');
      } else if (filters.status === 'responded') {
        // Those with lost_reason filled
        query = query.not('lost_reason', 'is', null);
      } else if (filters.status === 'pending') {
        // Those without lost_reason
        query = query.is('lost_reason', null);
      }
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 50) - 1
      );
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('[admission/feedback] Error fetching candidates:', error);
      throw new Error('Failed to fetch feedback candidates');
    }

    return {
      candidates: (data || []) as FeedbackCandidate[],
      total: count || 0,
    };
  }

  /**
   * Get feedback stats
   */
  static async getStats(institutionId: string): Promise<FeedbackStats> {
    const { data, error } = await (this.supabase as any)
      .from('admission_leads')
      .select('id, funnel_stage, is_lost, lost_reason')
      .eq('institution_id', institutionId)
      .or(
        'is_lost.eq.true,funnel_stage.eq.declined,funnel_stage.eq.withdrew,funnel_stage.eq.lost,funnel_stage.eq.expired'
      );

    if (error) {
      console.error('[admission/feedback] Error fetching stats:', error);
      return {
        totalCandidates: 0,
        respondedCount: 0,
        pendingCount: 0,
        declinedOffer: 0,
        withdrew: 0,
        lost: 0,
        topReasons: [],
      };
    }

    const candidates = data || [];
    const total = candidates.length;
    const responded = candidates.filter((c: any) => c.lost_reason).length;
    const pending = total - responded;
    const declined = candidates.filter(
      (c: any) => c.funnel_stage === 'declined'
    ).length;
    const withdrew = candidates.filter(
      (c: any) => c.funnel_stage === 'withdrew'
    ).length;
    const lost = candidates.filter((c: any) => c.is_lost).length;

    // Aggregate lost reasons
    const reasonCounts: Record<string, number> = {};
    for (const c of candidates) {
      if (c.lost_reason) {
        reasonCounts[c.lost_reason] =
          (reasonCounts[c.lost_reason] || 0) + 1;
      }
    }

    const topReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({
        reason,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalCandidates: total,
      respondedCount: responded,
      pendingCount: pending,
      declinedOffer: declined,
      withdrew,
      lost,
      topReasons,
    };
  }

  /**
   * Update feedback/lost reason on a lead
   */
  static async updateFeedback(
    leadId: string,
    feedbackData: {
      lost_reason?: string;
      notes?: string;
    }
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_leads')
      .update({
        ...feedbackData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) {
      console.error('[admission/feedback] Error updating feedback:', error);
      throw new Error('Failed to update feedback');
    }
  }
}
