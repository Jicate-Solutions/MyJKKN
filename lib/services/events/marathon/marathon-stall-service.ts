// lib/services/events/marathon/marathon-stall-service.ts
// Stall CRUD + dynamic auto-assignment for marathon events.
// Created: 2026-04-11

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  EventStall,
  CreateEventStallDto,
  UpdateEventStallDto,
} from '@/types/events-marathon';

// ============================================================================
// Service
// ============================================================================

export class MarathonStallService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Read Operations
  // --------------------------------------------------------------------------

  /**
   * Fetch active stalls for an event, ordered by sort_order.
   */
  static async getStalls(eventId: string): Promise<EventStall[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_stalls')
        .select('*')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        logger.error('events/marathon-stalls', 'Failed to fetch stalls', error);
        throw error;
      }

      return (data as unknown as EventStall[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-stalls', 'Unexpected error in getStalls', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Write Operations
  // --------------------------------------------------------------------------

  /**
   * Create a new stall for an event.
   */
  static async createStall(dto: CreateEventStallDto): Promise<EventStall> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_stalls')
        .insert([{
          event_id: dto.event_id,
          stall_name: dto.stall_name,
          stall_code: dto.stall_code,
          capacity: dto.capacity,
          location_note: dto.location_note ?? null,
          sort_order: dto.sort_order ?? 0,
        }])
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-stalls', 'Failed to create stall', error);
        throw error;
      }

      logger.info('events/marathon-stalls', 'Stall created', {
        eventId: dto.event_id,
        stallName: dto.stall_name,
      });

      return data as unknown as EventStall;
    } catch (error) {
      logger.error('events/marathon-stalls', 'Unexpected error in createStall', error);
      throw error;
    }
  }

  /**
   * Update an existing stall.
   */
  static async updateStall(id: string, dto: UpdateEventStallDto): Promise<EventStall> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_stalls')
        .update(dto)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-stalls', 'Failed to update stall', { id, error });
        throw error;
      }

      logger.info('events/marathon-stalls', 'Stall updated', { id });

      return data as unknown as EventStall;
    } catch (error) {
      logger.error('events/marathon-stalls', 'Unexpected error in updateStall', error);
      throw error;
    }
  }

  /**
   * Soft-delete a stall (set is_active = false).
   */
  static async deleteStall(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('events_stalls')
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        logger.error('events/marathon-stalls', 'Failed to delete stall', { id, error });
        throw error;
      }

      logger.info('events/marathon-stalls', 'Stall soft-deleted', { id });
    } catch (error) {
      logger.error('events/marathon-stalls', 'Unexpected error in deleteStall', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Auto-Assignment
  // --------------------------------------------------------------------------

  /**
   * Auto-assign stalls to registrations sequentially by BIB number.
   * Fills Stall 1 to capacity, then Stall 2, etc.
   * Returns count of assigned and unassigned registrations.
   */
  static async autoAssignStalls(
    eventId: string
  ): Promise<{ assigned: number; unassigned: number }> {
    try {
      // Fetch active stalls ordered by sort_order
      const { data: stalls, error: stallError } = await (this.supabase as any)
        .from('events_stalls')
        .select('*')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (stallError) {
        logger.error('events/marathon-stalls', 'Failed to fetch stalls for auto-assign', stallError);
        throw stallError;
      }

      if (!stalls || stalls.length === 0) {
        logger.warn('events/marathon-stalls', 'No active stalls found for auto-assign', { eventId });
        return { assigned: 0, unassigned: 0 };
      }

      // Fetch all registrations ordered by bib_number ASC
      const { data: registrations, error: regError } = await (this.supabase as any)
        .from('events_registrations')
        .select('id, bib_number')
        .eq('event_id', eventId)
        .neq('status', 'cancelled')
        .order('bib_number', { ascending: true });

      if (regError) {
        logger.error('events/marathon-stalls', 'Failed to fetch registrations for auto-assign', regError);
        throw regError;
      }

      const regs = (registrations ?? []) as { id: string; bib_number: string }[];
      if (regs.length === 0) {
        return { assigned: 0, unassigned: 0 };
      }

      // Distribute sequentially: fill each stall to capacity
      const typedStalls = stalls as unknown as EventStall[];
      let stallIdx = 0;
      let filledInCurrentStall = 0;
      let assigned = 0;

      // Build update batches: Map<stall_id, registration_ids[]>
      const assignments = new Map<string, string[]>();

      for (const reg of regs) {
        // Move to next stall if current is full
        while (
          stallIdx < typedStalls.length &&
          filledInCurrentStall >= typedStalls[stallIdx].capacity
        ) {
          stallIdx++;
          filledInCurrentStall = 0;
        }

        if (stallIdx >= typedStalls.length) break; // No more stalls

        const stallId = typedStalls[stallIdx].id;
        if (!assignments.has(stallId)) {
          assignments.set(stallId, []);
        }
        assignments.get(stallId)!.push(reg.id);
        filledInCurrentStall++;
        assigned++;
      }

      // Update in chunks of 100 per stall
      for (const [stallId, regIds] of assignments) {
        for (let i = 0; i < regIds.length; i += 100) {
          const chunk = regIds.slice(i, i + 100);
          const { error: updateError } = await (this.supabase as any)
            .from('events_registrations')
            .update({ stall_id: stallId })
            .in('id', chunk);

          if (updateError) {
            logger.error('events/marathon-stalls', 'Failed to update stall assignments chunk', {
              stallId,
              chunkSize: chunk.length,
              error: updateError,
            });
            throw updateError;
          }
        }
      }

      const unassigned = regs.length - assigned;

      logger.info('events/marathon-stalls', 'Auto-assign complete', {
        eventId,
        assigned,
        unassigned,
      });

      return { assigned, unassigned };
    } catch (error) {
      logger.error('events/marathon-stalls', 'Unexpected error in autoAssignStalls', error);
      throw error;
    }
  }

  /**
   * Clear all stall assignments for an event.
   */
  static async clearAssignments(eventId: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('events_registrations')
        .update({ stall_id: null })
        .eq('event_id', eventId);

      if (error) {
        logger.error('events/marathon-stalls', 'Failed to clear stall assignments', { eventId, error });
        throw error;
      }

      logger.info('events/marathon-stalls', 'Stall assignments cleared', { eventId });
    } catch (error) {
      logger.error('events/marathon-stalls', 'Unexpected error in clearAssignments', error);
      throw error;
    }
  }
}
