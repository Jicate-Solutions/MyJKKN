// lib/services/events/marathon/marathon-sponsor-service.ts
// Sponsorship CRM service — pipeline management, deliverables, activity log.
// Created: 2026-04-07

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MarathonSponsor,
  MarathonSponsorDeliverable,
  MarathonSponsorActivityLog,
  SponsorPipelineStage,
  CreateMarathonSponsorDto,
} from '@/types/events-marathon';

// ============================================================================
// Service
// ============================================================================

export class MarathonSponsorService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Read Operations
  // --------------------------------------------------------------------------

  /**
   * List all sponsors for an event.
   * Includes deliverable counts and totals via sub-selects.
   */
  static async getSponsors(eventId: string): Promise<MarathonSponsor[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_sponsors')
        .select(`
          *,
          deliverables:marathon_sponsor_deliverables(id, status)
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to fetch sponsors', error);
        throw error;
      }

      return (data as unknown as MarathonSponsor[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in getSponsors', error);
      throw error;
    }
  }

  /**
   * Fetch a single sponsor with full deliverables list and activity log.
   */
  static async getSponsor(id: string): Promise<MarathonSponsor | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_sponsors')
        .select(`
          *,
          deliverables:marathon_sponsor_deliverables(*),
          activity_log:marathon_sponsor_activity_log(*)
        `)
        .eq('id', id)
        .order('created_at', { referencedTable: 'marathon_sponsor_activity_log', ascending: false })
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        logger.error('events/marathon-sponsor', 'Failed to fetch sponsor', { id, error });
        throw error;
      }

      return data as unknown as MarathonSponsor;
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in getSponsor', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Write Operations
  // --------------------------------------------------------------------------

  /**
   * Create a new sponsor.
   */
  static async createSponsor(dto: CreateMarathonSponsorDto): Promise<MarathonSponsor> {
    try {
      const insertPayload = {
        event_id: dto.event_id,
        company_name: dto.company_name,
        contact_person: dto.contact_person ?? null,
        contact_email: dto.contact_email ?? null,
        contact_phone: dto.contact_phone ?? null,
        website: dto.website ?? null,
        tier: dto.tier ?? 'bronze',
        amount_pledged: dto.amount_pledged ?? 0,
        amount_received: 0,
        benefits: dto.benefits ?? null,
        pipeline_stage: dto.pipeline_stage ?? 'lead',
      };

      const { data, error } = await (this.supabase as any)
        .from('marathon_sponsors')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to create sponsor', error);
        throw error;
      }

      logger.info('events/marathon-sponsor', 'Sponsor created', {
        eventId: dto.event_id,
        company: dto.company_name,
      });

      return data as unknown as MarathonSponsor;
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in createSponsor', error);
      throw error;
    }
  }

  /**
   * Update sponsor fields.
   */
  static async updateSponsor(
    id: string,
    dto: Partial<MarathonSponsor>
  ): Promise<MarathonSponsor> {
    try {
      // Strip joined fields before update
      const { deliverables: _d, activity_log: _a, ...updatePayload } = dto as any;

      const { data, error } = await (this.supabase as any)
        .from('marathon_sponsors')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to update sponsor', { id, error });
        throw error;
      }

      return data as unknown as MarathonSponsor;
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in updateSponsor', error);
      throw error;
    }
  }

  /**
   * Delete a sponsor and cascade its deliverables / activity log via DB constraints.
   */
  static async deleteSponsor(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('marathon_sponsors')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to delete sponsor', { id, error });
        throw error;
      }

      logger.info('events/marathon-sponsor', 'Sponsor deleted', { id });
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in deleteSponsor', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Pipeline Stage
  // --------------------------------------------------------------------------

  /**
   * Move a sponsor to a new pipeline stage (Kanban column change).
   */
  static async movePipelineStage(
    id: string,
    newStage: SponsorPipelineStage
  ): Promise<MarathonSponsor> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_sponsors')
        .update({ pipeline_stage: newStage })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to move pipeline stage', { id, newStage, error });
        throw error;
      }

      logger.info('events/marathon-sponsor', 'Pipeline stage moved', { id, newStage });
      return data as unknown as MarathonSponsor;
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in movePipelineStage', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Deliverables
  // --------------------------------------------------------------------------

  /**
   * Add a deliverable to a sponsor.
   */
  static async addDeliverable(
    sponsorId: string,
    dto: Partial<MarathonSponsorDeliverable>
  ): Promise<MarathonSponsorDeliverable> {
    try {
      const insertPayload = {
        sponsor_id: sponsorId,
        title: dto.title,
        description: dto.description ?? null,
        category: dto.category ?? null,
        status: dto.status ?? 'pending',
        due_date: dto.due_date ?? null,
        assigned_to: dto.assigned_to ?? null,
      };

      const { data, error } = await (this.supabase as any)
        .from('marathon_sponsor_deliverables')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to add deliverable', { sponsorId, error });
        throw error;
      }

      return data as unknown as MarathonSponsorDeliverable;
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in addDeliverable', error);
      throw error;
    }
  }

  /**
   * Update a deliverable.
   */
  static async updateDeliverable(
    id: string,
    dto: Partial<MarathonSponsorDeliverable>
  ): Promise<MarathonSponsorDeliverable> {
    try {
      const updatePayload: Record<string, unknown> = { ...dto };
      // If marking as completed, set completed_at timestamp
      if (dto.status === 'completed' && !dto.completed_at) {
        updatePayload.completed_at = new Date().toISOString();
      }

      const { data, error } = await (this.supabase as any)
        .from('marathon_sponsor_deliverables')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to update deliverable', { id, error });
        throw error;
      }

      return data as unknown as MarathonSponsorDeliverable;
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in updateDeliverable', error);
      throw error;
    }
  }

  /**
   * Delete a deliverable.
   */
  static async deleteDeliverable(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('marathon_sponsor_deliverables')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to delete deliverable', { id, error });
        throw error;
      }
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in deleteDeliverable', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Activity Log
  // --------------------------------------------------------------------------

  /**
   * Log an interaction with a sponsor (call, email, meeting, payment, note).
   */
  static async logActivity(
    sponsorId: string,
    dto: { activity_type: string; description: string; performed_by?: string }
  ): Promise<MarathonSponsorActivityLog> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_sponsor_activity_log')
        .insert([
          {
            sponsor_id: sponsorId,
            activity_type: dto.activity_type,
            description: dto.description,
            performed_by: dto.performed_by ?? null,
          },
        ])
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to log activity', { sponsorId, error });
        throw error;
      }

      return data as unknown as MarathonSponsorActivityLog;
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in logActivity', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------

  /**
   * Aggregated sponsor summary for an event's dashboard.
   */
  static async getSponsorSummary(eventId: string): Promise<{
    total_sponsors: number;
    total_pledged: number;
    total_received: number;
    by_tier: { tier: string; count: number; amount: number }[];
    by_pipeline: { stage: string; count: number }[];
  }> {
    try {
      const { data: sponsors, error } = await (this.supabase as any)
        .from('marathon_sponsors')
        .select('tier, pipeline_stage, amount_pledged, amount_received')
        .eq('event_id', eventId);

      if (error) {
        logger.error('events/marathon-sponsor', 'Failed to fetch sponsor summary', error);
        throw error;
      }

      const rows = (sponsors ?? []) as {
        tier: string;
        pipeline_stage: string;
        amount_pledged: number;
        amount_received: number;
      }[];

      const total_sponsors = rows.length;
      const total_pledged = rows.reduce((s, r) => s + (r.amount_pledged ?? 0), 0);
      const total_received = rows.reduce((s, r) => s + (r.amount_received ?? 0), 0);

      // By tier
      const tierMap = new Map<string, { count: number; amount: number }>();
      for (const r of rows) {
        const existing = tierMap.get(r.tier);
        if (existing) {
          existing.count++;
          existing.amount += r.amount_pledged ?? 0;
        } else {
          tierMap.set(r.tier, { count: 1, amount: r.amount_pledged ?? 0 });
        }
      }

      // By pipeline stage
      const stageMap = new Map<string, number>();
      for (const r of rows) {
        stageMap.set(r.pipeline_stage, (stageMap.get(r.pipeline_stage) ?? 0) + 1);
      }

      return {
        total_sponsors,
        total_pledged,
        total_received,
        by_tier: Array.from(tierMap.entries()).map(([tier, { count, amount }]) => ({
          tier,
          count,
          amount,
        })),
        by_pipeline: Array.from(stageMap.entries()).map(([stage, count]) => ({
          stage,
          count,
        })),
      };
    } catch (error) {
      logger.error('events/marathon-sponsor', 'Unexpected error in getSponsorSummary', error);
      throw error;
    }
  }
}
