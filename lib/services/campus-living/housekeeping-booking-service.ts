import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import { CL_LIVE_ALLOCATION_STATUSES } from './roster-statuses';
import { formatHoldDate } from './housekeeping-rules';
import { sendNotification } from '@/lib/services/notification/notification-service';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '@/types/notification';
import type { MyAllocation } from '@/types/campus-living/housekeeping';
import type {
  AssignResult,
  BookResult,
  BookingBoardRow,
  BookingDetail,
  BookingPerson,
  BookingStatus,
  BookingPhoto,
  BookingReschedule,
  BookingRescheduleWithActor,
  CancelResult,
  CleaningBooking,
  CleaningFeedback,
  PhotoPhase,
  RescheduleBookingDto,
  RescheduleResult,
  SlotGridResult,
} from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-bookings';

/** Shared row shaping for the two list reads, so they cannot drift apart. */
function toBoardRow(row: any): BookingBoardRow {
  const photos = (row.photos ?? []) as Array<{ phase: PhotoPhase }>;
  const feedback = (row.feedback ?? []) as Array<{ rating: number }>;
  // A phase can hold several photos, so the booleans are derived from the counts
  // rather than measured separately — they cannot then disagree.
  const beforeCount = photos.filter((p) => p.phase === 'before').length;
  const afterCount = photos.filter((p) => p.phase === 'after').length;
  return {
    ...(row as CleaningBooking),
    room_number: row.room?.room_number ?? null,
    block_name: row.block?.name ?? null,
    has_before_photo: beforeCount > 0,
    has_after_photo: afterCount > 0,
    before_photo_count: beforeCount,
    after_photo_count: afterCount,
    feedback_count: feedback.length,
    average_rating:
      feedback.length > 0
        ? Math.round((feedback.reduce((s, f) => s + f.rating, 0) / feedback.length) * 10) / 10
        : null,
  };
}

