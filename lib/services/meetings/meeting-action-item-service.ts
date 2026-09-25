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

// -- My Follow-ups (/meetings/action-items) ----------------------------------
//
// One list of every follow-up a person is on the hook for, across all the
// meetings it came out of. Two readers:
//   • the HOST sees every item from their meetings (Yours / Others / Unassigned)
//   • an OWNER (owner_profile_id) sees the items resolved to them — which the
//     table's SELECT policy (host-only) would otherwise hide from them.
// Read through the SERVICE ROLE with an explicit host-or-owner predicate: that
// predicate IS the access control. A session-client read would be wrong the
// other way too — RLS lets a super admin / admin see every host's items.

/** Which band of the page an item belongs to, from the viewer's side. */
export type FollowUpBand = 'yours' | 'others' | 'unassigned';

export interface FollowUpItem {
  id: string;
  booking_id: string;
  host_profile_id: string;
  action_text: string;
  decision_text: string | null;
  owner_label: string | null;
  owner_profile_id: string | null;
  /** full_name of owner_profile_id, when it resolves. */
  owner_name: string | null;
  due_date: string | null;
  status: 'open' | 'done';
  created_at: string;
  band: FollowUpBand;
}

export interface FollowUpMeetingGroup {
  booking_id: string;
  /** null only if the booking row could not be read back. */
  booking_uid: string | null;
  attendee_name: string | null;
  start_time: string | null;
  /** meeting_bookings.status — cancelled bookings are listed, not hidden. */
  booking_status: string | null;
  meeting_title: string | null;
  /** The viewer hosts this booking → may open /meetings/[uid]. */
  viewer_is_host: boolean;
  items: FollowUpItem[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOLLOW_UP_LIMIT = 500;

/**
 * PostgREST filter for "rows this person hosts OR owns". The id is
 * interpolated into a filter expression, so anything that is not a uuid is
 * refused rather than escaped.
 */
export function buildHostOrOwnerOr(profileId: string): string {
  if (!profileId || !UUID_RE.test(profileId)) {
    throw new Error('buildHostOrOwnerOr requires a uuid profile id');
  }
  return `host_profile_id.eq.${profileId},owner_profile_id.eq.${profileId}`;
}

/** Band for one item, seen by `profileId`. */
export function followUpBand(
  item: { owner_profile_id: string | null },
  profileId: string,
): FollowUpBand {
  if (item.owner_profile_id && item.owner_profile_id === profileId) return 'yours';
  if (item.owner_profile_id) return 'others';
  return 'unassigned';
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

  // -- My Follow-ups ---------------------------------------------------------

  /**
   * Every follow-up `profileId` hosts or owns, grouped by the meeting it came
   * from, newest meeting first. SERVICE-ROLE client; the explicit host-or-owner
   * filter is the access control (see the block comment above FollowUpBand).
   * Cancelled bookings are NOT filtered out — their items are still owed.
   */
  static async listForProfile(
    service: SupabaseClient,
    profileId: string,
    opts: { includeDone?: boolean } = {},
  ): Promise<ActionItemResult<FollowUpMeetingGroup[]>> {
    let hostOrOwner: string;
    try {
      hostOrOwner = buildHostOrOwnerOr(profileId);
    } catch {
      return { success: false, error: 'INVALID' };
    }

    let query = service
      .from('meeting_action_items')
      .select(
        'id, booking_id, host_profile_id, action_text, decision_text, owner_label, owner_profile_id, due_date, status, created_at',
      )
      .or(hostOrOwner);
    if (!opts.includeDone) query = query.eq('status', 'open');
    const { data: itemRows, error: iErr } = await query
      .order('created_at', { ascending: true })
      .limit(FOLLOW_UP_LIMIT);
    if (iErr) {
      console.error(`${LOG_PREFIX} listForProfile items error:`, iErr.message);
      return { success: false, error: 'DB_ERROR' };
    }

    // Defence in depth: never render a row the predicate should have excluded.
    const items = ((itemRows ?? []) as Array<Omit<FollowUpItem, 'owner_name' | 'band'>>).filter(
      (it) => it.host_profile_id === profileId || it.owner_profile_id === profileId,
    );
    if (items.length === 0) return { success: true, data: [] };

    const bookingIds = Array.from(new Set(items.map((it) => it.booking_id)));
    const ownerIds = Array.from(
      new Set(items.map((it) => it.owner_profile_id).filter((v): v is string => !!v)),
    );

    const [bookingsRes, ownersRes] = await Promise.all([
      service
        .from('meeting_bookings')
        .select('id, uid, attendee_name, start_time, status, host_profile_id, meeting_type_id')
        .in('id', bookingIds),
      ownerIds.length
        ? service.from('profiles').select('id, full_name').in('id', ownerIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }>, error: null }),
    ]);
    if (bookingsRes.error) {
      console.error(`${LOG_PREFIX} listForProfile bookings error:`, bookingsRes.error.message);
      return { success: false, error: 'DB_ERROR' };
    }

    const bookings = (bookingsRes.data ?? []) as Array<{
      id: string;
      uid: string;
      attendee_name: string | null;
      start_time: string | null;
      status: string | null;
      host_profile_id: string | null;
      meeting_type_id: string | null;
    }>;
    const bookingById = new Map(bookings.map((b) => [b.id, b]));

    const typeIds = Array.from(
      new Set(bookings.map((b) => b.meeting_type_id).filter((v): v is string => !!v)),
    );
    const typesRes = typeIds.length
      ? await service.from('meeting_types').select('id, title').in('id', typeIds)
      : { data: [] as Array<{ id: string; title: string | null }>, error: null };
    // A missing title is cosmetic — log it, keep the list.
    if (typesRes.error) {
      console.error(`${LOG_PREFIX} listForProfile types error:`, typesRes.error.message);
    }
    const titleById = new Map(
      ((typesRes.data ?? []) as Array<{ id: string; title: string | null }>).map((t) => [
        t.id,
        t.title ?? null,
      ]),
    );
    const ownerNameById = new Map(
      ((ownersRes.data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
        p.id,
        p.full_name ?? null,
      ]),
    );

    const groups = new Map<string, FollowUpMeetingGroup>();
    for (const it of items) {
      let group = groups.get(it.booking_id);
      if (!group) {
        const b = bookingById.get(it.booking_id);
        group = {
          booking_id: it.booking_id,
          booking_uid: b?.uid ?? null,
          attendee_name: b?.attendee_name ?? null,
          start_time: b?.start_time ?? null,
          booking_status: b?.status ?? null,
          meeting_title: b?.meeting_type_id ? (titleById.get(b.meeting_type_id) ?? null) : null,
          viewer_is_host: (b?.host_profile_id ?? it.host_profile_id) === profileId,
          items: [],
        };
        groups.set(it.booking_id, group);
      }
      group.items.push({
        ...it,
        owner_name: it.owner_profile_id ? (ownerNameById.get(it.owner_profile_id) ?? null) : null,
        band: followUpBand(it, profileId),
      });
    }

    const sorted = Array.from(groups.values()).sort((a, b) => {
      // Newest meeting first; a meeting with no start time sinks to the end.
      const ta = a.start_time ? new Date(a.start_time).getTime() : -Infinity;
      const tb = b.start_time ? new Date(b.start_time).getTime() : -Infinity;
      return tb - ta;
    });
    return { success: true, data: sorted };
  }

