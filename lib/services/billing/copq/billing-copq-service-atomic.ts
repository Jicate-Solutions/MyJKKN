// lib/services/billing/copq/billing-copq-service-atomic.ts
// ATOMIC OPERATIONS FOR BILLING COPQ - RACE CONDITION FIXES

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { BillingCOPQIncident } from '@/types/billing-copq';

export class BillingCOPQServiceAtomic {
  private static supabase: any = createClientSupabaseClient();

  /**
   * Resolve COPQ incident atomically
   * Prevents duplicate resolution attempts
   */
  static async resolveIncident(
    incidentId: string,
    preventiveAction?: string,
    expectedVersion?: number
  ): Promise<BillingCOPQIncident> {
    try {
      const { data, error } = await this.supabase.rpc('resolve_copq_incident_atomic', {
        p_incident_id: incidentId,
        p_preventive_action: preventiveAction,
        p_expected_version: expectedVersion
      });

      if (error) {
        if (error.message?.includes('Concurrent update detected')) {
          throw new Error('This incident was updated by someone else. Please refresh and try again.');
        }
        if (error.message?.includes('already resolved')) {
          throw new Error('This incident has already been resolved.');
        }
        console.error('[BillingCOPQServiceAtomic] Error resolving incident:', error);
        throw new Error(`Failed to resolve incident: ${error.message}`);
      }

      return data as BillingCOPQIncident;
    } catch (error) {
      console.error('[BillingCOPQServiceAtomic] Error in resolveIncident:', error);
      throw error;
    }
  }

  /**
   * Write off COPQ incident atomically
   * Prevents duplicate write-off attempts
   */
  static async writeOffIncident(
    incidentId: string,
    expectedVersion?: number
  ): Promise<BillingCOPQIncident> {
    try {
      const { data, error } = await this.supabase.rpc('writeoff_copq_incident_atomic', {
        p_incident_id: incidentId,
        p_expected_version: expectedVersion
      });

      if (error) {
        if (error.message?.includes('Concurrent update detected')) {
          throw new Error('This incident was updated by someone else. Please refresh and try again.');
        }
        if (error.message?.includes('already resolved')) {
          throw new Error('This incident has already been resolved or written off.');
        }
        console.error('[BillingCOPQServiceAtomic] Error writing off incident:', error);
        throw new Error(`Failed to write off incident: ${error.message}`);
      }

      return data as BillingCOPQIncident;
    } catch (error) {
      console.error('[BillingCOPQServiceAtomic] Error in writeOffIncident:', error);
      throw error;
    }
  }
}
