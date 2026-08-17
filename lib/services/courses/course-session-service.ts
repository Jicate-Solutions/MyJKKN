import { BaseService } from '@/lib/services/base-service';
import { ReservationService } from '@/lib/services/reservation/reservation-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  CourseSession,
  CourseSessionSaveResult,
  CreateCourseSessionDto,
  UpdateCourseSessionDto,
  VenueHoldRefusal,
} from '@/types/courses';

/**
 * EVERY embed names its FK constraint explicitly. `course_sessions` and
 * `resource_reservations` reference EACH OTHER — `course_sessions.reservation_id`
 * points at reservations, and `resource_reservations.course_session_id` (added in
 * Phase 1) points back at sessions. A bare `reservation:resource_reservations(...)`
 * is therefore ambiguous and PostgREST refuses it. The design spec's §3.2 note
 * only established that the new column does not collide with `event_id`/
 * `session_id` on the reservations side; it did not consider the reverse edge.
 *
 * Left joins throughout: a session with no room, no internal trainer, or no hold
 * is the normal state while a course is being planned. `!inner` would drop
 * exactly those rows and the schedule would look empty.
 */
const SELECT = `
  *,
  venue_resource:resources!course_sessions_venue_resource_id_fkey(id, name),
  trainer:profiles!course_sessions_trainer_profile_id_fkey(id, full_name),
  reservation:resource_reservations!course_sessions_reservation_id_fkey(id, status, start_time, end_time)
`;

/** Nullable columns where '' from a form must become NULL — the four text/uuid
 *  columns Postgres would either store as an empty string or reject with 22P02. */
const NULLABLE_FIELDS = new Set([
  'title', 'trainer_profile_id', 'trainer_name', 'venue_resource_id', 'venue_text',
  'session_no',
]);

interface RoomRow {
  name: string | null;
  institution_id: string | null;
  booking_type: string | null;
  is_reservable: boolean | null;
  caretaker_user_id: string | null;
  caretaker_user_ids: string[] | null;
}

interface HoldOutcome {
  held: boolean;
  reservationId?: string;
  reason?: VenueHoldRefusal;
  message?: string;
  awaitingApproval?: boolean;
}

export class CourseSessionService extends BaseService {
  // ── reads ──────────────────────────────────────────────────────────────────

  /** RLS gates the rows (courses.view + role_has_institution_access), so there is
   *  no institution filter here. Cancelled sessions are INCLUDED — a cancelled
   *  sitting is schedule history the admin needs to see, not a deleted row. */
  static async listByCourse(courseEventId: string) {
    const { data, error } = await this.supabase
      .from('course_sessions')
      .select(SELECT)
      .eq('course_event_id', courseEventId)
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as CourseSession[];
  }

  static async getById(id: string) {
    const { data, error } = await this.supabase
      .from('course_sessions').select(SELECT).eq('id', id).single();
    if (error) throw error;
    return data as unknown as CourseSession;
  }

  // ── time ───────────────────────────────────────────────────────────────────