  /**
   * STATUS-ONLY change (open ↔ done) allowed to the booking's host OR the
   * item's resolved owner — mirrors online_meeting_action_items_owner_update.
   * Deliberately separate from setStatus() (host-only), which the booking page
   * keeps using unchanged. Anyone else → FORBIDDEN.
   */
  static async setStatusAsHostOrOwner(
    service: SupabaseClient,
    itemId: string,
    actorProfileId: string,
    status: 'open' | 'done',
  ): Promise<ActionItemResult> {
    if (status !== 'open' && status !== 'done') return { success: false, error: 'INVALID' };
    if (!itemId || !actorProfileId) return { success: false, error: 'INVALID' };

    const { data, error } = await service
      .from('meeting_action_items')
      .select('id, host_profile_id, owner_profile_id')
      .eq('id', itemId)
      .maybeSingle();
    if (error) {
      console.error(`${LOG_PREFIX} setStatusAsHostOrOwner read error:`, error.message);
      return { success: false, error: 'DB_ERROR' };
    }
    if (!data) return { success: false, error: 'NOT_FOUND' };

    const row = data as { host_profile_id: string; owner_profile_id: string | null };
    const isHost = row.host_profile_id === actorProfileId;
    const isOwner = !!row.owner_profile_id && row.owner_profile_id === actorProfileId;
    if (!isHost && !isOwner) return { success: false, error: 'FORBIDDEN' };

    const { error: uErr } = await service
      .from('meeting_action_items')
      .update({ status })
      .eq('id', itemId);
    if (uErr) {
      console.error(`${LOG_PREFIX} setStatusAsHostOrOwner update error:`, uErr.message);
      return { success: false, error: 'DB_ERROR' };
    }
    return { success: true };
  }
}
