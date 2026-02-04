// lib/services/admission/lead-scoring-engine-service.ts
// Lead Scoring Engine Service - Calculates and manages lead scores

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ScoringRulesService, ScoringRuleConfig, ScoreRange } from './scoring-rules-service';
import { ActivityService } from './activity-service';

// Types
export interface LeadScore {
  id: string;
  lead_id: string;
  institution_id: string;
  total_score: number;
  engagement_score: number;
  quality_score: number;
  score_breakdown: ScoreBreakdown;
  factors: ScoreFactors;
  score_category: string;
  recommended_action: string | null;
  scoring_rule_id: string | null;
  calculated_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScoreBreakdown {
  engagement: Record<string, EngagementBreakdownItem>;
  quality: Record<string, QualityBreakdownItem>;
}

export interface EngagementBreakdownItem {
  occurrences: number;
  points: number;
  maxOccurrences: number;
  maxPoints: number;
}

export interface QualityBreakdownItem {
  value: number;
  weight: number;
  weighted_score: number;
}

export interface ScoreFactors {
  totalEngagementPoints: number;
  maxEngagementPoints: number;
  qualityWeightSum: number;
  totalQualityWeight: number;
  engagementWeight: number;
  qualityWeight: number;
}

export interface CalculateScoreResult {
  leadId: string;
  totalScore: number;
  engagementScore: number;
  qualityScore: number;
  category: string;
  recommendedAction: string;
  breakdown: ScoreBreakdown;
  factors: ScoreFactors;
}

export interface LeadScoreFilters {
  institution_id: string;
  min_score?: number;
  max_score?: number;
  category?: string;
  expired_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface BulkScoreResult {
  success: number;
  failed: number;
  errors: Array<{ leadId: string; error: string }>;
}

export class LeadScoringEngineService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // SCORE CALCULATION
  // ============================================================================

  /**
   * Calculate score for a single lead
   */
  static async calculateLeadScore(leadId: string): Promise<CalculateScoreResult> {
    // 1. Get lead data
    const { data: lead, error: leadError } = await this.supabase
      .from('admission_leads')
      .select('*, institution_id')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      console.error('[admission/scoring-engine] Failed to fetch lead:', leadError);
      throw new Error('Lead not found');
    }

    // 2. Get active scoring rule for the institution
    const scoringRule = await ScoringRulesService.getActiveScoringRule(lead.institution_id);

    if (!scoringRule) {
      console.warn('[admission/scoring-engine] No active scoring rule found for institution:', lead.institution_id);
      // Return default score if no rule configured
      return {
        leadId,
        totalScore: 0,
        engagementScore: 0,
        qualityScore: 0,
        category: 'Unknown',
        recommendedAction: 'Configure scoring rules',
        breakdown: { engagement: {}, quality: {} },
        factors: {
          totalEngagementPoints: 0,
          maxEngagementPoints: 0,
          qualityWeightSum: 0,
          totalQualityWeight: 0,
          engagementWeight: 50,
          qualityWeight: 50,
        },
      };
    }

    const config = scoringRule.criteria as ScoringRuleConfig;

    // 3. Get engagement data from activities
    const engagementData = await this.getEngagementData(leadId);

    // 4. Get quality data from lead profile
    const qualityData = this.extractQualityData(lead);

    // 5. Calculate scores
    const result = this.calculateScoreFromData(config, engagementData, qualityData);

    // 6. Save score to database
    await this.saveLeadScore(leadId, lead.institution_id, result, scoringRule.id);

    // 7. Update lead's score field
    await this.updateLeadScore(leadId, result.totalScore, result.category);

    return {
      leadId,
      ...result,
    };
  }

