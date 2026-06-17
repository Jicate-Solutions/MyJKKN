// lib/services/meetings/meeting-poll-service.ts
//
// Meeting Polls (Universal Booking M5) — Calendly "Meeting Polls" parity.
// A host proposes several candidate times, invitees vote, the host confirms a
// winner; confirming a winner writes a confirmed row into meeting_bookings.
//
// SECURITY MODEL: admin callers hold an RLS browser/server client — the host
// owns their own polls via the meeting_polls.host_profile_id = auth.uid()
// policy, so every read/write here is naturally row-scoped. Public (anon)
// invitees NEVER reach this service; they go through the two SECURITY DEFINER
// RPCs (fn_get_active_poll / fn_cast_poll_votes) instead.
//
// Booking integrity on confirm: the winning option's time becomes a confirmed
// meeting_bookings row. The gist exclusion constraint mb_no_double_booking is
// the final arbiter — if the host is already booked over that range, the
// insert raises 23P01, surfaced here as { error: 'SLOT_TAKEN' }.
//
// Pattern: NativeSchedulingService (service over the same meeting_* tables).
// Google Calendar event creation for the confirmed booking is a deliberate
// POST-MERGE follow-up owned by the scheduling layer — see NAV-WIRING-polls.md.

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[meeting-polls]';

// ============================================================================
// TYPES
// ============================================================================

export interface PollOptionInput {
  /** ISO instant — candidate start time. */
  start: string;
  /** ISO instant — candidate end time. If omitted, derived from duration. */
  end?: string;
}

export interface CreatePollInput {
  title: string;
  description?: string | null;
  durationMin: number;
  options: PollOptionInput[];
}

export interface PollOption {
  id: string;
  startTime: string;
  endTime: string;
  orderIndex: number;
  voteCount: number;
}

export interface PollSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  durationMin: number;
  status: 'open' | 'closed';
  winningOptionId: string | null;
  bookingId: string | null;
  optionCount: number;
  totalVotes: number;
  createdAt: string;
}

export interface PollDetail extends PollSummary {
  hostProfileId: string;
  options: PollOption[];
}

export type CreatePollResult =
  | { success: true; pollId: string; slug: string }
  | { success: false; error: string };

export type ClosePollResult =
  | { success: true; bookingId: string; bookingUid: string }
  | { success: false; error: 'NOT_FOUND' | 'ALREADY_CLOSED' | 'INVALID_OPTION' | 'SLOT_TAKEN' | 'INTERNAL' };

// ============================================================================
// HELPERS
// ============================================================================

/** URL-safe slug: short, unguessable, link-friendly (mirrors booking uid). */
function generateSlug(): string {
  return crypto.randomBytes(9).toString('base64url'); // 12 chars
}

// ============================================================================
// SERVICE
// ============================================================================

export class MeetingPollService {
  /**
   * Create a poll owned by the given host, with its candidate options.
   * The RLS client must be authenticated as that host (host_profile_id is
   * resolved server-side, never trusted from the client).
   */
  static async createPoll(
    supabase: SupabaseClient,
    hostProfileId: string,
    institutionId: string | null,
    input: CreatePollInput,
  ): Promise<CreatePollResult> {
    const title = input.title?.trim();
    if (!title) return { success: false, error: 'Title is required.' };

    const durationMin = Number(input.durationMin);
    if (!Number.isFinite(durationMin) || durationMin < 1 || durationMin > 1440) {
      return { success: false, error: 'Duration must be between 1 and 1440 minutes.' };
    }

    const options = (input.options ?? []).filter((o) => o && o.start);
    if (options.length < 2) {
      return { success: false, error: 'Add at least two candidate times.' };
    }

    // Build option rows; derive end from duration when not supplied.
    const optionRows = options
      .map((o, i) => {
        const startDate = new Date(o.start);
        if (Number.isNaN(startDate.getTime())) return null;
        const endDate = o.end
          ? new Date(o.end)
          : new Date(startDate.getTime() + durationMin * 60_000);
        if (Number.isNaN(endDate.getTime()) || endDate <= startDate) return null;
        return {
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          order_index: i,
        };
      })
      .filter((r): r is { start_time: string; end_time: string; order_index: number } => r !== null);

    if (optionRows.length < 2) {
      return { success: false, error: 'Add at least two valid candidate times.' };
    }

    // Insert the poll (retry slug once on the rare unique collision).
    let pollId: string | null = null;
    let slug = generateSlug();
    for (let attempt = 0; attempt < 2 && !pollId; attempt++) {
      const { data, error } = await supabase
        .from('meeting_polls')
        .insert({
          host_profile_id: hostProfileId,
          institution_id: institutionId,
          slug,
          title: title.slice(0, 300),
          description: input.description?.trim()?.slice(0, 2000) || null,
          duration_min: durationMin,
          status: 'open',
        })
        .select('id, slug')
        .single();
      if (!error && data) {
        pollId = data.id as string;
        slug = data.slug as string;
        break;
      }
      if (error?.code === '23505') {
        slug = generateSlug(); // slug collision — try once more
        continue;
      }
      console.error(`${LOG_PREFIX} poll insert failed:`, error?.message);
      return { success: false, error: 'Could not create the poll.' };
    }
    if (!pollId) return { success: false, error: 'Could not create the poll.' };

    const { error: optErr } = await supabase
      .from('meeting_poll_options')
      .insert(optionRows.map((r) => ({ ...r, poll_id: pollId })));
    if (optErr) {
      console.error(`${LOG_PREFIX} option insert failed:`, optErr.message);
      // Best-effort cleanup so we never leave an option-less poll.
      await supabase.from('meeting_polls').delete().eq('id', pollId);
      return { success: false, error: 'Could not save the candidate times.' };
    }

    return { success: true, pollId, slug };
  }

