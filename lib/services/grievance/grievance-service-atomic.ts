// lib/services/grievance/grievance-service-atomic.ts
// ATOMIC OPERATIONS FOR GRIEVANCE SERVICE - RACE CONDITION FIXES

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { GrievanceTicket } from '@/types/grievance';

export class GrievanceServiceAtomic {
  private static supabase: any = createClientSupabaseClient();

  /**
   * Resolve a ticket atomically with SLA calculation
   * Uses database function to prevent race conditions
   */
  static async resolveTicket(
    ticketId: string,
    resolution: string,
    resolvedBy: string,
    expectedVersion?: number
  ): Promise<GrievanceTicket> {
    try {
      const { data, error } = await this.supabase.rpc('update_grievance_sla_atomic', {
        p_ticket_id: ticketId,
        p_status: 'resolved',
        p_resolution: resolution,
        p_resolved_by: resolvedBy,
        p_expected_version: expectedVersion
      });

      if (error) {
        if (error.message?.includes('Concurrent update detected')) {
          throw new Error('This ticket was updated by someone else. Please refresh and try again.');
        }
        console.error('[GrievanceServiceAtomic] Error resolving ticket:', error);
        throw new Error(`Failed to resolve ticket: ${error.message}`);
      }

      return data as GrievanceTicket;
    } catch (error) {
      console.error('[GrievanceServiceAtomic] Error in resolveTicket:', error);
      throw error;
    }
  }

  /**
   * Assign a ticket atomically
   * Uses database function to prevent concurrent assignments
   */
  static async assignTicket(
    ticketId: string,
    assigneeId: string,
    departmentId?: string,
    expectedVersion?: number
  ): Promise<GrievanceTicket> {
    try {
      const { data, error } = await this.supabase.rpc('assign_grievance_ticket_atomic', {
        p_ticket_id: ticketId,
        p_assignee_id: assigneeId,
        p_department_id: departmentId || null,
        p_expected_version: expectedVersion
      });

      if (error) {
        if (error.message?.includes('Concurrent update detected')) {
          throw new Error('This ticket was updated by someone else. Please refresh and try again.');
        }
        console.error('[GrievanceServiceAtomic] Error assigning ticket:', error);
        throw new Error(`Failed to assign ticket: ${error.message}`);
      }

      return data as GrievanceTicket;
    } catch (error) {
      console.error('[GrievanceServiceAtomic] Error in assignTicket:', error);
      throw error;
    }
  }

  /**
   * Update ticket status atomically
   */
  static async updateStatus(
    ticketId: string,
    status: string,
    expectedVersion?: number
  ): Promise<GrievanceTicket> {
    try {
      const { data, error } = await this.supabase.rpc('update_grievance_sla_atomic', {
        p_ticket_id: ticketId,
        p_status: status,
        p_expected_version: expectedVersion
      });

      if (error) {
        if (error.message?.includes('Concurrent update detected')) {
          throw new Error('This ticket was updated by someone else. Please refresh and try again.');
        }
        console.error('[GrievanceServiceAtomic] Error updating status:', error);
        throw new Error(`Failed to update status: ${error.message}`);
      }

      return data as GrievanceTicket;
    } catch (error) {
      console.error('[GrievanceServiceAtomic] Error in updateStatus:', error);
      throw error;
    }
  }
}
