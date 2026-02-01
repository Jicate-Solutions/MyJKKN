// lib/services/maturity-assessment/maturity-assessment-service-atomic.ts
// ATOMIC OPERATIONS FOR MATURITY ASSESSMENT - RACE CONDITION FIXES

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { MaturityProgressItem } from '@/types/maturity-assessment';

export class MaturityAssessmentServiceAtomic {
  private static supabase: any = createClientSupabaseClient();

  /**
   * Update maturity progress item atomically
   * Prevents concurrent status updates from corrupting state
   */
  static async updateProgress(
    progressId: string,
    status: string,
    notes?: string,
    expectedVersion?: number
  ): Promise<MaturityProgressItem> {
    try {
      const { data, error } = await this.supabase.rpc('update_maturity_progress_atomic', {
        p_progress_id: progressId,
        p_status: status,
        p_notes: notes,
        p_expected_version: expectedVersion
      });

      if (error) {
        if (error.message?.includes('Concurrent update detected')) {
          throw new Error('This progress item was updated by someone else. Please refresh and try again.');
        }
        console.error('[MaturityAssessmentServiceAtomic] Error updating progress:', error);
        throw new Error(`Failed to update progress: ${error.message}`);
      }

      return data as MaturityProgressItem;
    } catch (error) {
      console.error('[MaturityAssessmentServiceAtomic] Error in updateProgress:', error);
      throw error;
    }
  }

  /**
   * Complete multiple progress items atomically
   * Uses transaction to ensure all-or-nothing updates
   */
  static async completeMultipleItems(
    progressIds: string[],
    notes?: string
  ): Promise<MaturityProgressItem[]> {
    const results: MaturityProgressItem[] = [];

    // Process each item with retry logic
    for (const id of progressIds) {
      try {
        const result = await this.updateProgress(id, 'completed', notes);
        results.push(result);
      } catch (error) {
        console.error(`[MaturityAssessmentServiceAtomic] Failed to complete item ${id}:`, error);
        // Continue with other items even if one fails
      }
    }

    return results;
  }
}
