// lib/services/meetings/meeting-action-item-service.ts
//
// Meeting Agenda Engine — PR2: the action-item loop.
// Spec: specs/meeting-agenda-engine-2026-06-21.md (§3 model, §4 PR2).
//
// SECURITY MODEL (identical to MeetingAgendaService — PR1):
//   READ  — listForBooking() / listOpenCarryOver() run on a session client; RLS
//           restricts rows to the host (or admin). Safe from the server page.
//   WRITE — add / update / setStatus / delete REQUIRE a SERVICE-ROLE client AND
//           an actorProfileId, and each re-verifies the actor IS the booking's
//           host before mutating. No client write grant exists on the table.
//
// THE LOOP (PastActions adapter): listOpenCarryOver() finds OPEN action items
// from the host's OTHER bookings with the SAME attendee (matched on
// attendee_email), so last meeting's unfinished items surface on the next one.
// PR2 matches host + attendee_email; PR3 generalizes to multi-attendee/roles.
//
// Native meeting tables are not in the generated Supabase types yet → untyped
// SupabaseClient, casting row reads to local types (same as PR1).

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[meeting-action-items]';
const MAX_ACTION = 500;

// ============================================================================
// TYPES
// ============================================================================

export interface MeetingActionItem {
  id: string;
  booking_id: string;
  host_profile_id: string;
  decision_text: string | null;
  action_text: string;
  owner_label: string | null;
  owner_profile_id: string | null;
  due_date: string | null;
  status: 'open' | 'done';
  created_at: string;
  updated_at: string;
}

/** A carried-over open item, with the prior meeting's context for display. */
export interface CarryOverItem {
  id: string;
  action_text: string;
  decision_text: string | null;
  owner_label: string | null;
  due_date: string | null;
  from_booking_uid: string;
  from_attendee_name: string | null;
  from_meeting_time: string | null;
}

export type ActionItemError = 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'DB_ERROR';

export interface ActionItemResult<T = void> {
  success: boolean;
  data?: T;
  error?: ActionItemError;
}

export interface ActionItemInput {
  action: string;
  decision?: string | null;
  owner?: string | null;
  dueDate?: string | null; // 'YYYY-MM-DD' or null
}

// ============================================================================
// SERVICE
// ============================================================================

