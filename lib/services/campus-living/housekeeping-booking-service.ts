import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import { CL_ROSTER_STATUSES } from './roster-statuses';
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
  BookingPhoto,
  CancelResult,
  CleaningBooking,
  CleaningFeedback,
  PhotoPhase,
  SlotGridResult,
} from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-bookings';

/** Shared row shaping for the two list reads, so they cannot drift apart. */
function toBoardRow(row: any): BookingBoardRow {
  const photos = (row.photos ?? []) as Array<{ phase: PhotoPhase }>;
  const feedback = (row.feedback ?? []) as Array<{ rating: number }>;
  return {
    ...(row as CleaningBooking),
    room_number: row.room?.room_number ?? null,
    block_name: row.block?.name ?? null,
    has_before_photo: photos.some((p) => p.phase === 'before'),
    has_after_photo: photos.some((p) => p.phase === 'after'),
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
        .in('status', CL_ROSTER_STATUSES)
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
   * The warden day board. Left joins throughout: an !inner embed would be an
   * INNER JOIN and would silently drop a booking whose room or block row is
   * missing — exactly the bookings a warden most needs to see.
   */
  static async listDayBoard(
    date: string,
    institutionId?: string,
    blockId?: string,
  ): Promise<BookingBoardRow[]> {
    try {
      // Cast the builder: four nested embeds push PostgREST's generated types
      // past TS's instantiation depth limit (TS2589). The shape is asserted by
      // toBoardRow instead.
      let query = (this.supabase as any)
        .from('hostel_cleaning_bookings')
        .select(
          `*,
           room:hostel_rooms(room_number),
           block:hostel_blocks(name),
           photos:hostel_cleaning_booking_photos(phase),
           feedback:hostel_cleaning_feedback(rating)`,
        )
        .eq('booking_date', date)
        .order('slot_start', { ascending: true });

      // ?? not ||: '' would travel as a real UUID and match zero rows.
      if (institutionId != null) query = query.eq('institution_id', institutionId);
      if (blockId != null) query = query.eq('block_id', blockId);

      const { data, error } = await query;
      if (error) {
        logger.error(LOG, 'Failed to load day board', error);
        throw error;
      }
      return (data ?? []).map(toBoardRow);
    } catch (error) {
      logger.error(LOG, `Unexpected error in listDayBoard: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Every booking for the caller's ROOM — not just ones they booked. RLS scopes
   * this to rooms they are allocated to, which is what lets a roommate see and
   * rate a cleaning someone else booked.
   */
  static async listMyBookings(roomId: string, fromDate?: string): Promise<BookingBoardRow[]> {
    try {
      // Cast for the same TS2589 reason as listDayBoard.
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

  static async getSlots(roomId: string, typeId: string, date: string): Promise<SlotGridResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_slots', {
        p_room_id: roomId,
        p_type_id: typeId,
        p_date: date,
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
        .in('status', CL_ROSTER_STATUSES);
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
      const { error: statusErr } = await this.supabase
        .from('hostel_cleaning_bookings')
        .update({ status: 'completed' })
        .eq('id', args.bookingId)
        .eq('status', 'awaiting_feedback');
      if (statusErr) {
        logger.error(LOG, 'Failed to complete booking after feedback', statusErr);
        throw statusErr;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in submitFeedback: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }
}
