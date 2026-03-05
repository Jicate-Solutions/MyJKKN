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
    const query = this.supabase
      .from('event_checklists')
      .select(
        '*, items:event_checklist_items(*, completion:event_checklist_completions(*))'
      )
      .eq('event_id', eventId)
      .order('order_index', { ascending: true });

    const { data, error } = await (targetRole
      ? query.eq('target_role', targetRole)
      : query);
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

  static async createChecklist(
    eventId: string,
    data: { title: string; phase: ChecklistPhase; target_role: ChecklistTargetRole }
  ): Promise<EventChecklist> {
    // Get max order_index for the event
    const { data: existing } = await this.supabase
      .from('event_checklists')
      .select('order_index')
      .eq('event_id', eventId)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

    const { data: checklist, error } = await this.supabase
      .from('event_checklists')
      .insert({
        event_id: eventId,
        title: data.title,
        phase: data.phase,
        target_role: data.target_role,
        order_index: nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('[startup/checklists] createChecklist failed:', error);
      throw error;
    }
    return checklist as unknown as EventChecklist;
  }

  static async deleteChecklist(checklistId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_checklists')
      .delete()
      .eq('id', checklistId);

    if (error) {
      console.error('[startup/checklists] deleteChecklist failed:', error);
      throw error;
    }
  }

  static async addItem(
    checklistId: string,
    data: { title: string; description?: string; is_required?: boolean }
  ): Promise<void> {
    // Get max order_index for the checklist
    const { data: existing } = await this.supabase
      .from('event_checklist_items')
      .select('order_index')
      .eq('checklist_id', checklistId)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

    const { error } = await this.supabase
      .from('event_checklist_items')
      .insert({
        checklist_id: checklistId,
        title: data.title,
        description: data.description || null,
        is_required: data.is_required ?? false,
        order_index: nextOrder,
      });

    if (error) {
      console.error('[startup/checklists] addItem failed:', error);
      throw error;
    }
  }

  static async deleteItem(itemId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_checklist_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error('[startup/checklists] deleteItem failed:', error);
      throw error;
    }
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
