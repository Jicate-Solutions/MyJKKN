// lib/services/meetings/meeting-agenda-service.ts
//
// Meeting Agenda Engine — generic core service (PR1: manual surface).
// Spec: specs/meeting-agenda-engine-2026-06-21.md (§3 architecture).
//
// SECURITY MODEL (same as NativeSchedulingService / MeetingRoutingService):
//   READ  — getAgenda() may run on a session client; RLS restricts rows to the
//           host (or admin). Safe to call from the booking detail server page.
//   WRITE — addItem / updateItem / deleteItem / moveItem REQUIRE a SERVICE-ROLE
//           client AND an actorProfileId. Each re-verifies, server-side, that
//           the actor IS the booking's host before mutating. There is no client
//           write grant on these tables (no INSERT/UPDATE/DELETE RLS policy), so
//           the server action holding the service-role client is the only writer.
//
// The native meeting tables are not in the generated Supabase types yet, so this
// service takes an untyped SupabaseClient and casts row reads to local types.

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[meeting-agenda]';

// ============================================================================
// TYPES
// ============================================================================

export interface MeetingAgenda {
  id: string;
  booking_id: string;
  host_profile_id: string;
  status: 'draft' | 'live' | 'closed';
  ai_used: boolean;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingAgendaItem {
  id: string;
  agenda_id: string;
  source: 'manual' | 'past_action' | 'approval' | 'kpi' | 'project' | 'ai_narrative';
  title: string;
  body: string | null;
  link_ref: string | null;
  visibility: 'all' | 'host_only' | 'private';
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface AgendaView {
  agenda: MeetingAgenda | null;
  items: MeetingAgendaItem[];
}

export type AgendaError = 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'DB_ERROR';

export interface AgendaResult<T = void> {
  success: boolean;
  data?: T;
  error?: AgendaError;
}

export interface ItemInput {
  title: string;
  body?: string | null;
}

const MAX_TITLE = 300;

// ============================================================================
// SERVICE
// ============================================================================

export class MeetingAgendaService {
  /**
   * Read an agenda + its items for a booking. Session-client safe — RLS keeps
   * this to the host (or admin). Returns { agenda: null, items: [] } when no
   * agenda has been started yet (the common case until the host adds an item).
   */
  static async getAgenda(
    client: SupabaseClient,
    bookingId: string,
  ): Promise<AgendaView> {
    const { data: agenda, error: aErr } = await client
      .from('meeting_agendas')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (aErr) {
      console.error(`${LOG_PREFIX} getAgenda header error:`, aErr.message);
      return { agenda: null, items: [] };
    }
    if (!agenda) return { agenda: null, items: [] };

    const { data: items, error: iErr } = await client
      .from('meeting_agenda_items')
      .select('*')
      .eq('agenda_id', (agenda as MeetingAgenda).id)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (iErr) {
      console.error(`${LOG_PREFIX} getAgenda items error:`, iErr.message);
      return { agenda: agenda as MeetingAgenda, items: [] };
    }

    return { agenda: agenda as MeetingAgenda, items: (items ?? []) as MeetingAgendaItem[] };
  }

  // -- write helpers ---------------------------------------------------------

  /**
   * Verify the actor hosts this booking. Returns the booking's host id on
   * success. SERVICE-ROLE client required (reads bypass RLS so we can compare).
   */
  private static async assertBookingHost(
    service: SupabaseClient,
    bookingId: string,
    actorProfileId: string,
  ): Promise<AgendaResult<{ hostProfileId: string }>> {
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
    return { success: true, data: { hostProfileId: actorProfileId } };
  }

  /** Resolve an item to its parent agenda + host, then verify the actor. */
  private static async assertItemHost(
    service: SupabaseClient,
    itemId: string,
    actorProfileId: string,
  ): Promise<AgendaResult<{ agendaId: string }>> {
    const { data: item, error: iErr } = await service
      .from('meeting_agenda_items')
      .select('id, agenda_id')
      .eq('id', itemId)
      .maybeSingle();

    if (iErr) {
      console.error(`${LOG_PREFIX} assertItemHost item error:`, iErr.message);
      return { success: false, error: 'DB_ERROR' };
    }
    if (!item) return { success: false, error: 'NOT_FOUND' };

    const agendaId = (item as { agenda_id: string }).agenda_id;
    const { data: agenda, error: aErr } = await service
      .from('meeting_agendas')
      .select('id, host_profile_id')
      .eq('id', agendaId)
      .maybeSingle();

    if (aErr) {
      console.error(`${LOG_PREFIX} assertItemHost agenda error:`, aErr.message);
      return { success: false, error: 'DB_ERROR' };
    }
    if (!agenda) return { success: false, error: 'NOT_FOUND' };
    if ((agenda as { host_profile_id: string }).host_profile_id !== actorProfileId) {
      return { success: false, error: 'FORBIDDEN' };
    }
    return { success: true, data: { agendaId } };
  }

  /**
   * Lazily create the agenda header for a booking (one per booking). Idempotent
   * via the booking_id unique constraint — a concurrent create resolves to the
   * existing row. SERVICE-ROLE client; actor must host the booking.
   */
  private static async ensureAgenda(
    service: SupabaseClient,
    bookingId: string,
    actorProfileId: string,
  ): Promise<AgendaResult<{ agendaId: string }>> {
    const existing = await service
      .from('meeting_agendas')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (existing.data) {
      return { success: true, data: { agendaId: (existing.data as { id: string }).id } };
    }

    const { data, error } = await service
      .from('meeting_agendas')
      .insert({ booking_id: bookingId, host_profile_id: actorProfileId })
      .select('id')
      .single();

    if (error) {
      // Lost a create race → the row now exists; fetch it.
      const retry = await service
        .from('meeting_agendas')
        .select('id')
        .eq('booking_id', bookingId)
        .maybeSingle();
      if (retry.data) {
        return { success: true, data: { agendaId: (retry.data as { id: string }).id } };
      }
      console.error(`${LOG_PREFIX} ensureAgenda insert error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true, data: { agendaId: (data as { id: string }).id } };
  }

  // -- write operations (all require service-role + host verification) --------

  /** Add a manual agenda item to a booking's agenda (creating it if needed). */
  static async addItem(
    service: SupabaseClient,
    bookingId: string,
    actorProfileId: string,
    input: ItemInput,
  ): Promise<AgendaResult<{ itemId: string }>> {
    const title = (input.title ?? '').trim();
    if (!title || title.length > MAX_TITLE) {
      return { success: false, error: 'INVALID' };
    }
    const body = input.body?.trim() || null;

    const host = await this.assertBookingHost(service, bookingId, actorProfileId);
    if (!host.success) return { success: false, error: host.error };

    const ensured = await this.ensureAgenda(service, bookingId, actorProfileId);
    if (!ensured.success || !ensured.data) return { success: false, error: ensured.error ?? 'DB_ERROR' };
    const agendaId = ensured.data.agendaId;

    // Next order_index = max + 1 (stable append).
    const { data: last } = await service
      .from('meeting_agenda_items')
      .select('order_index')
      .eq('agenda_id', agendaId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextIndex = last ? (last as { order_index: number }).order_index + 1 : 0;

    const { data, error } = await service
      .from('meeting_agenda_items')
      .insert({
        agenda_id: agendaId,
        source: 'manual',
        title,
        body,
        visibility: 'all',
        order_index: nextIndex,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} addItem insert error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true, data: { itemId: (data as { id: string }).id } };
  }

  /** Edit an item's title/body. */
  static async updateItem(
    service: SupabaseClient,
    itemId: string,
    actorProfileId: string,
    input: ItemInput,
  ): Promise<AgendaResult> {
    const title = (input.title ?? '').trim();
    if (!title || title.length > MAX_TITLE) {
      return { success: false, error: 'INVALID' };
    }
    const body = input.body?.trim() || null;

    const owns = await this.assertItemHost(service, itemId, actorProfileId);
    if (!owns.success) return { success: false, error: owns.error };

    const { error } = await service
      .from('meeting_agenda_items')
      .update({ title, body, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      console.error(`${LOG_PREFIX} updateItem error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true };
  }

  /** Delete an item. */
  static async deleteItem(
    service: SupabaseClient,
    itemId: string,
    actorProfileId: string,
  ): Promise<AgendaResult> {
    const owns = await this.assertItemHost(service, itemId, actorProfileId);
    if (!owns.success) return { success: false, error: owns.error };

    const { error } = await service
      .from('meeting_agenda_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error(`${LOG_PREFIX} deleteItem error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true };
  }

  /**
   * Move an item up or down by swapping order_index with its adjacent sibling.
   * No-op (still success) at the top/bottom edge.
   */
  static async moveItem(
    service: SupabaseClient,
    itemId: string,
    actorProfileId: string,
    direction: 'up' | 'down',
  ): Promise<AgendaResult> {
    const owns = await this.assertItemHost(service, itemId, actorProfileId);
    if (!owns.success || !owns.data) return { success: false, error: owns.error };
    const agendaId = owns.data.agendaId;

    const { data: rows, error } = await service
      .from('meeting_agenda_items')
      .select('id, order_index')
      .eq('agenda_id', agendaId)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`${LOG_PREFIX} moveItem read error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    const list = (rows ?? []) as Array<{ id: string; order_index: number }>;
    const idx = list.findIndex((r) => r.id === itemId);
    if (idx === -1) return { success: false, error: 'NOT_FOUND' };

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return { success: true }; // edge: no-op

    const a = list[idx];
    const b = list[swapIdx];
    // Swap their order_index values. Two targeted updates (small lists; no need
    // for a transaction wrapper at PR1 scale — worst case is a transient
    // out-of-order render fixed on the next move).
    const u1 = await service
      .from('meeting_agenda_items')
      .update({ order_index: b.order_index, updated_at: new Date().toISOString() })
      .eq('id', a.id);
    const u2 = await service
      .from('meeting_agenda_items')
      .update({ order_index: a.order_index, updated_at: new Date().toISOString() })
      .eq('id', b.id);

    if (u1.error || u2.error) {
      console.error(`${LOG_PREFIX} moveItem swap error:`, u1.error?.message ?? u2.error?.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true };
  }
}
