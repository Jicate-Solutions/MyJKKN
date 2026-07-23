// lib/services/events/shared/event-sponsor-service.ts
// Shared Sponsorship CRM service — pipeline management, deliverables, activity log.
// Promoted from marathon-sponsor-service (Events Platform Promotion PR1, 2026-06-23): works for
// ANY event type now, reading the renamed event_sponsors(+children) tables. The marathon path
// re-exports this as MarathonSponsorService for backward-compat.
// Types still live in @/types/events-marathon (structurally generic — no marathon-specific field);
// a later cleanup PR may rename them. Created (original): 2026-04-07.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MarathonSponsor,
  MarathonSponsorDeliverable,
  MarathonSponsorActivityLog,
  SponsorPipelineStage,
  CreateMarathonSponsorDto,
} from '@/types/events-marathon';

const MOD = 'events/sponsor';

export class EventSponsorService {
  private static supabase = createClientSupabaseClient();

  // --- Reads ---------------------------------------------------------------

  /** List all sponsors for an event (with deliverable counts). */
  static async getSponsors(eventId: string): Promise<MarathonSponsor[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_sponsors')
        .select(`
          *,
          deliverables:event_sponsor_deliverables(id, status)
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error(MOD, 'Failed to fetch sponsors', error);
        throw error;
      }
      return (data as unknown as MarathonSponsor[]) ?? [];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getSponsors', error);
      throw error;
    }
  }

  /** Fetch a single sponsor with full deliverables list and activity log. */
  static async getSponsor(id: string): Promise<MarathonSponsor | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_sponsors')
        .select(`
          *,
          deliverables:event_sponsor_deliverables(*),
          activity_log:event_sponsor_activity_log(*)
        `)
        .eq('id', id)
        .order('created_at', { referencedTable: 'event_sponsor_activity_log', ascending: false })
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        logger.error(MOD, 'Failed to fetch sponsor', { id, error });
        throw error;
      }
      return data as unknown as MarathonSponsor;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getSponsor', error);
      throw error;
    }
  }

  // --- Writes --------------------------------------------------------------

  /** Create a new sponsor. */
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
        .from('event_sponsors')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) {
        logger.error(MOD, 'Failed to create sponsor', error);
        throw error;
      }
      logger.info(MOD, 'Sponsor created', { eventId: dto.event_id, company: dto.company_name });
      return data as unknown as MarathonSponsor;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in createSponsor', error);
      throw error;
    }
  }

  /** Update sponsor fields. */
  static async updateSponsor(id: string, dto: Partial<MarathonSponsor>): Promise<MarathonSponsor> {
    try {
      const { deliverables: _d, activity_log: _a, ...updatePayload } = dto as any;
      const { data, error } = await (this.supabase as any)
        .from('event_sponsors')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error(MOD, 'Failed to update sponsor', { id, error });
        throw error;
      }
      return data as unknown as MarathonSponsor;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in updateSponsor', error);
      throw error;
    }
  }

  /** Delete a sponsor (cascades deliverables / activity log via DB constraints). */
  static async deleteSponsor(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('event_sponsors')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error(MOD, 'Failed to delete sponsor', { id, error });
        throw error;
      }
      logger.info(MOD, 'Sponsor deleted', { id });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in deleteSponsor', error);
      throw error;
    }
  }

  // --- Pipeline stage ------------------------------------------------------

  /** Move a sponsor to a new pipeline stage (Kanban column change). */
  static async movePipelineStage(
    id: string,
    newStage: SponsorPipelineStage
  ): Promise<MarathonSponsor> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_sponsors')
        .update({ pipeline_stage: newStage })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error(MOD, 'Failed to move pipeline stage', { id, newStage, error });
        throw error;
      }
      logger.info(MOD, 'Pipeline stage moved', { id, newStage });
      return data as unknown as MarathonSponsor;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in movePipelineStage', error);
      throw error;
    }
  }

  // --- Deliverables --------------------------------------------------------

  /** Add a deliverable to a sponsor. */
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
        .from('event_sponsor_deliverables')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) {
        logger.error(MOD, 'Failed to add deliverable', { sponsorId, error });
        throw error;
      }
      return data as unknown as MarathonSponsorDeliverable;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in addDeliverable', error);
      throw error;
    }
  }

  /** Update a deliverable. */
  static async updateDeliverable(
    id: string,
    dto: Partial<MarathonSponsorDeliverable>
  ): Promise<MarathonSponsorDeliverable> {
    try {
      const updatePayload: Record<string, unknown> = { ...dto };
      if (dto.status === 'completed' && !dto.completed_at) {
        updatePayload.completed_at = new Date().toISOString();
      }

      const { data, error } = await (this.supabase as any)
        .from('event_sponsor_deliverables')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error(MOD, 'Failed to update deliverable', { id, error });
        throw error;
      }
      return data as unknown as MarathonSponsorDeliverable;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in updateDeliverable', error);
      throw error;
    }
  }

  /** Delete a deliverable. */
  static async deleteDeliverable(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('event_sponsor_deliverables')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error(MOD, 'Failed to delete deliverable', { id, error });
        throw error;
      }
    } catch (error) {
      logger.error(MOD, 'Unexpected error in deleteDeliverable', error);
      throw error;
    }
  }

  // --- Activity log --------------------------------------------------------

  /** Log an interaction with a sponsor (call, email, meeting, payment, note). */
  static async logActivity(
    sponsorId: string,
    dto: { activity_type: string; description: string; performed_by?: string }
  ): Promise<MarathonSponsorActivityLog> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_sponsor_activity_log')
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
        logger.error(MOD, 'Failed to log activity', { sponsorId, error });
        throw error;
      }
      return data as unknown as MarathonSponsorActivityLog;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in logActivity', error);
      throw error;
    }
  }

  // --- Summary -------------------------------------------------------------

  /** Aggregated sponsor summary for an event's dashboard. */
  static async getSponsorSummary(eventId: string): Promise<{
    total_sponsors: number;
    total_pledged: number;
    total_received: number;
    by_tier: { tier: string; count: number; amount: number }[];
    by_pipeline: { stage: string; count: number }[];
  }> {
    try {
      const { data: sponsors, error } = await (this.supabase as any)
        .from('event_sponsors')
        .select('tier, pipeline_stage, amount_pledged, amount_received')
        .eq('event_id', eventId);

      if (error) {
        logger.error(MOD, 'Failed to fetch sponsor summary', error);
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
        by_pipeline: Array.from(stageMap.entries()).map(([stage, count]) => ({ stage, count })),
      };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getSponsorSummary', error);
      throw error;
    }
  }
}
