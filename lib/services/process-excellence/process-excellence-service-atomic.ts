// lib/services/process-excellence/process-excellence-service-atomic.ts
// ATOMIC OPERATIONS FOR PROCESS EXCELLENCE - RACE CONDITION FIXES

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { ProcessInstance } from '@/types/process-excellence';

export class ProcessExcellenceServiceAtomic {
  private static supabase: any = createClientSupabaseClient();

  /**
   * Advance process stage atomically
   * Uses database function with SELECT FOR UPDATE to prevent race conditions
   */
  static async advanceStage(
    instanceId: string,
    newStage: string,
    isValueAdd?: boolean,
    expectedVersion?: number
  ): Promise<ProcessInstance> {
    try {
      const { data, error } = await this.supabase.rpc('advance_process_stage_atomic', {
        p_instance_id: instanceId,
        p_new_stage: newStage,
        p_is_value_add: isValueAdd,
        p_expected_version: expectedVersion
      });

      if (error) {
        if (error.message?.includes('Concurrent update detected')) {
          throw new Error('This process was updated by someone else. Please refresh and try again.');
        }
        console.error('[ProcessExcellenceServiceAtomic] Error advancing stage:', error);
        throw new Error(`Failed to advance stage: ${error.message}`);
      }

      return data as ProcessInstance;
    } catch (error) {
      console.error('[ProcessExcellenceServiceAtomic] Error in advanceStage:', error);
      throw error;
    }
  }

  /**
   * Complete process instance atomically
   * Calculates all metrics in a single transaction
   */
  static async completeProcess(
    instanceId: string,
    expectedVersion?: number
  ): Promise<ProcessInstance> {
    try {
      const { data, error } = await this.supabase.rpc('complete_process_instance_atomic', {
        p_instance_id: instanceId,
        p_expected_version: expectedVersion
      });

      if (error) {
        if (error.message?.includes('Concurrent update detected')) {
          throw new Error('This process was updated by someone else. Please refresh and try again.');
        }
        console.error('[ProcessExcellenceServiceAtomic] Error completing process:', error);
        throw new Error(`Failed to complete process: ${error.message}`);
      }

      return data as ProcessInstance;
    } catch (error) {
      console.error('[ProcessExcellenceServiceAtomic] Error in completeProcess:', error);
      throw error;
    }
  }

  /**
   * Retry wrapper for optimistic locking failures
   * Automatically retries up to 3 times on version conflicts
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (lastError.message?.includes('Concurrent update detected') && attempt < maxRetries) {
          // Wait a bit before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }
}