export class HousekeepingBookingService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  /**
   * The caller's own live allocation — the room the learner surface books for.
   *
   * Reads hostel_allocations directly: the Student role holds
   * campus_living.allocations.view_own, and that policy branch is
   * `learner_id = auth.uid()`. That works because
   * hostel_allocations.learner_id IS a profiles.id despite the column name.
   *
   * Returns null when the caller has no live allocation (a dayscholar, or a
   * learner who has vacated), which the page renders as "you have no room"
   * rather than an error.
   */
  static async getMyAllocation(): Promise<MyAllocation | null> {
    try {
      const { data: auth } = await this.supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return null;

      const { data, error } = await (this.supabase as any)
        .from('hostel_allocations')
        .select('id, room_id, block_id, institution_id, status, room:hostel_rooms(room_number, category_id)')
        .eq('learner_id', uid)
        .in('status', CL_LIVE_ALLOCATION_STATUSES)
        .order('allocation_date', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error(LOG, 'Failed to read my allocation', error);
        throw error;
      }
      if (!data) return null;

      return {
        allocation_id: data.id,
        room_id: data.room_id,
        block_id: data.block_id,
        institution_id: data.institution_id,
        room_number: data.room?.room_number ?? null,
        category_id: data.room?.category_id ?? null,
      };
    } catch (error) {
      logger.error(LOG, `Unexpected error in getMyAllocation: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * The admin bookings table: every booking the caller can see, paged.
   *
   * Deliberately NOT date-scoped: this answers "show me the bookings", and the
   * date range is one more optional filter the table drives. Every filter is
   * optional and RLS still decides the rows, so omitting institutionId means
   * "every institution I can reach", never "every institution".
   *
   * Search covers the columns a warden actually knows a booking by: the room
   * number, the block, the cleaner and the type. Room and block live on embedded
   * tables, so they cannot go in a PostgREST .or() over this table — they are
   * resolved to ids first and folded into the same .or() as id lists.
   */
  static async listBookings(params: {
    page: number;
    limit: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    institutionId?: string;
    blockId?: string;
    status?: BookingStatus;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ rows: BookingBoardRow[]; total: number }> {
    try {
      const { page, limit } = params;
      const from = (Math.max(1, page) - 1) * limit;

      let query = (this.supabase as any)
        .from('hostel_cleaning_bookings')
        .select(
          `*,
           room:hostel_rooms(room_number),
           block:hostel_blocks(name),
           photos:hostel_cleaning_booking_photos(phase),
           feedback:hostel_cleaning_feedback(rating)`,
          { count: 'exact' },
        );

      query = this.applyBookingFilters(query, params);

      const term = params.search?.trim();
      if (term) {
        // Multi-word search needs one .or() per token; a single .or() with a
        // space matches only the literal phrase.
        const roomIds = await this.roomIdsMatching(term);
        const blockIds = await this.blockIdsMatching(term);
        const clauses = [`cleaner_name.ilike.%${term}%`, `type_name.ilike.%${term}%`];
        if (roomIds.length) clauses.push(`room_id.in.(${roomIds.join(',')})`);
        if (blockIds.length) clauses.push(`block_id.in.(${blockIds.join(',')})`);
        query = query.or(clauses.join(','));
      }

      const sortBy = params.sortBy || 'booking_date';
      const ascending = (params.sortOrder ?? 'desc') === 'asc';
      query = query
        .order(sortBy, { ascending })
        .order('slot_start', { ascending: true })
        .range(from, from + limit - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error(LOG, 'Failed to list bookings', error);
        throw error;
      }
      return { rows: (data ?? []).map(toBoardRow), total: count ?? 0 };
    } catch (error) {
      logger.error(LOG, `Unexpected error in listBookings: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Status totals for the WHOLE filtered set, not the visible page.
   *
   * The summary tiles are the reason this exists: counted off the page they
   * would say "3 unassigned" while page 2 held forty more. Reads only the status
   * column, and `head: true` per status would be five round trips — one select
   * of a single narrow column and a tally in JS is cheaper and exact.
   */
  static async countBookingsByStatus(filters: {
    dateFrom?: string;
    dateTo?: string;
    institutionId?: string;
    blockId?: string;
    status?: BookingStatus;
  }): Promise<Record<BookingStatus, number>> {
    const empty: Record<BookingStatus, number> = {
      booked: 0, assigned: 0, in_progress: 0, awaiting_feedback: 0, completed: 0, cancelled: 0,
    };
    try {
      let query = (this.supabase as any)
        .from('hostel_cleaning_bookings')
        .select('status');
      query = this.applyBookingFilters(query, filters);

      const { data, error } = await query;
      if (error) {
        logger.error(LOG, 'Failed to count bookings by status', error);
        throw error;
      }
      const out = { ...empty };
      for (const r of (data ?? []) as Array<{ status: BookingStatus }>) {
        if (r.status in out) out[r.status] += 1;
      }
      return out;
    } catch (error) {
      logger.error(LOG, `Unexpected error in countBookingsByStatus: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Everything behind one booking, for the admin detail dialog.
   *
   * Fetched on demand, one booking at a time, so the extra round trips cost the
   * table nothing. Every lookup is independently optional: a deleted room, a
   * retired type or a learner whose profile has gone comes back null and the
   * dialog renders the rest. That is the whole reason the booking carries
   * snapshot columns — the history survives its references.
   */
  static async getBookingDetail(bookingId: string): Promise<BookingDetail | null> {
    try {
      const { data: row, error } = await (this.supabase as any)
        .from('hostel_cleaning_bookings')
        .select(
          `*,
           room:hostel_rooms(room_number, floor, room_type, capacity, has_attached_bathroom, category_id),
           block:hostel_blocks(name, hostel_type),
           institution:institutions(name),
           photos:hostel_cleaning_booking_photos(phase),
           feedback:hostel_cleaning_feedback(rating)`,
        )
        .eq('id', bookingId)
        .maybeSingle();

      if (error) {
        logger.error(LOG, 'Failed to load booking detail', error);
        throw error;
      }
      if (!row) return null;

      const booking = toBoardRow(row);

      // One profiles read for every person on the booking, not four.
      const personIds = [
        row.learner_id,
        row.assigned_by,
        row.cancelled_by,
        row.waived_by,
      ].filter(Boolean) as string[];

      const [people, categoryName, type, photos, feedback, reschedules] = await Promise.all([
        this.peopleByIds(personIds),
        this.categoryName(row.room?.category_id ?? null),
        this.currentType(row.type_id),
        this.listPhotos(bookingId),
        this.listFeedback(bookingId),
        this.listReschedules(bookingId),
      ]);

      const raterIds = Array.from(new Set(feedback.map((f) => f.learner_id))).filter(Boolean);
      const raters = await this.peopleByIds(raterIds);

      return {
        booking,
        learner: people.get(row.learner_id) ?? null,
        assigned_by: row.assigned_by ? people.get(row.assigned_by) ?? null : null,
        cancelled_by: row.cancelled_by ? people.get(row.cancelled_by) ?? null : null,
        waived_by: row.waived_by ? people.get(row.waived_by) ?? null : null,
        room: row.room
          ? {
              room_number: row.room.room_number ?? null,
              floor: row.room.floor ?? null,
              room_type: row.room.room_type ?? null,
              capacity: row.room.capacity ?? null,
              has_attached_bathroom: row.room.has_attached_bathroom ?? null,
              category_name: categoryName,
            }
          : null,
        block: row.block
          ? { name: row.block.name ?? null, hostel_type: row.block.hostel_type ?? null }
          : null,
        institution_name: row.institution?.name ?? null,
        type,
        photos,
        feedback: feedback.map((f) => ({
          ...f,
          learner_name: raters.get(f.learner_id)?.full_name ?? null,
        })),
        reschedules,
      };
    } catch (error) {
      logger.error(LOG, `Unexpected error in getBookingDetail: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  private static async peopleByIds(ids: string[]): Promise<Map<string, BookingPerson>> {
    const unique = Array.from(new Set(ids)).filter(Boolean);
    if (unique.length === 0) return new Map();
    const { data, error } = await (this.supabase as any)
      .from('profiles')
      .select('id, full_name, email, gender')
      .in('id', unique);
    if (error) {
      // A missing name must not sink the whole dialog.
      logger.warn(LOG, 'Could not resolve people for booking detail', error);
      return new Map();
    }
    return new Map(((data ?? []) as BookingPerson[]).map((p) => [p.id, p]));
  }

  private static async categoryName(categoryId: string | null): Promise<string | null> {
    if (!categoryId) return null;
    const { data } = await (this.supabase as any)
      .from('hostel_categories')
      .select('name')
      .eq('id', categoryId)
      .maybeSingle();
    return (data as { name: string } | null)?.name ?? null;
  }

  /** The type as it stands TODAY — the booking's own snapshot is on the row. */
  private static async currentType(typeId: string): Promise<BookingDetail['type']> {
    const { data } = await (this.supabase as any)
      .from('hostel_cleaning_types')
      .select('description, usage_limit_count, usage_period, is_active')
      .eq('id', typeId)
      .maybeSingle();
    return (data as BookingDetail['type']) ?? null;
  }

  /** The one place the table's filters are translated, so the tiles and the
   *  rows can never disagree about what "the filtered set" means. */
  private static applyBookingFilters(
    query: any,
    f: {
      dateFrom?: string;
      dateTo?: string;
      institutionId?: string;
      blockId?: string;
      status?: BookingStatus;
    },
  ) {
    // ?? not ||: '' would travel as a real UUID and match zero rows.
    if (f.institutionId != null) query = query.eq('institution_id', f.institutionId);
    if (f.blockId != null) query = query.eq('block_id', f.blockId);
    if (f.status != null) query = query.eq('status', f.status);
    if (f.dateFrom) query = query.gte('booking_date', f.dateFrom);
    if (f.dateTo) query = query.lte('booking_date', f.dateTo);
    return query;
  }

  private static async roomIdsMatching(term: string): Promise<string[]> {
    const { data } = await (this.supabase as any)
      .from('hostel_rooms')
      .select('id')
      .ilike('room_number', `%${term}%`)
      .limit(200);
    return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  private static async blockIdsMatching(term: string): Promise<string[]> {
    const { data } = await (this.supabase as any)
      .from('hostel_blocks')
      .select('id')
      .ilike('name', `%${term}%`)
      .limit(200);
    return ((data ?? []) as Array<{ id: string }>).map((b) => b.id);
  }

  /**
   * Every booking for the caller's ROOM — not just ones they booked. RLS scopes
   * this to rooms they are allocated to, which is what lets a roommate see and
   * rate a cleaning someone else booked.
   */
  static async listMyBookings(roomId: string, fromDate?: string): Promise<BookingBoardRow[]> {
    try {
      // Cast for the same TS2589 reason as listBookings.
      let query = (this.supabase as any)
        .from('hostel_cleaning_bookings')
        .select(
          `*,
           room:hostel_rooms(room_number),
           block:hostel_blocks(name),
           photos:hostel_cleaning_booking_photos(phase),
           feedback:hostel_cleaning_feedback(rating)`,
        )
        .eq('room_id', roomId)
        .order('booking_date', { ascending: false })
        .order('slot_start', { ascending: false })
        .limit(50);

      if (fromDate != null) query = query.gte('booking_date', fromDate);

      const { data, error } = await query;
      if (error) {
        logger.error(LOG, 'Failed to load my bookings', error);
        throw error;
      }
      return (data ?? []).map(toBoardRow);
    } catch (error) {
      logger.error(LOG, `Unexpected error in listMyBookings: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async listPhotos(bookingId: string): Promise<BookingPhoto[]> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaning_booking_photos')
        .select('*')
        .eq('booking_id', bookingId)
        .order('uploaded_at', { ascending: true });
      if (error) {
        logger.error(LOG, 'Failed to list booking photos', error);
        throw error;
      }
      return (data ?? []) as BookingPhoto[];
    } catch (error) {
      logger.error(LOG, `Unexpected error in listPhotos: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async listFeedback(bookingId: string): Promise<CleaningFeedback[]> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaning_feedback')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
      if (error) {
        logger.error(LOG, 'Failed to list feedback', error);
        throw error;
      }
      return (data ?? []) as CleaningFeedback[];
    } catch (error) {
      logger.error(LOG, `Unexpected error in listFeedback: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  // ── RPC writes ─────────────────────────────────────────────────────────

  /**
   * The slot grid for a room on a date.
   *
   * excludeBookingId leaves ONE booking out of the capacity count, which is what
   * makes a reschedule possible: a booking otherwise occupies its own grid, so
   * its current slot would read "full" and could never be moved within its day.
   */
  static async getSlots(
    roomId: string,
    typeId: string,
    date: string,
    excludeBookingId?: string,
  ): Promise<SlotGridResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_slots', {
        p_room_id: roomId,
        p_type_id: typeId,
        p_date: date,
        p_exclude_booking_id: excludeBookingId ?? null,
      });
      if (error) {
        logger.error(LOG, 'Failed to load slot grid', error);
        throw error;
      }
      return data as SlotGridResult;
    } catch (error) {
      logger.error(LOG, `Unexpected error in getSlots: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async book(
    typeId: string,
    date: string,
    slotStart: string,
    notes?: string,
  ): Promise<BookResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_book', {
        p_type_id: typeId,
        p_date: date,
        p_slot_start: slotStart,
        p_notes: notes ?? null,
      });
      if (error) {
        logger.error(LOG, 'Failed to book slot', error);
        throw error;
      }
      return data as BookResult;
    } catch (error) {
      logger.error(LOG, `Unexpected error in book: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async cancel(bookingId: string, reason?: string): Promise<CancelResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_cancel', {
        p_booking_id: bookingId,
        p_reason: reason ?? null,
      });
      if (error) {
        logger.error(LOG, 'Failed to cancel booking', error);
        throw error;
      }
      return data as CancelResult;
    } catch (error) {
      logger.error(LOG, `Unexpected error in cancel: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async assign(
    bookingId: string,
    cleanerId: string | null,
    clear = false,
  ): Promise<AssignResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_assign', {
        p_booking_id: bookingId,
        p_cleaner_id: cleanerId,
        p_clear: clear,
      });
      if (error) {
        logger.error(LOG, 'Failed to assign cleaner', error);
        throw error;
      }
      return data as AssignResult;
    } catch (error) {
      logger.error(LOG, `Unexpected error in assign: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Move a booking to a new date/slot, with the reason recorded.
   *
   * Everything is decided inside fn_cl_housekeeping_reschedule: the permission,
   * the status gate, the new slot's availability and whether the cleaner on the
   * booking after the move actually works that day. This only carries the
   * arguments and hands the union back for the hook to narrow.
   */
  static async reschedule(dto: RescheduleBookingDto): Promise<RescheduleResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_reschedule', {
        p_booking_id: dto.bookingId,
        p_date: dto.date,
        p_slot_start: dto.slotStart,
        p_reason_code: dto.reasonCode,
        p_reason_note: dto.reasonNote?.trim() || null,
        // ?? not ||: a cleaner id is either given or absent, and '' would
        // travel as a real uuid parameter.
        p_cleaner_id: dto.cleanerId ?? null,
        p_clear_cleaner: dto.clearCleaner ?? false,
      });
      if (error) {
        logger.error(LOG, 'Failed to reschedule booking', error);
        throw error;
      }
      return data as RescheduleResult;
    } catch (error) {
      logger.error(LOG, `Unexpected error in reschedule: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Every move this booking has made, oldest first.
   *
   * Read on its own rather than as an embed on the booking: RLS on an embedded
   * relation returns NULL rather than an error, so a blocked embed would be
   * indistinguishable from "this booking was never moved".
   */
  static async listReschedules(bookingId: string): Promise<BookingRescheduleWithActor[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('hostel_cleaning_booking_reschedules')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
      if (error) {
        logger.error(LOG, 'Failed to list booking reschedules', error);
        throw error;
      }

      const rows = (data ?? []) as BookingReschedule[];
      if (rows.length === 0) return [];

      const people = await this.peopleByIds(rows.map((r) => r.rescheduled_by));
      return rows.map((r) => ({
        ...r,
        rescheduled_by_name: people.get(r.rescheduled_by)?.full_name ?? null,
      }));
    } catch (error) {
      logger.error(LOG, `Unexpected error in listReschedules: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Tell the room its cleaning has moved.
   *
   * Every CURRENT resident, not just whoever booked it — the room lock means one
   * booking serves them all, and any of them may have planned around the old
   * slot. Best-effort by design: a notification that could not be delivered must
   * never make a completed reschedule look like a failure.
   */
  static async notifyRescheduled(bookingId: string): Promise<void> {
    try {
      const { data: booking, error } = await (this.supabase as any)
        .from('hostel_cleaning_bookings')
        .select('id, room_id, type_name, booking_date, slot_start')
        .eq('id', bookingId)
        .maybeSingle();
      if (error || !booking) {
        logger.warn(LOG, 'Could not load booking for reschedule notification', error);
        return;
      }

      const { data: roommates, error: roomErr } = await (this.supabase as any)
        .from('hostel_allocations')
        .select('learner_id')
        .eq('room_id', booking.room_id)
        .in('status', CL_LIVE_ALLOCATION_STATUSES);
      if (roomErr) {
        logger.warn(LOG, 'Could not load roommates for reschedule notification', roomErr);
        return;
      }

      const userIds = Array.from(
        new Set(((roommates ?? []) as Array<{ learner_id: string }>).map((r) => r.learner_id)),
      );
      if (userIds.length === 0) return;

      await sendNotification({
        user_ids: userIds,
        type: NotificationType.REMINDER,
        category: NotificationCategory.APPROVAL,
        priority: NotificationPriority.NORMAL,
        title: 'Your room cleaning has been moved',
        message: `${booking.type_name} is now on ${formatHoldDate(booking.booking_date)} at ${String(booking.slot_start).slice(0, 5)}. Open Room Cleaning to see why it was moved.`,
        action_url: '/campus-living/my-hostel/housekeeping',
        action_label: 'See the new time',
        metadata: { booking_id: booking.id, booking_date: booking.booking_date } as never,
      });
    } catch (err) {
      logger.error(LOG, `notifyRescheduled failed: ${getErrorMessage(err)}`, err);
    }
  }

  // ── Table writes (RLS-enforced) ────────────────────────────────────────

  /**
   * assigned -> in_progress. The .eq('status', 'assigned') guard makes this
   * idempotent: a repeated call updates zero rows instead of resetting
   * started_at.
   */
  static async startJob(bookingId: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_cleaning_bookings')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', 'assigned');
    if (error) {
      logger.error(LOG, 'Failed to start job', error);
      throw error;
    }
  }

  /**
   * in_progress -> awaiting_feedback. Guarded on the current status so an
   * after-photo can never skip the before-photo step: if the booking is not
   * in_progress, zero rows update and the status stands.
   */
  static async finishJob(bookingId: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_cleaning_bookings')
      .update({ status: 'awaiting_feedback', finished_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', 'in_progress');
    if (error) {
      logger.error(LOG, 'Failed to finish job', error);
      throw error;
    }
  }

  /**
   * Tell every learner in the room that a cleaning is waiting on their rating.
   *
   * Fired when a booking enters awaiting_feedback, so the room hears about it
   * the same evening — BEFORE the attendance hold lands the next morning. A
   * block nobody was warned about is just a mystery to the person hitting it,
   * which is the whole reason this exists.
   *
   * Best-effort by design: the caller must not fail the photo upload because a
   * notification could not be delivered. The hold is still correct either way.
   */
  static async notifyFeedbackPending(bookingId: string): Promise<void> {
    try {
      const { data: booking, error } = await (this.supabase as any)
        .from('hostel_cleaning_bookings')
        .select('id, room_id, type_name, booking_date')
        .eq('id', bookingId)
        .maybeSingle();
      if (error || !booking) {
        logger.warn(LOG, 'Could not load booking for feedback notification', error);
        return;
      }

      // Every CURRENT resident of the room, not just the booker — any of them
      // can rate, and all of them are held.
      const { data: roommates, error: roomErr } = await (this.supabase as any)
        .from('hostel_allocations')
        .select('learner_id')
        .eq('room_id', booking.room_id)
        .in('status', CL_LIVE_ALLOCATION_STATUSES);
      if (roomErr) {
        logger.warn(LOG, 'Could not load roommates for feedback notification', roomErr);
        return;
      }

      const userIds = Array.from(
        new Set(((roommates ?? []) as Array<{ learner_id: string }>).map((r) => r.learner_id)),
      );
      if (userIds.length === 0) return;

      await sendNotification({
        user_ids: userIds,
        type: NotificationType.REMINDER,
        category: NotificationCategory.APPROVAL,
        priority: NotificationPriority.HIGH,
        title: 'Rate your room cleaning',
        message: `${booking.type_name} was completed today. Rate it before midnight — until someone in your room does, hostel attendance is on hold for all of you.`,
        action_url: '/campus-living/my-hostel/housekeeping',
        action_label: 'Rate the cleaning',
        metadata: { booking_id: booking.id, booking_date: booking.booking_date } as never,
      });
    } catch (err) {
      // Never let a notification failure break the cleaning workflow.
      logger.error(LOG, `notifyFeedbackPending failed: ${getErrorMessage(err)}`, err);
    }
  }

  /**
   * The safety valve. A room whose learners have left campus would otherwise be
   * attendance-blocked forever. The reason is mandatory (also a DB CHECK), and
   * waiving does NOT complete the booking — it stays awaiting_feedback so the
   * record still shows that nobody rated it.
   */
  static async waiveHold(bookingId: string, reason: string, waivedBy: string): Promise<void> {
    try {
      const trimmed = reason.trim();
      if (!trimmed) throw new Error('A reason is required to waive a feedback hold.');
      const { error } = await this.supabase
        .from('hostel_cleaning_bookings')
        .update({
          waived_at: new Date().toISOString(),
          waived_by: waivedBy,
          waive_reason: trimmed,
        })
        .eq('id', bookingId);
      if (error) {
        logger.error(LOG, 'Failed to waive feedback hold', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in waiveHold: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Any roommate may rate. The FIRST rating completes the booking, which lifts
   * the attendance hold for everyone in the room. RLS enforces that the rater
   * lives in the room and that the booking is awaiting_feedback.
   */
  static async submitFeedback(args: {
    bookingId: string;
    institutionId: string;
    roomId: string;
    learnerId: string;
    rating: number;
    comment?: string | null;
  }): Promise<void> {
    try {
      const { error } = await this.supabase.from('hostel_cleaning_feedback').insert({
        booking_id: args.bookingId,
        institution_id: args.institutionId,
        room_id: args.roomId,
        learner_id: args.learnerId,
        rating: args.rating,
        comment: args.comment?.trim() || null,
      });
      if (error) {
        logger.error(LOG, 'Failed to submit feedback', error);
        throw error;
      }
      // The booking is moved to 'completed' by t_hk_feedback_completes_booking,
      // NOT from here. This used to run the UPDATE itself and it silently did
      // nothing: a learner has no update policy on hostel_cleaning_bookings, RLS
      // filtered the statement to zero rows, and PostgREST reports that as
      // success. The booking stayed awaiting_feedback, which kept the room
      // locked out of booking anything else. See migration 20260909140000.
    } catch (error) {
      logger.error(LOG, `Unexpected error in submitFeedback: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }
}
