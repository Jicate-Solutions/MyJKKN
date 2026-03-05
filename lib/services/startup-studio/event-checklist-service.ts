// lib/services/startup-studio/event-checklist-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EventChecklist,
  ChecklistPhase,
  ChecklistTargetRole,
} from '@/types/startup-studio';

export class EventChecklistService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getChecklists(
    eventId: string,
    targetRole?: ChecklistTargetRole
  ): Promise<EventChecklist[]> {
    let query = this.supabase
      .from('event_checklists')
      .select(
        '*, items:event_checklist_items(*, completion:event_checklist_completions(*))'
      )
      .eq('event_id', eventId)
      .order('order_index', { ascending: true });

    if (targetRole) {
      query = query.eq('target_role', targetRole);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[startup/checklists] getChecklists failed:', error);
      throw error;
    }
    return (data || []) as unknown as EventChecklist[];
  }

  static async seedChecklists(
    eventId: string,
    checklists: Array<{
      title: string;
      phase: ChecklistPhase;
      target_role: ChecklistTargetRole;
      items: Array<{
        title: string;
        description?: string;
        is_required?: boolean;
      }>;
    }>
  ): Promise<EventChecklist[]> {
    // Insert all checklists first
    const checklistRows = checklists.map((cl, index) => ({
      event_id: eventId,
      title: cl.title,
      phase: cl.phase,
      target_role: cl.target_role,
      order_index: index,
    }));

    const { data: insertedChecklists, error: clError } = await this.supabase
      .from('event_checklists')
      .insert(checklistRows)
      .select();

    if (clError) {
      console.error('[startup/checklists] seedChecklists insert failed:', clError);
      throw clError;
    }

    if (!insertedChecklists || insertedChecklists.length === 0) {
      return [];
    }

    // Build all items with their checklist IDs
    const itemRows: Array<{
      checklist_id: string;
      title: string;
      description: string | null;
      is_required: boolean;
      order_index: number;
    }> = [];

    insertedChecklists.forEach((inserted, clIndex) => {
      const sourceItems = checklists[clIndex].items;
      sourceItems.forEach((item, itemIndex) => {
        itemRows.push({
          checklist_id: inserted.id,
          title: item.title,
          description: item.description || null,
          is_required: item.is_required ?? false,
          order_index: itemIndex,
        });
      });
    });

    if (itemRows.length > 0) {
      const { error: itemError } = await this.supabase
        .from('event_checklist_items')
        .insert(itemRows);

      if (itemError) {
        console.error('[startup/checklists] seedChecklists items insert failed:', itemError);
        throw itemError;
      }
    }

    // Return full checklists with items
    return this.getChecklists(eventId);
  }

  static async completeItem(
    checklistItemId: string,
    userId: string,
    registrationId?: string,
    staffAssignmentId?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('event_checklist_completions')
      .insert({
        checklist_item_id: checklistItemId,
        completed_by: userId,
        registration_id: registrationId || null,
        staff_assignment_id: staffAssignmentId || null,
      });

    if (error) {
      console.error('[startup/checklists] completeItem failed:', error);
      throw error;
    }
  }

  static async uncompleteItem(completionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_checklist_completions')
      .delete()
      .eq('id', completionId);

    if (error) {
      console.error('[startup/checklists] uncompleteItem failed:', error);
      throw error;
    }
  }
}
