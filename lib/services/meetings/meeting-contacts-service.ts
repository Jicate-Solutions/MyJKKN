// lib/services/meetings/meeting-contacts-service.ts
//
// Universal Booking M6 — service layer for "Contacts" (Calendly parity).
//
// A contact is a person who has booked the current host. The roster is DERIVED
// from meeting_bookings (via the SECURITY DEFINER RPC fn_meeting_contacts_for_host,
// migration 20260617001100); meeting_contacts only adds notes + corrected
// name/phone on top.
//
// SECURITY MODEL: every method takes a Supabase client supplied by the caller.
//   * Reads use the RLS / session client (server component or server action) —
//     the RPC self-scopes to auth.uid(), and meeting_contacts RLS scopes rows
//     to the host. No host id is ever passed in from the client.
//   * There is intentionally NO service-role path here: Contacts is a
//     host-private surface, never a public one.
//
// The meeting_bookings + meeting_contacts tables are not in generated types
// (TS2589 class — see feedback_ts2589_untyped_tables_and_strictnull_narrowing),
// so callers pass an untyped SupabaseClient and we keep casts local.

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[meeting-contacts]';

// ============================================================================
// TYPES
// ============================================================================

/** One row in the contacts roster (derived booking stats + host notes). */
export interface MeetingContact {
  email: string;
  displayName: string;
  phone: string | null;
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  firstBookedAt: string | null;
  lastBookedAt: string | null;
  notes: string | null;
  hasNotes: boolean;
}

/** A single booking in a contact's scheduling-activity timeline. */
export interface ContactBooking {
  uid: string;
  meetingTitle: string | null;
  startTime: string;
  endTime: string;
  status: string;
  source: string | null;
}

export interface ContactDetail {
  contact: MeetingContact;
  bookings: ContactBooking[];
}

// Shape returned by the aggregation RPC (snake_case from Postgres).
interface RpcContactRow {
  email: string;
  display_name: string;
  phone: string | null;
  total_bookings: number | string;
  confirmed_bookings: number | string;
  cancelled_bookings: number | string;
  first_booked_at: string | null;
  last_booked_at: string | null;
  notes: string | null;
  has_notes: boolean;
}