  /**
   * Calculate scores for multiple leads in batch
   */
  static async calculateBulkScores(leadIds: string[]): Promise<BulkScoreResult> {
    const result: BulkScoreResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Process in parallel with concurrency limit
    const BATCH_SIZE = 10;
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const batch = leadIds.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (leadId) => {
        try {
          await this.calculateLeadScore(leadId);
          result.success++;
        } catch (error) {
          result.failed++;
          result.errors.push({
            leadId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

      await Promise.all(promises);
    }

    return result;
  }

  /**
   * Recalculate all lead scores for an institution
   */
  static async recalculateAllScores(institutionId: string): Promise<BulkScoreResult> {
    // Get all leads for the institution
    const { data: leads, error } = await this.supabase
      .from('admission_leads')
      .select('id')
      .eq('institution_id', institutionId)
      .not('funnel_stage', 'eq', 'lost'); // Skip lost leads

    if (error) {
      console.error('[admission/scoring-engine] Failed to fetch leads for recalculation:', error);
      throw new Error('Failed to fetch leads');
    }

    const leadIds = (leads || []).map((l: { id: string }) => l.id);
    return this.calculateBulkScores(leadIds);
  }

  // ============================================================================
  // SCORE RETRIEVAL
  // ============================================================================

  /**
   * Get score for a single lead
   */
  static async getLeadScore(leadId: string): Promise<LeadScore | null> {
    const { data, error } = await this.supabase
      .from('admission_lead_scores')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/scoring-engine] Failed to fetch lead score:', error);
      throw new Error('Failed to fetch lead score');
    }

    return data;
  }

  /**
   * Get detailed score breakdown for a lead
   */
  static async getScoreBreakdown(leadId: string): Promise<{
    score: LeadScore | null;
    engagementDetails: Record<string, EngagementBreakdownItem>;
    qualityDetails: Record<string, QualityBreakdownItem>;
    categoryInfo: ScoreRange | null;
  }> {
    const score = await this.getLeadScore(leadId);

    if (!score) {
      return {
        score: null,
        engagementDetails: {},
        qualityDetails: {},
        categoryInfo: null,
      };
    }

    // Get the scoring rule to fetch category info
    let categoryInfo: ScoreRange | null = null;
    if (score.scoring_rule_id) {
      const rule = await ScoringRulesService.getScoringRule(score.scoring_rule_id);
      if (rule) {
        const config = rule.criteria as ScoringRuleConfig;
        categoryInfo = config.scoreRanges.find(
          (r) => score.total_score >= r.min && score.total_score <= r.max
        ) || null;
      }
    }

    return {
      score,
      engagementDetails: score.score_breakdown.engagement || {},
      qualityDetails: score.score_breakdown.quality || {},
      categoryInfo,
    };
  }

  /**
   * Get leads by score range
   */
  static async getLeadsByScoreRange(filters: LeadScoreFilters): Promise<{
    data: LeadScore[];
    total: number;
  }> {
    let query = this.supabase
      .from('admission_lead_scores')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institution_id);

    if (filters.min_score !== undefined) {
      query = query.gte('total_score', filters.min_score);
    }

    if (filters.max_score !== undefined) {
      query = query.lte('total_score', filters.max_score);
    }

    if (filters.category) {
      query = query.eq('score_category', filters.category);
    }

    if (filters.expired_only) {
      query = query.lt('expires_at', new Date().toISOString());
    }

    query = query.order('total_score', { ascending: false });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('[admission/scoring-engine] Failed to fetch leads by score range:', error);
      throw new Error('Failed to fetch leads by score range');
    }

