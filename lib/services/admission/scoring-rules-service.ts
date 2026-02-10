// lib/services/admission/scoring-rules-service.ts
// Admission CRM Scoring Rules Service - Supabase interactions

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export interface ScoringCriterion {
  id: string;
  name: string;
  type: 'engagement' | 'quality';
  points?: number; // For engagement criteria
  weight?: number; // For quality criteria (percentage)
  maxOccurrence?: number; // For engagement criteria
  enabled: boolean;
}

export interface ScoreRange {
  id: string;
  min: number;
  max: number;
  label: string;
  color: string;
  action: string;
}

export interface ScoringRuleConfig {
  engagementWeight: number; // Percentage (0-100)
  qualityWeight: number; // Percentage (0-100)
  engagementCriteria: ScoringCriterion[];
  qualityCriteria: ScoringCriterion[];
  scoreRanges: ScoreRange[];
}

export interface ScoringRule {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  criteria: ScoringRuleConfig;
  created_at: string;
  updated_at: string;
}

export interface CreateScoringRuleInput {
  institution_id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  criteria: ScoringRuleConfig;
}

export interface UpdateScoringRuleInput {
  name?: string;
  description?: string;
  is_active?: boolean;
  criteria?: ScoringRuleConfig;
}

export class ScoringRulesService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // CRUD METHODS
  // ============================================================================

  /**
   * Get all scoring rules for an institution
   */
  static async getScoringRules(institutionId: string): Promise<ScoringRule[]> {
    const { data, error } = await this.supabase
      .from('admission_scoring_rules')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admission/scoring-rules] Failed to fetch scoring rules:', error);
      throw new Error('Failed to fetch scoring rules');
    }

    return data || [];
  }

  /**
   * Get active scoring rule for an institution
   */
  static async getActiveScoringRule(institutionId: string): Promise<ScoringRule | null> {
    const { data, error } = await this.supabase
      .from('admission_scoring_rules')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[admission/scoring-rules] Failed to fetch active rule:', error);
      throw new Error('Failed to fetch active scoring rule');
    }

    return data?.[0] || null;
  }

  /**
   * Get a single scoring rule by ID
   */
  static async getScoringRule(id: string): Promise<ScoringRule | null> {
    const { data, error } = await this.supabase
      .from('admission_scoring_rules')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/scoring-rules] Failed to fetch scoring rule:', error);
      throw new Error('Failed to fetch scoring rule');
    }

    return data;
  }

  /**
   * Create a new scoring rule
   */
  static async createScoringRule(input: CreateScoringRuleInput): Promise<ScoringRule> {
    // If this rule is active, deactivate other active rules first
    if (input.is_active !== false) {
      await this.deactivateAllRules(input.institution_id);
    }

    const { data, error } = await this.supabase
      .from('admission_scoring_rules')
      .insert({
        institution_id: input.institution_id,
        name: input.name,
        description: input.description || null,
        is_active: input.is_active ?? true,
        criteria: input.criteria,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/scoring-rules] Failed to create scoring rule:', error);
      throw new Error('Failed to create scoring rule');
    }

    return data;
  }

  /**
   * Update an existing scoring rule
   */
  static async updateScoringRule(id: string, input: UpdateScoringRuleInput): Promise<ScoringRule> {
    // If activating this rule, deactivate others first
    if (input.is_active === true) {
      const existing = await this.getScoringRule(id);
      if (existing) {
        await this.deactivateAllRules(existing.institution_id);
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.criteria !== undefined) updateData.criteria = input.criteria;

    const { data, error } = await this.supabase
      .from('admission_scoring_rules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/scoring-rules] Failed to update scoring rule:', error);
      throw new Error('Failed to update scoring rule');
    }

    return data;
  }

  /**
   * Delete a scoring rule
   */
  static async deleteScoringRule(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_scoring_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/scoring-rules] Failed to delete scoring rule:', error);
      throw new Error('Failed to delete scoring rule');
    }
  }

  /**
   * Toggle scoring rule active status
   */
  static async toggleRuleStatus(id: string, isActive: boolean): Promise<ScoringRule> {
    const existing = await this.getScoringRule(id);
    if (!existing) {
      throw new Error('Scoring rule not found');
    }

    // If activating, deactivate other rules first
    if (isActive) {
      await this.deactivateAllRules(existing.institution_id);
    }

    return this.updateScoringRule(id, { is_active: isActive });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Deactivate all scoring rules for an institution
   * IMPORTANT: This must throw on error to prevent multiple active rules
   */
  private static async deactivateAllRules(institutionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_scoring_rules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('institution_id', institutionId)
      .eq('is_active', true);

    if (error) {
      console.error('[admission/scoring-rules] Failed to deactivate rules:', error);
      throw new Error('Failed to deactivate existing rules. Please try again.');
    }
  }

  /**
   * Get default scoring rule configuration
   */
  static getDefaultConfig(): ScoringRuleConfig {
    return {
      engagementWeight: 50,
      qualityWeight: 50,
      engagementCriteria: [
        { id: '1', name: 'Website Visit', type: 'engagement', points: 5, maxOccurrence: 10, enabled: true },
        { id: '2', name: 'Email Opened', type: 'engagement', points: 3, maxOccurrence: 20, enabled: true },
        { id: '3', name: 'Email Clicked', type: 'engagement', points: 10, maxOccurrence: 10, enabled: true },
        { id: '4', name: 'Form Submitted', type: 'engagement', points: 25, maxOccurrence: 5, enabled: true },
        { id: '5', name: 'WhatsApp Response', type: 'engagement', points: 15, maxOccurrence: 15, enabled: true },
        { id: '6', name: 'Call Answered', type: 'engagement', points: 20, maxOccurrence: 10, enabled: true },
        { id: '7', name: 'Campus Visit', type: 'engagement', points: 50, maxOccurrence: 3, enabled: true },
        { id: '8', name: 'Document Uploaded', type: 'engagement', points: 30, maxOccurrence: 10, enabled: true },
      ],
      qualityCriteria: [
        { id: '1', name: 'Academic Score (10th)', type: 'quality', weight: 15, enabled: true },
        { id: '2', name: 'Academic Score (12th)', type: 'quality', weight: 20, enabled: true },
        { id: '3', name: 'Entrance Exam Score', type: 'quality', weight: 25, enabled: true },
        { id: '4', name: 'Program Match', type: 'quality', weight: 15, enabled: true },
        { id: '5', name: 'Location Proximity', type: 'quality', weight: 10, enabled: false },
        { id: '6', name: 'Financial Capability', type: 'quality', weight: 10, enabled: true },
        { id: '7', name: 'Application Completeness', type: 'quality', weight: 5, enabled: true },
      ],
      scoreRanges: [
        { id: '1', min: 90, max: 100, label: 'Hot Lead', color: 'bg-red-500', action: 'Immediate follow-up' },
        { id: '2', min: 70, max: 89, label: 'Warm Lead', color: 'bg-orange-500', action: 'Priority contact within 24h' },
        { id: '3', min: 50, max: 69, label: 'Qualified Lead', color: 'bg-yellow-500', action: 'Scheduled follow-up' },
        { id: '4', min: 30, max: 49, label: 'Nurture Lead', color: 'bg-blue-500', action: 'Email sequence' },
        { id: '5', min: 0, max: 29, label: 'Cold Lead', color: 'bg-gray-400', action: 'Re-engagement campaign' },
      ],
    };
  }

  /**
   * Calculate lead score based on criteria
   */
  static calculateScore(
    config: ScoringRuleConfig,
    engagementData: Record<string, number>,
    qualityData: Record<string, number>
  ): { engagementScore: number; qualityScore: number; totalScore: number; category: string } {
    // Calculate engagement score
    let engagementScore = 0;
    let maxEngagementScore = 0;

    for (const criterion of config.engagementCriteria) {
      if (!criterion.enabled) continue;

      const occurrences = engagementData[criterion.name] || 0;
      const cappedOccurrences = Math.min(occurrences, criterion.maxOccurrence || 1);
      const points = criterion.points || 0;

      engagementScore += cappedOccurrences * points;
      maxEngagementScore += (criterion.maxOccurrence || 1) * points;
    }

    // Normalize to 0-100
    engagementScore = maxEngagementScore > 0
      ? Math.round((engagementScore / maxEngagementScore) * 100)
      : 0;

    // Calculate quality score (weighted average)
    let qualityScore = 0;
    let totalWeight = 0;

    for (const criterion of config.qualityCriteria) {
      if (!criterion.enabled) continue;

      const value = qualityData[criterion.name] || 0; // Assume 0-100 scale
      const weight = criterion.weight || 0;

      qualityScore += value * (weight / 100);
      totalWeight += weight;
    }

    // Normalize if weights don't add up to 100
    if (totalWeight > 0 && totalWeight !== 100) {
      qualityScore = Math.round((qualityScore / totalWeight) * 100);
    } else {
      qualityScore = Math.round(qualityScore);
    }

    // Calculate total score
    const totalScore = Math.round(
      (engagementScore * (config.engagementWeight / 100)) +
      (qualityScore * (config.qualityWeight / 100))
    );

    // Determine category
    let category = 'Unknown';
    for (const range of config.scoreRanges) {
      if (totalScore >= range.min && totalScore <= range.max) {
        category = range.label;
        break;
      }
    }

    return { engagementScore, qualityScore, totalScore, category };
  }
}