export class MeetingActionItemService {
  /** All action items recorded against this booking (newest first). RLS-scoped. */
  static async listForBooking(
    client: SupabaseClient,
    bookingId: string,
  ): Promise<MeetingActionItem[]> {
    const { data, error } = await client
      .from('meeting_action_items')
      .select('*')
      .eq('booking_id', bookingId)
      .order('status', { ascending: true }) // open before done
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`${LOG_PREFIX} listForBooking error:`, error.message);
      return [];
    }
    return (data ?? []) as MeetingActionItem[];
  }

  /**
   * PastActions adapter — OPEN action items from the host's OTHER bookings with
   * the SAME attendee (by email), surfaced onto this meeting. Session client;
   * RLS keeps everything host-scoped. Returns [] when there is no prior history.
   */
  static async listOpenCarryOver(
    client: SupabaseClient,
    bookingId: string,
  ): Promise<CarryOverItem[]> {
    // 1. Resolve this booking's host + attendee.
    const { data: current, error: cErr } = await client
      .from('meeting_bookings')
      .select('id, host_profile_id, attendee_email')
      .eq('id', bookingId)
      .maybeSingle();
    if (cErr || !current) {
      if (cErr) console.error(`${LOG_PREFIX} carryover current booking error:`, cErr.message);
      return [];
    }
    const host = (current as { host_profile_id: string }).host_profile_id;
    const attendee = (current as { attendee_email: string | null }).attendee_email;
    if (!attendee) return []; // no attendee email → nothing to match on

    // 2. Other bookings of this host with the same attendee email.
    const { data: priors, error: pErr } = await client
      .from('meeting_bookings')
      .select('id, uid, attendee_name, start_time')
      .eq('host_profile_id', host)
      .eq('attendee_email', attendee)
      .neq('id', bookingId);
    if (pErr) {
      console.error(`${LOG_PREFIX} carryover priors error:`, pErr.message);
      return [];
    }
    const priorList = (priors ?? []) as Array<{
      id: string; uid: string; attendee_name: string | null; start_time: string | null;
    }>;
    if (priorList.length === 0) return [];
    const byId = new Map(priorList.map((b) => [b.id, b]));

    // 3. Open action items belonging to those prior bookings.
    const { data: items, error: iErr } = await client
      .from('meeting_action_items')
      .select('id, booking_id, action_text, decision_text, owner_label, due_date, created_at')
      .in('booking_id', priorList.map((b) => b.id))
      .eq('status', 'open')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (iErr) {
      console.error(`${LOG_PREFIX} carryover items error:`, iErr.message);
      return [];
    }

    return ((items ?? []) as Array<{
      id: string; booking_id: string; action_text: string; decision_text: string | null;
      owner_label: string | null; due_date: string | null;
    }>).map((it) => {
      const src = byId.get(it.booking_id);
      return {
        id: it.id,
        action_text: it.action_text,
        decision_text: it.decision_text,
        owner_label: it.owner_label,
        due_date: it.due_date,
        from_booking_uid: src?.uid ?? '',
        from_attendee_name: src?.attendee_name ?? null,
        from_meeting_time: src?.start_time ?? null,
      };
    });
  }

  // -- write helpers ---------------------------------------------------------

  /** Verify the actor hosts this booking (service-role; reads bypass RLS). */
  private static async assertBookingHost(
    service: SupabaseClient,
    bookingId: string,
    actorProfileId: string,
  ): Promise<ActionItemResult> {
    const { data, error } = await service
      .from('meeting_bookings')
      .select('id, host_profile_id')
      .eq('id', bookingId)
      .maybeSingle();
    if (error) {
      console.error(`${LOG_PREFIX} assertBookingHost error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    if (!data) return { success: false, error: 'NOT_FOUND' };
    if ((data as { host_profile_id: string }).host_profile_id !== actorProfileId) {
      return { success: false, error: 'FORBIDDEN' };
    }
    return { success: true };
  }

  /** Resolve an item → its host, then verify the actor. */
  private static async assertItemHost(
    service: SupabaseClient,
    itemId: string,
    actorProfileId: string,
  ): Promise<ActionItemResult> {
    const { data, error } = await service
      .from('meeting_action_items')
      .select('id, host_profile_id')
      .eq('id', itemId)
      .maybeSingle();
    if (error) {
      console.error(`${LOG_PREFIX} assertItemHost error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    if (!data) return { success: false, error: 'NOT_FOUND' };
    if ((data as { host_profile_id: string }).host_profile_id !== actorProfileId) {
      return { success: false, error: 'FORBIDDEN' };
    }
    return { success: true };
  }

  private static cleanDue(due?: string | null): string | null {
    if (!due) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null;
  }

  // -- write operations (service-role + host verification) -------------------

  /** Record a new action item against a booking. */
  static async addItem(
    service: SupabaseClient,
    bookingId: string,
    actorProfileId: string,
    input: ActionItemInput,
  ): Promise<ActionItemResult<{ itemId: string }>> {
    const action = (input.action ?? '').trim();
    if (!action || action.length > MAX_ACTION) return { success: false, error: 'INVALID' };

    const host = await this.assertBookingHost(service, bookingId, actorProfileId);
    if (!host.success) return { success: false, error: host.error };

    const { data, error } = await service
      .from('meeting_action_items')
      .insert({
        booking_id: bookingId,
        host_profile_id: actorProfileId,
        action_text: action,
        decision_text: input.decision?.trim() || null,
        owner_label: input.owner?.trim() || null,
        due_date: this.cleanDue(input.dueDate),
        status: 'open',
      })
      .select('id')
      .single();
    if (error) {
      console.error(`${LOG_PREFIX} addItem error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true, data: { itemId: (data as { id: string }).id } };
  }

  /** Edit an item's decision / action / owner / due date. */
  static async updateItem(
    service: SupabaseClient,
    itemId: string,
    actorProfileId: string,
    input: ActionItemInput,
  ): Promise<ActionItemResult> {
    const action = (input.action ?? '').trim();
    if (!action || action.length > MAX_ACTION) return { success: false, error: 'INVALID' };

    const owns = await this.assertItemHost(service, itemId, actorProfileId);
    if (!owns.success) return { success: false, error: owns.error };

    const { error } = await service
      .from('meeting_action_items')
      .update({
        action_text: action,
        decision_text: input.decision?.trim() || null,
        owner_label: input.owner?.trim() || null,
        due_date: this.cleanDue(input.dueDate),
      })
      .eq('id', itemId);
    if (error) {
      console.error(`${LOG_PREFIX} updateItem error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true };
  }

  /** Toggle an item open ↔ done (closing the loop). */
  static async setStatus(
    service: SupabaseClient,
    itemId: string,
    actorProfileId: string,
    status: 'open' | 'done',
  ): Promise<ActionItemResult> {
    const owns = await this.assertItemHost(service, itemId, actorProfileId);
    if (!owns.success) return { success: false, error: owns.error };

    const { error } = await service
      .from('meeting_action_items')
      .update({ status })
      .eq('id', itemId);
    if (error) {
      console.error(`${LOG_PREFIX} setStatus error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true };
  }

  /** Delete an action item. */
  static async deleteItem(
    service: SupabaseClient,
    itemId: string,
    actorProfileId: string,
  ): Promise<ActionItemResult> {
    const owns = await this.assertItemHost(service, itemId, actorProfileId);
    if (!owns.success) return { success: false, error: owns.error };

    const { error } = await service
      .from('meeting_action_items')
      .delete()
      .eq('id', itemId);
    if (error) {
      console.error(`${LOG_PREFIX} deleteItem error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true };
  }
}