  /**
   * A session is a `date` plus two `time` columns; a reservation is two
   * `timestamptz`. `new Date('2026-09-05T09:00')` parses as LOCAL wall time —
   * which is what the admin typed — and toISOString() converts to UTC for
   * storage. Handing Postgres the naive string instead shifts every hold by the
   * session's UTC offset (5h30m in this deployment). Same conversion, and the
   * same reason, as buildDaySlots in the events venue layer.
   */
  private static toIsoWindow(sessionDate: string, startTime: string, endTime: string) {
    const start = new Date(`${sessionDate}T${startTime}`);
    const end = new Date(`${sessionDate}T${endTime}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end <= start) return null;
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }

  // ── venue policy ───────────────────────────────────────────────────────────
  // No booking logic lives here. ReservationService is the ONE spine — it owns
  // availability, the resource_reservations write and the approval chain. This
  // section only decides the courses-specific approval POLICY, mirroring
  // lib/services/events/venue/event-venue.ts so the two modules refuse the same
  // things for the same reasons.

  /** Caretaker ids (single + array columns), de-duped, as approver records. */
  private static caretakerApprovers(room: RoomRow) {
    const ids = new Set<string>();
    if (room.caretaker_user_id) ids.add(room.caretaker_user_id);
    for (const id of room.caretaker_user_ids ?? []) if (id) ids.add(id);
    return [...ids].map((user_id) => ({ user_id, level: 1 }));
  }

  /**
   * Try to hold `resourceId` for one session. Never throws — a refusal is a
   * returned reason, because a session whose room was busy is still a session
   * the admin meant to schedule.
   */
  private static async holdVenue(args: {
    resourceId: string;
    courseSessionId: string;
    courseInstitutionId: string | null;
    userId: string;
    purpose: string;
    startIso: string;
    endIso: string;
  }): Promise<HoldOutcome> {
    const { data: room, error } = await this.supabase
      .from('resources')
      .select('name, institution_id, booking_type, is_reservable, caretaker_user_id, caretaker_user_ids')
      .eq('id', args.resourceId)
      .maybeSingle();

    if (error || !room) {
      return { held: false, reason: 'error', message: 'Room not found' };
    }

    const r = room as unknown as RoomRow;
    if (r.is_reservable === false) return { held: false, reason: 'not_reservable' };
    if (r.booking_type === 'walk_in') return { held: false, reason: 'walk_in' };

    const sameInstitution =
      !!r.institution_id && !!args.courseInstitutionId
        && r.institution_id === args.courseInstitutionId;
    const approvalMode: 'auto' | 'require' = sameInstitution ? 'auto' : 'require';
    const approvers = sameInstitution ? [] : this.caretakerApprovers(r);

    // A room belonging to another college with NO resolvable approver would
    // produce a 'pending' hold nobody can ever approve — a stuck reservation
    // plus a false promise that someone is looking at it. Refuse honestly.
    // (Caretaker ids are profiles.id == auth.uid(), which is what the approval
    // RPC checks — the same reasoning event-venue.ts records.)
    if (!sameInstitution && approvers.length === 0) {
      return {
        held: false,
        reason: 'no_approver',
        message: 'This room belongs to another college but has no approver set to release it.',
      };
    }

    try {
      const reservation = await ReservationService.createReservation(
        {
          resource_id: args.resourceId,
          purpose: args.purpose,
          start_time: args.startIso,
          end_time: args.endIso,
          quantity: 1,
          // ONLY course_session_id. resource_reservations_single_owner_check is
          // num_nonnulls(event_id, session_id, course_session_id) <= 1, so also
          // setting event_id or session_id here would be a 23514.
          course_session_id: args.courseSessionId,
          approvalMode,
          approvers,
        },
        args.userId,
      );
      return {
        held: true,
        reservationId: reservation.id,
        awaitingApproval: !sameInstitution,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not hold the room';
      logger.warn('courses/sessions', 'holdVenue failed', {
        resourceId: args.resourceId,
        courseSessionId: args.courseSessionId,
        msg: message,
      });
      // createReservation throws on an availability clash — translate that to
      // 'taken' so the UI can say the room is busy rather than "error".
      const reason: VenueHoldRefusal =
        /not available|already|held/i.test(message) ? 'taken' : 'error';
      return { held: false, reason, message };
    }
  }

  /** Best-effort release. Never throws — the caller is already handling a
   *  failure, and a rollback that throws would mask the original cause. */
  private static async releaseHold(reservationId: string, userId: string, why: string) {
    try {
      await ReservationService.cancelReservation(
        { reservation_id: reservationId, user_id: userId, cancellation_reason: why },
        userId,
      );
    } catch (e) {
      logger.warn('courses/sessions', 'release hold failed', {
        reservationId,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── writes ─────────────────────────────────────────────────────────────────

  /**
   * THE ORDER IS FORCED, not a preference. course_sessions.reservation_id and
   * resource_reservations.course_session_id are FKs to each other, so neither
   * row can name the other before it exists:
   *
   *   1. insert the session with reservation_id NULL
   *   2. create the reservation carrying course_session_id
   *   3. write the reservation's id back onto the session
   *
   * These are three round trips across two subsystems and CANNOT be one
   * transaction — this service writes through PostgREST while ReservationService
   * uses its own client. So failures are COMPENSATED, not rolled back:
   *   step 2 fails -> keep the session, report why the room was not held
   *   step 3 fails -> release the reservation from step 2, so no orphan hold
   *                   sits on a room with nothing pointing at it
   */
  static async create(dto: CreateCourseSessionDto, userId: string): Promise<CourseSessionSaveResult> {
    // institution_id is resolved from the course, never taken from the caller —
    // the same rule fn_save_course_package enforces for packages.
    const { data: course, error: courseError } = await this.supabase
      .from('course_events')
      .select('institution_id, title')
      .eq('id', dto.course_event_id)
      .single();

    if (courseError) throw courseError;

    const payload: any = this.nullifyBlanks({
      ...dto,
      institution_id: (course as any).institution_id,
    });

    const { data: created, error } = await this.supabase
      .from('course_sessions').insert(payload).select(SELECT).single();
    if (error) throw error;

    const session = created as unknown as CourseSession;

    const hold = await this.holdIfRequested(session, {
      userId,
      courseInstitutionId: (course as any).institution_id,
      courseTitle: (course as any).title,
    });

    return this.applyHold(session, hold, userId);
  }

  /**
   * A time or room change must MOVE the hold, not leave the old one behind. The
   * old reservation is released and a new one made rather than mutating the
   * existing row's times, because an in-place edit would skip
   * ReservationService.checkAvailability and could double-book the new window.
   *
   * A hold left on a room the session has moved out of is the expensive failure
   * here: the hall reads as occupied to everyone else, forever.
   */
  static async update(
    id: string,
    dto: UpdateCourseSessionDto,
    userId: string,
  ): Promise<CourseSessionSaveResult> {
    const before = await this.getById(id);

    const { data: updated, error } = await this.supabase
      .from('course_sessions')
      .update(this.nullifyBlanks(dto) as any)
      .eq('id', id)
      .select(SELECT)
      .single();

    // Under RLS a blocked UPDATE matches zero rows and returns NO error, so
    // .single() surfaces it as PGRST116 rather than a silent success.
    if (error) throw error;
    const session = updated as unknown as CourseSession;

    const windowMoved =
      before.session_date !== session.session_date ||
      before.start_time !== session.start_time ||
      before.end_time !== session.end_time;
    const roomChanged = before.venue_resource_id !== session.venue_resource_id;

    if (!windowMoved && !roomChanged) {
      return { session, held: Boolean(session.reservation_id) };
    }

    if (before.reservation_id) {
      await this.releaseHold(
        before.reservation_id,
        userId,
        'The course session moved to a different time or room.',
      );
      await this.supabase
        .from('course_sessions')
        .update({ reservation_id: null } as any)
        .eq('id', id);
      session.reservation_id = null;
    }

    const { data: course } = await this.supabase
      .from('course_events')
      .select('institution_id, title')
      .eq('id', session.course_event_id)
      .single();

    const hold = await this.holdIfRequested(session, {
      userId,
      courseInstitutionId: (course as any)?.institution_id ?? null,
      courseTitle: (course as any)?.title ?? 'Course',
    });

    return this.applyHold(session, hold, userId);
  }

  /**
   * Cancelling a sitting MUST release its room. A cancelled session that still
   * occupies the hall is the most expensive bug this module can ship — the room
   * reads as busy to every other booker with no visible reason why.
   */
  static async cancel(id: string, userId: string) {
    const session = await this.getById(id);

    if (session.reservation_id) {
      await this.releaseHold(
        session.reservation_id,
        userId,
        'The course session was cancelled.',
      );
    }

    const { data, error } = await this.supabase
      .from('course_sessions')
      .update({ is_cancelled: true, reservation_id: null } as any)
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'The session was not cancelled — it no longer exists, or you lack permission to change it.',
      );
    }
  }

  /** Hard delete. Releases the hold first for the same reason cancel() does —
   *  deleting the row would otherwise strand the reservation with a dangling
   *  course_session_id (the FK is ON DELETE SET NULL, so it survives as an
   *  unattributable hold). */
  static async remove(id: string, userId: string) {
    const session = await this.getById(id);

    if (session.reservation_id) {
      await this.releaseHold(
        session.reservation_id,
        userId,
        'The course session was deleted.',
      );
    }

    const { data, error } = await this.supabase
      .from('course_sessions').delete().eq('id', id).select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'The session was not deleted — it no longer exists, or you lack permission to delete it.',
      );
    }
  }

  // ── shared write helpers ───────────────────────────────────────────────────

  private static async holdIfRequested(
    session: CourseSession,
    ctx: { userId: string; courseInstitutionId: string | null; courseTitle: string },
  ): Promise<HoldOutcome> {
    if (!session.venue_resource_id) return { held: false, reason: 'no_venue' };

    const window = this.toIsoWindow(
      session.session_date,
      session.start_time,
      session.end_time,
    );
    if (!window) return { held: false, reason: 'error', message: 'Invalid session times' };

    const label = session.title
      ? `${ctx.courseTitle} — ${session.title}`
      : session.session_no
        ? `${ctx.courseTitle} — session ${session.session_no}`
        : ctx.courseTitle;

    return this.holdVenue({
      resourceId: session.venue_resource_id,
      courseSessionId: session.id,
      courseInstitutionId: ctx.courseInstitutionId,
      userId: ctx.userId,
      purpose: label,
      startIso: window.startIso,
      endIso: window.endIso,
    });
  }

  /** Step 3 of the cycle, plus its compensation. */
  private static async applyHold(
    session: CourseSession,
    hold: HoldOutcome,
    userId: string,
  ): Promise<CourseSessionSaveResult> {
    if (!hold.held || !hold.reservationId) {
      return {
        session,
        held: false,
        reason: hold.reason,
        message: hold.message,
      };
    }

    const { data, error } = await this.supabase
      .from('course_sessions')
      .update({ reservation_id: hold.reservationId } as any)
      .eq('id', session.id)
      .select('id');

    if (error || !data || data.length === 0) {
      // The hold exists but nothing points at it. Give the room back rather
      // than leaving a reservation no screen in this module can find.
      await this.releaseHold(
        hold.reservationId,
        userId,
        'Rolled back — the session could not record its reservation.',
      );
      return {
        session,
        held: false,
        reason: 'error',
        message: 'The room was held but could not be linked to the session, so it was released.',
      };
    }

    return {
      session: { ...session, reservation_id: hold.reservationId },
      held: true,
      awaitingApproval: hold.awaitingApproval,
    };
  }

  /** Rewrites '' and undefined to null for the nullable columns, and ONLY for
   *  keys already present — never adds one, so a Partial update cannot wipe a
   *  field the user did not touch. Same contract as CourseEventService's. */
  private static nullifyBlanks<T extends Record<string, any>>(dto: T): T {
    const out: any = { ...dto };
    for (const key of Object.keys(out)) {
      if (NULLABLE_FIELDS.has(key) && (out[key] === '' || out[key] === undefined)) {
        out[key] = null;
      }
    }
    return out;
  }
}