  /** Polls owned by a host (admin list view), newest first, with tallies. */
  static async listPollsForHost(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<PollSummary[]> {
    const { data: polls, error } = await supabase
      .from('meeting_polls')
      .select('id, slug, title, description, duration_min, status, winning_option_id, booking_id, created_at')
      .eq('host_profile_id', hostProfileId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(`${LOG_PREFIX} list polls failed:`, error.message);
      return [];
    }
    const pollList = polls ?? [];
    if (pollList.length === 0) return [];

    const pollIds = pollList.map((p) => p.id as string);

    // Counts in bulk (option count + vote count per poll).
    const [{ data: options }, { data: votes }] = await Promise.all([
      supabase.from('meeting_poll_options').select('id, poll_id').in('poll_id', pollIds),
      supabase.from('meeting_poll_votes').select('poll_id').in('poll_id', pollIds),
    ]);

    const optionCountByPoll = new Map<string, number>();
    for (const o of options ?? []) {
      optionCountByPoll.set(o.poll_id as string, (optionCountByPoll.get(o.poll_id as string) ?? 0) + 1);
    }
    const voteCountByPoll = new Map<string, number>();
    for (const v of votes ?? []) {
      voteCountByPoll.set(v.poll_id as string, (voteCountByPoll.get(v.poll_id as string) ?? 0) + 1);
    }

    return pollList.map((p) => ({
      id: p.id as string,
      slug: p.slug as string,
      title: p.title as string,
      description: (p.description as string | null) ?? null,
      durationMin: p.duration_min as number,
      status: p.status as 'open' | 'closed',
      winningOptionId: (p.winning_option_id as string | null) ?? null,
      bookingId: (p.booking_id as string | null) ?? null,
      optionCount: optionCountByPoll.get(p.id as string) ?? 0,
      totalVotes: voteCountByPoll.get(p.id as string) ?? 0,
      createdAt: p.created_at as string,
    }));
  }

  /** One poll with options + per-option vote tallies (admin results view). */
  static async getPollDetail(
    supabase: SupabaseClient,
    pollId: string,
  ): Promise<PollDetail | null> {
    const { data: poll, error } = await supabase
      .from('meeting_polls')
      .select(
        'id, slug, title, description, duration_min, status, winning_option_id, booking_id, host_profile_id, created_at',
      )
      .eq('id', pollId)
      .maybeSingle();
    if (error || !poll) return null;

    const [{ data: options }, { data: votes }] = await Promise.all([
      supabase
        .from('meeting_poll_options')
        .select('id, start_time, end_time, order_index')
        .eq('poll_id', pollId)
        .order('order_index', { ascending: true }),
      supabase.from('meeting_poll_votes').select('option_id').eq('poll_id', pollId),
    ]);

    const voteCountByOption = new Map<string, number>();
    for (const v of votes ?? []) {
      voteCountByOption.set(v.option_id as string, (voteCountByOption.get(v.option_id as string) ?? 0) + 1);
    }

    const optionList: PollOption[] = (options ?? []).map((o) => ({
      id: o.id as string,
      startTime: o.start_time as string,
      endTime: o.end_time as string,
      orderIndex: o.order_index as number,
      voteCount: voteCountByOption.get(o.id as string) ?? 0,
    }));

    return {
      id: poll.id as string,
      slug: poll.slug as string,
      title: poll.title as string,
      description: (poll.description as string | null) ?? null,
      durationMin: poll.duration_min as number,
      status: poll.status as 'open' | 'closed',
      winningOptionId: (poll.winning_option_id as string | null) ?? null,
      bookingId: (poll.booking_id as string | null) ?? null,
      hostProfileId: poll.host_profile_id as string,
      optionCount: optionList.length,
      totalVotes: (votes ?? []).length,
      createdAt: poll.created_at as string,
      options: optionList,
    };
  }

  /**
   * Confirm a winning option: mark the poll closed, record the winner, and
   * INSERT a confirmed meeting_bookings row for the winning time. The booking
   * is created with the host as both organiser and (placeholder) attendee —
   * the real attendee follow-up (inviting voters, Google event) is owned by
   * the scheduling layer post-merge (see NAV-WIRING-polls.md).
   *
   * Race/integrity: the booking insert respects mb_no_double_booking; a clash
   * with the host's existing schedule raises 23P01 → SLOT_TAKEN and the poll
   * is left OPEN (no winner recorded) so the host can pick another time.
   */
  static async closePoll(
    supabase: SupabaseClient,
    pollId: string,
    winningOptionId: string,
  ): Promise<ClosePollResult> {
    const { data: poll, error } = await supabase
      .from('meeting_polls')
      .select('id, slug, title, status, host_profile_id, institution_id, duration_min')
      .eq('id', pollId)
      .maybeSingle();
    if (error || !poll) return { success: false, error: 'NOT_FOUND' };
    if (poll.status === 'closed') return { success: false, error: 'ALREADY_CLOSED' };

    const { data: option, error: optErr } = await supabase
      .from('meeting_poll_options')
      .select('id, start_time, end_time')
      .eq('id', winningOptionId)
      .eq('poll_id', pollId)
      .maybeSingle();
    if (optErr || !option) return { success: false, error: 'INVALID_OPTION' };

    // Resolve the host's display name for the booking's attendee fields.
    const { data: host } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', poll.host_profile_id)
      .maybeSingle();
    const hostName = (host?.full_name as string | undefined) ?? 'JKKN Host';
    const hostEmail = (host?.email as string | undefined) ?? 'no-reply@jkkn.ac.in';

    const uid = crypto.randomBytes(16).toString('base64url');
    const { data: booking, error: bookErr } = await supabase
      .from('meeting_bookings')
      .insert({
        uid,
        meeting_type_id: null,
        host_profile_id: poll.host_profile_id,
        institution_id: poll.institution_id,
        attendee_name: hostName,
        attendee_email: hostEmail,
        attendee_phone: null,
        answers: { poll_id: poll.id, poll_title: poll.title },
        start_time: option.start_time,
        end_time: option.end_time,
        status: 'confirmed',
        source: 'poll',
      })
      .select('id, uid')
      .single();

    if (bookErr) {
      // 23P01 = exclusion violation: host already booked over the winning time.
      if (bookErr.code === '23P01') return { success: false, error: 'SLOT_TAKEN' };
      console.error(`${LOG_PREFIX} winning-booking insert failed:`, bookErr.message);
      return { success: false, error: 'INTERNAL' };
    }

    const bookingId = booking.id as string;
    const { error: closeErr } = await supabase
      .from('meeting_polls')
      .update({
        status: 'closed',
        winning_option_id: winningOptionId,
        booking_id: bookingId,
      })
      .eq('id', pollId)
      .eq('status', 'open'); // guard a concurrent close
    if (closeErr) {
      console.error(`${LOG_PREFIX} poll close failed:`, closeErr.message);
      // The booking was created; roll it back so we don't strand a confirmed
      // booking against an unclosed poll.
      await supabase.from('meeting_bookings').delete().eq('id', bookingId);
      return { success: false, error: 'INTERNAL' };
    }

    return { success: true, bookingId, bookingUid: booking.uid as string };
  }

  /** Delete a poll the host owns (cascade removes options + votes). */
  static async deletePoll(
    supabase: SupabaseClient,
    pollId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('meeting_polls').delete().eq('id', pollId);
    if (error) {
      console.error(`${LOG_PREFIX} delete poll failed:`, error.message);
      return { success: false, error: 'Could not delete the poll.' };
    }
    return { success: true };
  }
}
