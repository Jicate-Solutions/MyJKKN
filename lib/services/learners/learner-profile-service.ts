// ============================================================================
// Learner Profile Service
// Handles learner profile operations and capability tracking
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type { FinksDimensions } from '@/types/competency';

/**
 * Validate Fink's dimension scores (0-100 range)
 * Accepts partial dimensions for flexible updates
 */
function validateFinksDimensions(dimensions: Partial<FinksDimensions>): void {
  const validDimensions = new Set<keyof FinksDimensions>([
    'foundational_knowledge',
    'application',
    'integration',
    'human_dimension',
    'caring',
    'learning_to_learn'
  ]);

  for (const [key, value] of Object.entries(dimensions)) {
    if (!validDimensions.has(key as keyof FinksDimensions)) {
      throw new Error(`Invalid Fink's dimension: ${key}`);
    }
    if (typeof value !== 'number' || value < 0 || value > 100) {
      throw new Error(`Fink's dimension ${key} must be between 0 and 100, got ${value}`);
    }
  }
}

/**
 * Calculate aggregate score across Fink's dimensions
 * Returns weighted average (0-100)
 */
export function calculateFinkAggregate(
  dimensions: Partial<FinksDimensions>,
  weights?: Partial<FinksDimensions>
): number {
  const defaultWeights: FinksDimensions = {
    foundational_knowledge: 15,
    application: 20,
    integration: 15,
    human_dimension: 20,
    caring: 15,
    learning_to_learn: 15
  };

  const finalWeights = { ...defaultWeights, ...weights };
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [dimension, score] of Object.entries(dimensions)) {
    if (dimension in finalWeights && typeof score === 'number') {
      const weight = finalWeights[dimension as keyof FinksDimensions] || 0;
      totalWeightedScore += score * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
}

/**
 * Calculate "AI-Proof" score
 * Measures dimensions that AI cannot replicate: human connection, caring, self-direction
 * Returns average of human_dimension, caring, and learning_to_learn (0-100)
 *
 * Why these dimensions?
 * - human_dimension: Understanding oneself and others (empathy, self-awareness)
 * - caring: Developing feelings, interests, values (emotional intelligence)
 * - learning_to_learn: Becoming self-directed (metacognition, autonomy)
 *
 * These represent transformation AI cannot achieve - the human element.
 */
export function calculateAIProofScore(dimensions: Partial<FinksDimensions>): number {
  const humanDimension = dimensions.human_dimension || 0;
  const caring = dimensions.caring || 0;
  const learningHowToLearn = dimensions.learning_to_learn || 0;

  const sum = humanDimension + caring + learningHowToLearn;
  const count = (humanDimension > 0 ? 1 : 0) + (caring > 0 ? 1 : 0) + (learningHowToLearn > 0 ? 1 : 0);

  return count > 0 ? Math.round(sum / count) : 0;
}

/**
 * Get dimension gaps (areas needing improvement)
 * Returns dimensions below threshold, sorted by priority
 */
export function getFinksDimensionGaps(
  dimensions: Partial<FinksDimensions>,
  threshold: number = 70
): Array<{ dimension: keyof FinksDimensions; score: number; gap: number }> {
  const gaps: Array<{ dimension: keyof FinksDimensions; score: number; gap: number }> = [];

  for (const [dimension, score] of Object.entries(dimensions) as [keyof FinksDimensions, number][]) {
    if (score < threshold) {
      gaps.push({
        dimension,
        score,
        gap: threshold - score
      });
    }
  }

  // Sort by gap size (largest gaps first)
  return gaps.sort((a, b) => b.gap - a.gap);
}

/**
 * Get dimension strengths (areas of excellence)
 * Returns dimensions above threshold, sorted by score
 */
export function getFinksDimensionStrengths(
  dimensions: Partial<FinksDimensions>,
  threshold: number = 85
): Array<{ dimension: keyof FinksDimensions; score: number }> {
  const strengths: Array<{ dimension: keyof FinksDimensions; score: number }> = [];

  for (const [dimension, score] of Object.entries(dimensions) as [keyof FinksDimensions, number][]) {
    if (score >= threshold) {
      strengths.push({ dimension, score });
    }
  }

  // Sort by score (highest first)
  return strengths.sort((a, b) => b.score - a.score);
}

/**
 * Compare two Fink's dimension profiles
 * Returns dimension-by-dimension comparison
 */
export function compareFinksDimensions(
  current: Partial<FinksDimensions>,
  target: Partial<FinksDimensions>
): Array<{
  dimension: keyof FinksDimensions;
  current: number;
  target: number;
  difference: number;
  status: 'ahead' | 'on_track' | 'behind';
}> {
  const allDimensionKeys = Array.from(new Set([
    ...Object.keys(current),
    ...Object.keys(target)
  ])) as Array<keyof FinksDimensions>;

  const comparison: Array<{
    dimension: keyof FinksDimensions;
    current: number;
    target: number;
    difference: number;
    status: 'ahead' | 'on_track' | 'behind';
  }> = [];

  for (const dimension of allDimensionKeys) {
    const currentScore = current[dimension] || 0;
    const targetScore = target[dimension] || 0;
    const difference = currentScore - targetScore;

    let status: 'ahead' | 'on_track' | 'behind';
    if (difference > 5) status = 'ahead';
    else if (difference < -5) status = 'behind';
    else status = 'on_track';

    comparison.push({
      dimension,
      current: currentScore,
      target: targetScore,
      difference,
      status
    });
  }

  return comparison.sort((a, b) => b.difference - a.difference);
}

// ============================================================================
// LEARNER PROFILE SERVICE
// ============================================================================

export class LearnerProfileService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Validate UUID format
   */
  private static isValidUUID(id: string | undefined | null): boolean {
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || id.trim() === '') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  private static validateId(id: string | undefined | null, fieldName: string = 'ID'): void {
    if (!this.isValidUUID(id)) {
      const actualValue = id === undefined ? 'undefined' : id === null ? 'null' : `"${id}"`;
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  private static formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      if (e.message) return String(e.message);
      return JSON.stringify(error);
    }
    return String(error);
  }

  /**
   * Get learner profile with Fink's dimensions
   */
  static async getLearnerProfile(learnerId: string) {
    try {
      this.validateId(learnerId, 'learner_id');

      const { data, error } = await (this.getSupabase() as any)
        .from('learners_profiles')
        .select('*')
        .eq('id', learnerId)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('[LearnerProfile] Error fetching profile:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Update Fink's dimensions for a learner
   * Note: Assumes finks_dimensions JSONB column exists in learners_profiles or learner_competencies
   */
  static async updateFinksDimensions(
    learnerId: string,
    dimensions: Partial<FinksDimensions>
  ): Promise<void> {
    try {
      this.validateId(learnerId, 'learner_id');
      validateFinksDimensions(dimensions);

      // Get current dimensions
      const { data: current, error: fetchError } = await (this.getSupabase() as any)
        .from('learners_profiles')
        .select('finks_dimensions')
        .eq('id', learnerId)
        .single();

      if (fetchError) throw fetchError;

      // Merge with existing dimensions
      const updatedDimensions = {
        ...(current?.finks_dimensions || {}),
        ...dimensions
      };

      // Update profile
      const { error: updateError } = await (this.getSupabase() as any)
        .from('learners_profiles')
        .update({
          finks_dimensions: updatedDimensions,
          updated_at: new Date().toISOString()
        })
        .eq('id', learnerId);

      if (updateError) throw updateError;

      toast.success('Fink\'s dimensions updated successfully');
    } catch (error) {
      console.error('[LearnerProfile] Error updating Fink\'s dimensions:', this.formatError(error));
      toast.error('Failed to update dimensions');
      throw error;
    }
  }

  /**
   * Get learner's Fink's dimension profile
   */
  static async getFinksDimensions(learnerId: string): Promise<Partial<FinksDimensions>> {
    try {
      this.validateId(learnerId, 'learner_id');

      const { data, error } = await (this.getSupabase() as any)
        .from('learners_profiles')
        .select('finks_dimensions')
        .eq('id', learnerId)
        .single();

      if (error) throw error;

      return data?.finks_dimensions || {};
    } catch (error) {
      console.error('[LearnerProfile] Error fetching Fink\'s dimensions:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Calculate aggregate Fink's score for a learner
   */
  static async calculateLearnerFinkAggregate(
    learnerId: string,
    weights?: Partial<FinksDimensions>
  ): Promise<number> {
    try {
      const dimensions = await this.getFinksDimensions(learnerId);
      return calculateFinkAggregate(dimensions, weights);
    } catch (error) {
      console.error('[LearnerProfile] Error calculating aggregate:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Calculate AI-Proof score for a learner
   * Measures human dimensions that AI cannot replicate
   */
  static async calculateLearnerAIProofScore(learnerId: string): Promise<number> {
    try {
      const dimensions = await this.getFinksDimensions(learnerId);
      return calculateAIProofScore(dimensions);
    } catch (error) {
      console.error('[LearnerProfile] Error calculating AI-proof score:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get learner's dimension gaps (areas needing improvement)
   */
  static async getLearnerDimensionGaps(
    learnerId: string,
    threshold: number = 70
  ): Promise<Array<{ dimension: keyof FinksDimensions; score: number; gap: number }>> {
    try {
      const dimensions = await this.getFinksDimensions(learnerId);
      return getFinksDimensionGaps(dimensions, threshold);
    } catch (error) {
      console.error('[LearnerProfile] Error getting gaps:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get learner's dimension strengths
   */
  static async getLearnerDimensionStrengths(
    learnerId: string,
    threshold: number = 85
  ): Promise<Array<{ dimension: keyof FinksDimensions; score: number }>> {
    try {
      const dimensions = await this.getFinksDimensions(learnerId);
      return getFinksDimensionStrengths(dimensions, threshold);
    } catch (error) {
      console.error('[LearnerProfile] Error getting strengths:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Batch update Fink's dimensions from assessment results
   * Useful for updating multiple learners after competency assessments
   */
  static async batchUpdateFinksDimensions(
    updates: Array<{
      learner_id: string;
      dimensions: Partial<FinksDimensions>;
    }>
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const update of updates) {
      try {
        await this.updateFinksDimensions(update.learner_id, update.dimensions);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`${update.learner_id}: ${this.formatError(error)}`);
      }
    }

    if (result.success > 0) {
      toast.success(`Updated ${result.success} learner dimension profiles`);
    }
    if (result.failed > 0) {
      toast.error(`Failed to update ${result.failed} profiles`);
    }

    return result;
  }
}
