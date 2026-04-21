// lib/services/admission/stall-service.ts
// BUG-003146: Service layer for Expo Event Stalls.
// Follows MyJKKN admission service patterns (static methods, client singleton, console.error + throw).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ExpoEventStall,
  CreateExpoStallInput,
  UpdateExpoStallInput,
} from '@/types/admission';

export class StallService {
  /**
   * List all stalls for a given expo event, with assigned staff display name.
   */
  static async listByEvent(expoEventId: string): Promise<ExpoEventStall[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_event_stalls')
      .select(
        `*,
        assigned_staff:profiles!expo_event_stalls_assigned_staff_id_fkey(id, full_name)`
      )
      .eq('expo_event_id', expoEventId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[admission/expos/stalls] Failed to list stalls:', error);
      throw new Error(error.message);
    }

    return (data || []) as ExpoEventStall[];
  }

  /**
   * Fetch a single stall by ID.
   */
  static async getById(id: string): Promise<ExpoEventStall> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_event_stalls')
      .select(
        `*,
        assigned_staff:profiles!expo_event_stalls_assigned_staff_id_fkey(id, full_name)`
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admission/expos/stalls] Failed to get stall:', error);
      throw new Error(error.message);
    }

    return data as ExpoEventStall;
  }

  /**
   * Create a new stall for an expo event.
   */
  static async create(input: CreateExpoStallInput): Promise<ExpoEventStall> {
    const supabase = createClientSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      expo_event_id: input.expo_event_id,
      institution_id: input.institution_id,
      stall_name: input.stall_name,
      assigned_staff_id: input.assigned_staff_id ?? null,
      total_expenses: input.total_expenses ?? 0,
      photos: input.photos ?? [],
      promotional_materials: input.promotional_materials ?? [],
      notes: input.notes ?? null,
      created_by: user?.id ?? null,
    };

    const { data, error } = await (supabase as any)
      .from('expo_event_stalls')
      .insert(payload)
      .select(
        `*,
        assigned_staff:profiles!expo_event_stalls_assigned_staff_id_fkey(id, full_name)`
      )
      .single();

    if (error) {
      console.error('[admission/expos/stalls] Failed to create stall:', error);
      throw new Error(error.message);
    }

    return data as ExpoEventStall;
  }

  /**
   * Update an existing stall. updated_at is handled by DB trigger.
   */
  static async update(id: string, input: UpdateExpoStallInput): Promise<ExpoEventStall> {
    const supabase = createClientSupabaseClient();

    const patch: Record<string, unknown> = {};
    if (input.stall_name !== undefined) patch.stall_name = input.stall_name;
    if (input.institution_id !== undefined) patch.institution_id = input.institution_id;
    if (input.assigned_staff_id !== undefined) patch.assigned_staff_id = input.assigned_staff_id;
    if (input.total_expenses !== undefined) patch.total_expenses = input.total_expenses;
    if (input.photos !== undefined) patch.photos = input.photos;
    if (input.promotional_materials !== undefined) {
      patch.promotional_materials = input.promotional_materials;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const { data, error } = await (supabase as any)
      .from('expo_event_stalls')
      .update(patch)
      .eq('id', id)
      .select(
        `*,
        assigned_staff:profiles!expo_event_stalls_assigned_staff_id_fkey(id, full_name)`
      )
      .single();

    if (error) {
      console.error('[admission/expos/stalls] Failed to update stall:', error);
      throw new Error(error.message);
    }

    return data as ExpoEventStall;
  }

  /**
   * Delete a stall by ID. admission_leads.stall_id FK is ON DELETE SET NULL,
   * so any attributed leads will simply have stall_id cleared.
   */
  static async delete(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('expo_event_stalls')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/expos/stalls] Failed to delete stall:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Count how many admission_leads have been attributed to a given stall.
   * Used to surface lead-attribution metrics on the stalls UI.
   */
  static async getLeadCountByStall(stallId: string): Promise<number> {
    const supabase = createClientSupabaseClient();

    const { count, error } = await (supabase as any)
      .from('admission_leads')
      .select('id', { count: 'exact', head: true })
      .eq('stall_id', stallId);

    if (error) {
      console.error('[admission/expos/stalls] Failed to count leads:', error);
      return 0;
    }

    return count ?? 0;
  }
}