function mapRpcRow(r: RpcContactRow): MeetingContact {
  return {
    email: r.email,
    displayName: r.display_name,
    phone: r.phone,
    // bigint comes back as string over the wire — coerce defensively.
    totalBookings: Number(r.total_bookings) || 0,
    confirmedBookings: Number(r.confirmed_bookings) || 0,
    cancelledBookings: Number(r.cancelled_bookings) || 0,
    firstBookedAt: r.first_booked_at,
    lastBookedAt: r.last_booked_at,
    notes: r.notes,
    hasNotes: !!r.has_notes,
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export class MeetingContactsService {
  /**
   * The full contacts roster for the current host: distinct attendees who have
   * booked, with booking counts, first/last booked, and any host notes.
   * Self-scoped server-side via the RPC — no host id argument.
   */
  static async listContacts(supabase: SupabaseClient): Promise<MeetingContact[]> {
    const { data, error } = await supabase.rpc('fn_meeting_contacts_for_host');
    if (error) {
      console.error(`${LOG_PREFIX} listContacts failed:`, error.message);
      return [];
    }
    return ((data as RpcContactRow[] | null) ?? []).map(mapRpcRow);
  }

  /**
   * One contact's detail: their roster row (re-derived from the same RPC so the
   * stats stay consistent) plus the full booking timeline for that email.
   * `email` is matched case-insensitively. Returns null if the email never
   * booked the current host (so the caller can 404 rather than show a blank).
   */
  static async getContactDetail(
    supabase: SupabaseClient,
    email: string,
  ): Promise<ContactDetail | null> {
    const wanted = email.trim().toLowerCase();
    if (!wanted) return null;

    // Roster row (authoritative stats + notes).
    const roster = await this.listContacts(supabase);
    const contact = roster.find((c) => c.email === wanted);
    if (!contact) return null;

    // Booking timeline for this attendee. RLS (mb_host_select) already scopes
    // these rows to the current host, so we only filter on the email.
    //
    // NOTE: we deliberately do NOT use .ilike() here — ilike treats `%` and `_`
    // as LIKE wildcards, and `_` is legal in email local-parts (e.g.
    // first_last@org.com), so an ilike match could pull a DIFFERENT attendee's
    // bookings. Instead we fetch with a broad-but-cheap case-insensitive
    // wildcard-escaped prefix and then match exactly (lowercased) in code.
    const escaped = wanted.replace(/([\\%_])/g, '\\$1');
    const { data: rows, error } = await supabase
      .from('meeting_bookings')
      .select('uid, meeting_type_id, start_time, end_time, status, source, attendee_email')
      .ilike('attendee_email', escaped)
      .order('start_time', { ascending: false })
      .limit(200);

    if (error) {
      console.error(`${LOG_PREFIX} getContactDetail bookings failed:`, error.message);
      return { contact, bookings: [] };
    }

    const bookingRows = ((rows as Array<{
      uid: string;
      meeting_type_id: string | null;
      start_time: string;
      end_time: string;
      status: string;
      source: string | null;
      attendee_email: string;
    }> | null) ?? [])
      // belt-and-braces exact (case-insensitive) match in app code.
      .filter((b) => (b.attendee_email ?? '').toLowerCase() === wanted);

    // Resolve meeting-type titles in one batched read (avoids N queries).
    const typeIds = Array.from(
      new Set(bookingRows.map((b) => b.meeting_type_id).filter((x): x is string => !!x)),
    );
    const titleByType = new Map<string, string>();
    if (typeIds.length) {
      const { data: types } = await supabase
        .from('meeting_types')
        .select('id, title')
        .in('id', typeIds);
      for (const t of (types as Array<{ id: string; title: string }> | null) ?? []) {
        titleByType.set(t.id, t.title);
      }
    }

    const bookings: ContactBooking[] = bookingRows.map((b) => ({
      uid: b.uid,
      meetingTitle: b.meeting_type_id ? titleByType.get(b.meeting_type_id) ?? null : null,
      startTime: b.start_time,
      endTime: b.end_time,
      status: b.status,
      source: b.source,
    }));

    return { contact, bookings };
  }

  /**
   * Upsert the host's private enrichment (notes + optional corrected name/phone)
   * for a contact. host_profile_id is taken from the authenticated session, NOT
   * from a client argument — RLS additionally enforces host_profile_id =
   * auth.uid() on the write. Returns the saved notes on success.
   */
  static async upsertContactNotes(
    supabase: SupabaseClient,
    hostProfileId: string,
    input: { email: string; notes?: string | null; name?: string | null; phone?: string | null },
  ): Promise<{ success: boolean; error?: string }> {
    const email = input.email.trim().toLowerCase();
    if (!email) return { success: false, error: 'INVALID_EMAIL' };

    const payload = {
      host_profile_id: hostProfileId,
      email,
      // empty strings are normalised to null so "has_notes" stays meaningful.
      notes: input.notes?.trim() ? input.notes.trim() : null,
      name: input.name?.trim() ? input.name.trim() : null,
      phone: input.phone?.trim() ? input.phone.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('meeting_contacts')
      .upsert(payload, { onConflict: 'host_profile_id,email' });

    if (error) {
      console.error(`${LOG_PREFIX} upsertContactNotes failed:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  /**
   * The host's public booking handle, used to build the "Share availability"
   * link (/meet/<handle>). Returns null if the host has not opted into a public
   * page yet — the UI then prompts them to set one up.
   */
  static async getHostHandle(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<string | null> {
    const { data, error } = await supabase
      .from('meeting_host_pages')
      .select('handle, is_public')
      .eq('host_profile_id', hostProfileId)
      .maybeSingle();
    if (error) {
      console.error(`${LOG_PREFIX} getHostHandle failed:`, error.message);
      return null;
    }
    const row = data as { handle: string; is_public: boolean } | null;
    if (!row || !row.is_public) return null;
    return row.handle;
  }
}