    return {
      data: data || [],
      total: count || 0,
    };
  }

  /**
   * Get leads with their scores joined
   */
  static async getLeadsWithScores(institutionId: string, options?: {
    minScore?: number;
    maxScore?: number;
    category?: string;
    limit?: number;
  }): Promise<Array<{
    lead: {
      id: string;
      full_name: string;
      email: string | null;
      phone: string;
      funnel_stage: string;
      priority: string;
    };
    score: LeadScore | null;
  }>> {
    let query = this.supabase
      .from('admission_leads')
      .select(`
        id, full_name, email, phone, funnel_stage, priority, score, score_category,
        admission_lead_scores!left(*)
      `)
      .eq('institution_id', institutionId)
      .not('funnel_stage', 'eq', 'lost');

    if (options?.minScore !== undefined) {
      query = query.gte('score', options.minScore);
    }

    if (options?.maxScore !== undefined) {
      query = query.lte('score', options.maxScore);
    }

    if (options?.category) {
      query = query.eq('score_category', options.category);
    }

    query = query.order('score', { ascending: false, nullsFirst: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/scoring-engine] Failed to fetch leads with scores:', error);
      throw new Error('Failed to fetch leads with scores');
    }

    return (data || []).map((item: {
      id: string;
      full_name: string;
      email: string | null;
      phone: string;
      funnel_stage: string;
      priority: string;
      admission_lead_scores?: LeadScore[];
    }) => ({
      lead: {
        id: item.id,
        full_name: item.full_name,
        email: item.email,
        phone: item.phone,
        funnel_stage: item.funnel_stage,
        priority: item.priority,
      },
      score: item.admission_lead_scores?.[0] || null,
    }));
  }

  // ============================================================================
  // SCORE STATISTICS
  // ============================================================================

  /**
   * Get score distribution statistics for an institution
   */
  static async getScoreStatistics(institutionId: string): Promise<{
    totalLeads: number;
    scoredLeads: number;
    averageScore: number;
    medianScore: number;
    distribution: Array<{ category: string; count: number; percentage: number }>;
    topPerformers: LeadScore[];
    needsAttention: LeadScore[];
  }> {
    // Get all scores for institution
    const { data: scores, error } = await this.supabase
      .from('admission_lead_scores')
      .select('*')
      .eq('institution_id', institutionId)
      .order('total_score', { ascending: false });

    if (error) {
      console.error('[admission/scoring-engine] Failed to fetch score statistics:', error);
      throw new Error('Failed to fetch score statistics');
    }

    const allScores = scores || [];
    const scoredLeads = allScores.length;

    // Get total leads count
    const { count: totalLeads } = await this.supabase
      .from('admission_leads')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .not('funnel_stage', 'eq', 'lost');

    // Calculate average
    const averageScore = scoredLeads > 0
      ? Math.round(allScores.reduce((sum: number, s: LeadScore) => sum + s.total_score, 0) / scoredLeads)
      : 0;

    // Calculate median
    const sortedScores = allScores.map((s: LeadScore) => s.total_score).sort((a: number, b: number) => a - b);
    const medianScore = scoredLeads > 0
      ? sortedScores[Math.floor(scoredLeads / 2)]
      : 0;

    // Calculate distribution by category
    const categoryCount: Record<string, number> = {};
    allScores.forEach((s: LeadScore) => {
      categoryCount[s.score_category] = (categoryCount[s.score_category] || 0) + 1;
    });

    const distribution = Object.entries(categoryCount).map(([category, count]) => ({
      category,
      count,
      percentage: scoredLeads > 0 ? Math.round((count / scoredLeads) * 100) : 0,
    }));

    // Top performers (top 5 by score)
    const topPerformers = allScores.slice(0, 5);

    // Needs attention (bottom 5 or expired scores)
    const needsAttention = allScores
      .filter((s: LeadScore) => s.total_score < 30 || (s.expires_at && new Date(s.expires_at) < new Date()))
      .slice(0, 5);

    return {
      totalLeads: totalLeads || 0,
      scoredLeads,
      averageScore,
      medianScore,
      distribution,
      topPerformers,
      needsAttention,
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Get engagement data from lead activities
   */
  private static async getEngagementData(leadId: string): Promise<Record<string, number>> {
    const engagementData: Record<string, number> = {};

    try {
      const activities = await ActivityService.getActivities(leadId);

      // Map activity types to engagement criteria names
      const activityTypeMap: Record<string, string> = {
        call: 'Call Answered',
        email: 'Email Opened',
        meeting: 'Campus Visit',
        whatsapp: 'WhatsApp Response',
        sms: 'Email Clicked',
        note: 'Form Submitted',
        task: 'Document Uploaded',
      };

      activities.forEach((activity) => {
        const criterionName = activityTypeMap[activity.activity_type];
        if (criterionName) {
          engagementData[criterionName] = (engagementData[criterionName] || 0) + 1;
        }
      });

      // Add website visits from lead metadata if available
      // This would come from tracking data - defaulting to 0 for now
      engagementData['Website Visit'] = engagementData['Website Visit'] || 0;
    } catch (error) {
      console.warn('[admission/scoring-engine] Failed to fetch activities for engagement data:', error);
    }

    return engagementData;
  }

  /**
   * Extract quality data from lead profile
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static extractQualityData(lead: any): Record<string, number> {
    const qualityData: Record<string, number> = {};

    // Map lead fields to quality criteria
    // These would come from the lead's additional data or linked learner profile

    // Academic Score (10th) - Default to 0, would come from linked profile
    qualityData['Academic Score (10th)'] = lead.academic_score_10th || 0;

    // Academic Score (12th) - Default to 0, would come from linked profile
    qualityData['Academic Score (12th)'] = lead.academic_score_12th || 0;

    // Entrance Exam Score - Default to 0
    qualityData['Entrance Exam Score'] = lead.entrance_score || 0;

    // Program Match - Calculate based on interest alignment (0-100)
    qualityData['Program Match'] = lead.program_interest ? 80 : 0; // Base score if interested

    // Location Proximity - Would need geocoding, defaulting to 50
    qualityData['Location Proximity'] = 50;

    // Financial Capability - Based on tags or explicit data
    const hasFeeCapability = lead.tags?.includes('fee-capable') || lead.tags?.includes('scholarship-eligible');
    qualityData['Financial Capability'] = hasFeeCapability ? 80 : 50;

    // Application Completeness - Calculate from lead data completeness
    let completeness = 0;
    if (lead.full_name) completeness += 20;
    if (lead.email) completeness += 20;
    if (lead.phone) completeness += 20;
    if (lead.program_interest) completeness += 20;
    if (lead.address || lead.city) completeness += 20;
    qualityData['Application Completeness'] = completeness;

    return qualityData;
  }

  /**
   * Calculate score from engagement and quality data
   */
  private static calculateScoreFromData(
    config: ScoringRuleConfig,
    engagementData: Record<string, number>,
    qualityData: Record<string, number>
  ): {
    totalScore: number;
    engagementScore: number;
    qualityScore: number;
    category: string;
    recommendedAction: string;
    breakdown: ScoreBreakdown;
    factors: ScoreFactors;
  } {
    // Calculate engagement score
    let totalEngagementPoints = 0;
    let maxEngagementPoints = 0;
    const engagementBreakdown: Record<string, EngagementBreakdownItem> = {};

    for (const criterion of config.engagementCriteria) {
      if (!criterion.enabled) continue;

      const occurrences = engagementData[criterion.name] || 0;
      const maxOccurrence = criterion.maxOccurrence || 1;
      const cappedOccurrences = Math.min(occurrences, maxOccurrence);
      const points = (criterion.points || 0) * cappedOccurrences;
      const maxPoints = (criterion.points || 0) * maxOccurrence;

      totalEngagementPoints += points;
      maxEngagementPoints += maxPoints;

      engagementBreakdown[criterion.name] = {
        occurrences,
        points,
        maxOccurrences: maxOccurrence,
        maxPoints,
      };
    }

    // Normalize engagement score to 0-100
    const engagementScore = maxEngagementPoints > 0
      ? Math.round((totalEngagementPoints / maxEngagementPoints) * 100)
      : 0;

    // Calculate quality score
    let qualityWeightSum = 0;
    let totalQualityWeight = 0;
    const qualityBreakdown: Record<string, QualityBreakdownItem> = {};

    for (const criterion of config.qualityCriteria) {
      if (!criterion.enabled) continue;

      const value = qualityData[criterion.name] || 0;
      const weight = criterion.weight || 0;
      const weightedScore = (value / 100) * weight;

      qualityWeightSum += weightedScore;
      totalQualityWeight += weight;

      qualityBreakdown[criterion.name] = {
        value,
        weight,
        weighted_score: Math.round(weightedScore * 100) / 100,
      };
    }

    // Normalize quality score
    const qualityScore = totalQualityWeight > 0
      ? Math.round((qualityWeightSum / totalQualityWeight) * 100)
      : 0;

    // Calculate total score (weighted combination)
    const totalScore = Math.round(
      (engagementScore * (config.engagementWeight / 100)) +
      (qualityScore * (config.qualityWeight / 100))
    );

    // Determine category and action
    let category = 'Unknown';
    let recommendedAction = 'Review lead';

    for (const range of config.scoreRanges) {
      if (totalScore >= range.min && totalScore <= range.max) {
        category = range.label;
        recommendedAction = range.action;
        break;
      }
    }

    return {
      totalScore,
      engagementScore,
      qualityScore,
      category,
      recommendedAction,
      breakdown: {
        engagement: engagementBreakdown,
        quality: qualityBreakdown,
      },
      factors: {
        totalEngagementPoints,
        maxEngagementPoints,
        qualityWeightSum,
        totalQualityWeight,
        engagementWeight: config.engagementWeight,
        qualityWeight: config.qualityWeight,
      },
    };
  }

  /**
   * Save calculated score to database
   */
  private static async saveLeadScore(
    leadId: string,
    institutionId: string,
    result: {
      totalScore: number;
      engagementScore: number;
      qualityScore: number;
      category: string;
      recommendedAction: string;
      breakdown: ScoreBreakdown;
      factors: ScoreFactors;
    },
    scoringRuleId: string
  ): Promise<void> {
    // Set expiration to 7 days from now (configurable)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const scoreData = {
      lead_id: leadId,
      institution_id: institutionId,
      total_score: result.totalScore,
      engagement_score: result.engagementScore,
      quality_score: result.qualityScore,
      score_breakdown: result.breakdown,
      factors: result.factors,
      score_category: result.category,
      recommended_action: result.recommendedAction,
      scoring_rule_id: scoringRuleId,
      calculated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    const { error } = await this.supabase
      .from('admission_lead_scores')
      .upsert(scoreData, { onConflict: 'lead_id' });

    if (error) {
      console.error('[admission/scoring-engine] Failed to save lead score:', error);
      throw new Error('Failed to save lead score');
    }
  }

  /**
   * Update lead's score field
   */
  private static async updateLeadScore(
    leadId: string,
    score: number,
    category: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('admission_leads')
      .update({
        score,
        score_category: category,
        score_updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) {
      console.error('[admission/scoring-engine] Failed to update lead score field:', error);
      // Don't throw - this is a secondary update
    }
  }
}
