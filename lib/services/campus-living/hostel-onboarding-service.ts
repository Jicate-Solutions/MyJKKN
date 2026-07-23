/**
 * Campus Living — Hosteller Onboarding Service.
 *
 * CRUD for `hostel_onboarding_templates` (reusable per-institution checklists)
 * and `hostel_onboarding_checklists` (per-learner instances).
 *
 * Tables already live on prod (schema probed via information_schema 2026-05-20)
 * — no migrations needed. See `types/campus-living/onboarding.ts` for the
 * column-shape contract.
 *
 * Patterns mirror `hostel-general-settings-service.ts` and
 * `hostel-allocation-service.ts`:
 *   - institution-scoped reads + writes
 *   - .maybeSingle() on optional-row reads
 *   - logger.error on Supabase failures, re-throw to caller
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  computeChecklistStatus,
  type CreateOnboardingChecklistInput,
  type CreateOnboardingTemplateInput,
  type OnboardingChecklist,
  type OnboardingChecklistWithJoins,
  type OnboardingItem,
  type OnboardingStatus,
  type OnboardingTemplate,
  type UpdateOnboardingChecklistInput,
  type UpdateOnboardingTemplateInput,
} from '@/types/campus-living/onboarding';

const LOG_NS = 'campus-living/onboarding';

export class HostelOnboardingService {
  // ── Templates ────────────────────────────────────────────────────────

  /** List templates for an institution (newest first). */
  static async listTemplates(
    institutionId: string | undefined,
    opts: { activeOnly?: boolean } = {},
  ): Promise<OnboardingTemplate[]> {
    if (!institutionId) return [];
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_onboarding_templates')
        .select('*')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false });
      if (opts.activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) {
        logger.error(LOG_NS, 'Failed to list onboarding templates', error);
        throw error;
      }
      return (data ?? []) as OnboardingTemplate[];
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in listTemplates', error);
      throw error;
    }
  }

  /** Fetch a single template by id. */
  static async getTemplate(id: string): Promise<OnboardingTemplate | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_onboarding_templates')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        logger.error(LOG_NS, 'Failed to fetch onboarding template', error);
        throw error;
      }
      return (data as OnboardingTemplate | null) ?? null;
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in getTemplate', error);
      throw error;
    }
  }

  /** Create a new template. */
  static async createTemplate(
    input: CreateOnboardingTemplateInput,
  ): Promise<OnboardingTemplate> {
    try {
      const supabase = createClientSupabaseClient();
      const body = {
        institution_id: input.institution_id,
        name: input.name,
        items: input.items ?? [],
        is_active: input.is_active ?? true,
      };
      const { data, error } = await supabase
        .from('hostel_onboarding_templates')
        .insert(body as any)
        .select()
        .single();
      if (error) {
        logger.error(LOG_NS, 'Failed to create onboarding template', error);
        throw error;
      }
      return data as OnboardingTemplate;
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in createTemplate', error);
      throw error;
    }
  }

  /** Update a template by id. */
  static async updateTemplate(
    id: string,
    updates: UpdateOnboardingTemplateInput,
  ): Promise<OnboardingTemplate> {
    try {
      const supabase = createClientSupabaseClient();
      const body: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('hostel_onboarding_templates')
        .update(body as any)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error(LOG_NS, 'Failed to update onboarding template', error);
        throw error;
      }
      return data as OnboardingTemplate;
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in updateTemplate', error);
      throw error;
    }
  }

  /** Delete a template by id. */
  static async deleteTemplate(id: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_onboarding_templates')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error(LOG_NS, 'Failed to delete onboarding template', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in deleteTemplate', error);
      throw error;
    }
  }

  // ── Checklists ───────────────────────────────────────────────────────

  /**
   * List checklists for an institution, optionally filtered by status.
   * Joins learner profile + minimal allocation context.
   */
  static async listChecklists(
    institutionId: string | undefined,
    opts: { status?: OnboardingStatus | 'all'; learnerId?: string } = {},
  ): Promise<OnboardingChecklistWithJoins[]> {
    if (!institutionId) return [];
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_onboarding_checklists')
        .select(
          '*, learner:profiles!hostel_onboarding_checklists_learner_id_fkey(id, full_name, email), allocation:hostel_allocations!hostel_onboarding_checklists_allocation_id_fkey(id, learner_id, block_id, room_id, bed_id)',
        )
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false });
      if (opts.status && opts.status !== 'all') {
        query = query.eq('status', opts.status);
      }
      if (opts.learnerId) {
        query = query.eq('learner_id', opts.learnerId);
      }
      const { data, error } = await query;
      if (error) {
        // Fallback: profiles join uses a known FK name; if the schema renamed
        // it the join will fail. Retry without joins so the list still loads.
        if (error.code === 'PGRST200' || error.message?.includes('foreign key')) {
          logger.dev(
            LOG_NS,
            'Falling back to no-join checklist list (FK name mismatch)',
          );
          const retry = await supabase
            .from('hostel_onboarding_checklists')
            .select('*')
            .eq('institution_id', institutionId)
            .order('created_at', { ascending: false });
          if (retry.error) {
            logger.error(LOG_NS, 'Fallback list also failed', retry.error);
            throw retry.error;
          }
          return (retry.data ?? []) as OnboardingChecklistWithJoins[];
        }
        logger.error(LOG_NS, 'Failed to list onboarding checklists', error);
        throw error;
      }
      return (data ?? []) as OnboardingChecklistWithJoins[];
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in listChecklists', error);
      throw error;
    }
  }

  /** Fetch a single checklist by id. */
  static async getChecklist(id: string): Promise<OnboardingChecklist | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_onboarding_checklists')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        logger.error(LOG_NS, 'Failed to fetch onboarding checklist', error);
        throw error;
      }
      return (data as OnboardingChecklist | null) ?? null;
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in getChecklist', error);
      throw error;
    }
  }

  /**
   * Create a checklist for a learner+allocation. If `items` is empty, the
   * checklist starts blank; callers usually copy from a template first.
   */
  static async createChecklist(
    input: CreateOnboardingChecklistInput,
  ): Promise<OnboardingChecklist> {
    try {
      const supabase = createClientSupabaseClient();
      const status = computeChecklistStatus(input.items ?? []);
      const body = {
        institution_id: input.institution_id,
        allocation_id: input.allocation_id,
        learner_id: input.learner_id,
        template_id: input.template_id ?? null,
        items: input.items ?? [],
        notes: input.notes ?? null,
        status,
        started_at:
          status === 'in_progress' || status === 'completed'
            ? new Date().toISOString()
            : null,
      };
      const { data, error } = await supabase
        .from('hostel_onboarding_checklists')
        .insert(body as any)
        .select()
        .single();
      if (error) {
        logger.error(LOG_NS, 'Failed to create onboarding checklist', error);
        throw error;
      }
      return data as OnboardingChecklist;
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in createChecklist', error);
      throw error;
    }
  }

  /**
   * Update a checklist. When `items` is provided, status + timestamps are
   * derived automatically (not_started → in_progress on first tick;
   * in_progress → completed when all ticked).
   */
  static async updateChecklist(
    id: string,
    updates: UpdateOnboardingChecklistInput,
  ): Promise<OnboardingChecklist> {
    try {
      const supabase = createClientSupabaseClient();
      const body: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      // Derive status/started_at/completed_at when items mutate.
      if (updates.items) {
        const status = updates.status ?? computeChecklistStatus(updates.items);
        body.status = status;
        if (status === 'in_progress' && updates.started_at === undefined) {
          body.started_at = body.started_at ?? new Date().toISOString();
        }
        if (status === 'completed' && updates.completed_at === undefined) {
          body.completed_at = new Date().toISOString();
        }
        if (status !== 'completed') {
          // Clear completed_at if we walked status back.
          body.completed_at = null;
          body.completed_by = updates.completed_by ?? null;
        }
      }

      const { data, error } = await supabase
        .from('hostel_onboarding_checklists')
        .update(body as any)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error(LOG_NS, 'Failed to update onboarding checklist', error);
        throw error;
      }
      return data as OnboardingChecklist;
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in updateChecklist', error);
      throw error;
    }
  }

  /** Toggle a single checklist item by key. Recomputes status server-side. */
  static async toggleChecklistItem(
    id: string,
    itemKey: string,
    completed: boolean,
    completedBy: string | null,
  ): Promise<OnboardingChecklist> {
    const current = await this.getChecklist(id);
    if (!current) throw new Error(`Checklist ${id} not found`);
    const now = new Date().toISOString();
    const items: OnboardingItem[] = (current.items ?? []).map((item) =>
      item.key === itemKey
        ? {
            ...item,
            completed,
            completed_by: completed ? completedBy : null,
            completed_at: completed ? now : null,
          }
        : item,
    );
    return this.updateChecklist(id, {
      items,
      completed_by: completedBy,
    });
  }

  /** Delete a checklist by id. */
  static async deleteChecklist(id: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_onboarding_checklists')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error(LOG_NS, 'Failed to delete onboarding checklist', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG_NS, 'Unexpected error in deleteChecklist', error);
      throw error;
    }
  }
}
