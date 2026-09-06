// lib/services/reservation/reservation-service.ts
// Reservation Service - Handles all reservation operations

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  logActivityForCurrentUser,
  ResourceManagementActivityTemplates,
} from '@/lib/utils/activity-logger-client';
import {
  notifyBookingSubmitted,
  notifyApproversPendingBooking,
  notifyBookingApproved,
  notifyBookingRejected,
} from '@/lib/services/reservation/reservation-notification-service';
import { TimeSlotGeneratorService } from '@/lib/services/resource-management/time-slot-generator-service';
import { CUSTOM_RANGE_MIN_MINUTES } from '@/lib/services/resource-management/default-slots';
import type {
  Reservation,
  CreateReservationDto,
  UpdateReservationDto,
  ReservationFilters,
  AvailabilityCheckDto,
  AvailabilityResult,
  TimeSlot,
  CalendarSlot,
  ReservationStats,
  UserReservationSummary,
  ApproveReservationDto,
  RejectReservationDto,
  CancelReservationDto,
  CheckInDto,
  CheckOutDto,
  SlotConflict
} from '@/types/reservation';

export class ReservationService {
  /**
   * Get all reservations with optional filters
   */
  static async getReservations(
    filters?: ReservationFilters
  ): Promise<Reservation[]> {
    const supabase = createClientSupabaseClient();

    // Use !inner join only when filtering by institution_id so the
    // .eq on the embedded resource column actually constrains rows.
    // Safe because resource_id is NOT NULL on resource_reservations,
    // so !inner cannot silently drop pending-approval rows.
    const resourceSelect = filters?.institution_id
      ? 'resource:resources!inner(id, name, parent_category_id, subcategory_id, institution_id)'
      : 'resource:resources(id, name, parent_category_id, subcategory_id)';

    let query = supabase
      .from('resource_reservations')
      .select(
        `
        *,
        ${resourceSelect},
        user:profiles!resource_reservations_user_id_fkey(id, full_name, email, avatar_url),
        approver:profiles!resource_reservations_approved_by_fkey(id, full_name, email)
      `
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.resource_id) {
      query = query.eq('resource_id', filters.resource_id);
    }

    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.priority) {
      query = query.eq('priority', filters.priority);
    }

    if (filters?.start_date) {
      query = query.gte('start_time', filters.start_date);
    }

    if (filters?.end_date) {
      query = query.lte('end_time', filters.end_date);
    }

    if (filters?.is_recurring !== undefined) {
      query = query.eq('is_recurring', filters.is_recurring);
    }

    if (filters?.institution_id) {
      query = (query as any).eq('resource.institution_id', filters.institution_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching reservations:', error);
      throw error;
    }

    // Type assertion: recurring_config is stored as Json but should be typed as RecurringConfig
    return (data || []) as unknown as Reservation[];
  }

  /**
   * Get a single reservation by ID
   */
  static async getReservation(id: string): Promise<Reservation | null> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('resource_reservations')
      .select(
        `
        *,
        resource:resources(
          id, name, description, parent_category_id, subcategory_id,
          institution_id, department_id, status, booking_config, approval_config
        ),
        user:profiles!resource_reservations_user_id_fkey(id, full_name, email, phone_number, avatar_url),
        approver:profiles!resource_reservations_approved_by_fkey(id, full_name, email),
        checked_in_by_user:profiles!resource_reservations_checked_in_by_fkey(id, full_name),
        checked_out_by_user:profiles!resource_reservations_checked_out_by_fkey(id, full_name),
        cancelled_by_user:profiles!resource_reservations_cancelled_by_fkey(id, full_name)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching reservation:', error);
      throw error;
    }

    // Type assertion: recurring_config is stored as Json but should be typed as RecurringConfig
    return data as unknown as Reservation;
  }

  /** Local YYYY-MM-DD for an ISO instant (matches how generated slots are keyed). */
  private static toLocalDateString(iso: string): string {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Guard a requested booking window.
   *
   * Enforces exactly two things, in this order:
   *
   *  1. REAL INVARIANTS — end after start, and at least CUSTOM_RANGE_MIN_MINUTES
   *     long. True for every caller and every resource.
   *  2. THE RESOURCE OWNER'S OWN POLICY — operating hours, break times and closed
   *     days, but ONLY when an admin actually configured `time_slot_config` on
   *     this resource. A window nobody set is not a rule to book by.
   *
   * What it deliberately does NOT enforce is the 30-minute grid. That is the
   * Resource Management picker's UI granularity — its inputs carry
   * `step={CUSTOM_RANGE_STEP_MINUTES * 60}` and it runs validateCustomRange
   * client-side before it ever reaches this spine, so here it was pure
   * redundancy for the picker and a trap for everyone else. The events module
   * became a second caller five days after this guard was written and holds a
   * room for organizer-chosen hours typed into a plain <input type="time">:
   * 09:45–15:45 is a perfectly ordinary workshop and was being refused with
   * "Start and end times must align to 30-minute steps" AFTER the event row had
   * already been written, demoting the room to "… (not reserved)". Nothing
   * downstream needs the grid — the only time rule on `resource_reservations` is
   * CHECK (end_time > start_time), and conflict detection is a plain timestamp
   * overlap test.
   *
   * Likewise DEFAULT_TIME_SLOT_CONFIG is no longer substituted for an absent
   * config. Its 09:00–17:30 window exists to OFFER default chips (see
   * generateSlotsForDate) for the 542 of 552 resources nobody has configured;
   * enforcing it as policy refused every legitimate evening programme.
   *
   * Throws with a human-readable reason.
   */
  private static validateBookingRange(
    bookingConfig: any,
    resourceId: string,
    startTime: string,
    endTime: string
  ): void {
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (!(end.getTime() > start.getTime())) {
      throw new Error('End time must be after start time');
    }
    if ((end.getTime() - start.getTime()) / 60000 < CUSTOM_RANGE_MIN_MINUTES) {
      throw new Error(`Booking must be at least ${CUSTOM_RANGE_MIN_MINUTES} minutes long`);
    }

    const timeConfig = bookingConfig?.time_slot_config;
    if (!timeConfig) return;

    const bookingDate = this.toLocalDateString(startTime);

    // An exact match on a configured slot is valid by construction.
    const generated = TimeSlotGeneratorService.generateSlotsForDate(
      timeConfig,
      bookingDate,
      resourceId
    );
    const matchesSlot = generated.some(
      (s) => s.start_time === startTime && s.end_time === endTime
    );
    if (matchesSlot) return;

    // Otherwise hold the range to the hours/breaks/closed days the admin set.
    const check = TimeSlotGeneratorService.validateTimeSlot(
      timeConfig,
      startTime,
      endTime,
      bookingDate
    );
    if (!check.valid) {
      throw new Error(check.reason || 'Invalid booking time range');
    }
  }

  /**
   * Create a new reservation
   */
  static async createReservation(
    dto: CreateReservationDto,
    userId: string
  ): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    // First, check availability
    const availability = await this.checkAvailability({
      resource_id: dto.resource_id,
      start_time: dto.start_time,
      end_time: dto.end_time,
      quantity: dto.quantity ?? 1
    });

    if (!availability.is_available) {
      throw new Error(
        availability.message ||
          'Resource is not available for the selected time'
      );
    }

    // Get resource to check approval requirements
    const { data: resource } = await supabase
      .from('resources')
      .select('approval_config, booking_config')
      .eq('id', dto.resource_id)
      .single();

    // Reject out-of-bounds custom time ranges before inserting. Booked-by-slot
    // selections (default chips / admin slots) pass through untouched.
    this.validateBookingRange(
      (resource as any)?.booking_config,
      dto.resource_id,
      dto.start_time,
      dto.end_time
    );

    // Determine initial status: caller override (booking spine) wins, else the
    // resource's own approval_config rule. 'auto' = approve now (e.g. an event
    // booking a same-college room); 'require' = force pending + seed approvers.
    const approvalMode = dto.approvalMode ?? 'config';
    const requiresApproval =
      approvalMode === 'require'
        ? true
        : approvalMode === 'auto'
          ? false
          : (resource as any)?.approval_config?.enabled || false;
    const initialStatus = requiresApproval ? 'pending' : 'approved';

    // Approvers to seed/notify: caller override (e.g. the cross-college room's
    // caretaker) else the resource's own configured chain.
    const approversToSeed: { user_id: string; level?: number }[] =
      dto.approvers ?? (resource as any)?.approval_config?.approvers ?? [];

    const reservationData = {
      resource_id: dto.resource_id,
      user_id: userId,
      purpose: dto.purpose,
      start_time: dto.start_time,
      end_time: dto.end_time,
      quantity: dto.quantity || 1,
      priority: dto.priority || 1,
      notes: dto.notes,
      attachments: dto.attachments || [],
      is_recurring: dto.is_recurring || false,
      recurring_config: dto.recurring_config,
      status: initialStatus,
      approved_at: requiresApproval ? null : new Date().toISOString(),
      // Booking-spine links — only set when the caller provides them.
      // These are an ALLOW-LIST, not a passthrough: a link column absent from
      // this list is silently dropped before it ever reaches PostgREST. That is
      // exactly what happened to course_session_id between Phase 1 (which added
      // the column) and Phase 2c (which added the line below) — course venue
      // holds would have looked successful and linked to nothing.
      ...(dto.event_id ? { event_id: dto.event_id } : {}),
      ...(dto.session_id ? { session_id: dto.session_id } : {}),
      ...(dto.bundle_id ? { bundle_id: dto.bundle_id } : {}),
      // resource_reservations_single_owner_check is
      // num_nonnulls(event_id, session_id, course_session_id) <= 1 — a COURSE
      // hold passes course_session_id and NEITHER event_id nor session_id.
      // Setting two of the three is a 23514, not a richer link.
      ...(dto.course_session_id ? { course_session_id: dto.course_session_id } : {}),
      ...(dto.session_label ? { session_label: dto.session_label } : {})
    };

    const { data, error } = await (supabase
      .from('resource_reservations') as any)
      .insert(reservationData)
      .select(
        `
        *,
        resource:resources(id, name),
        user:profiles!resource_reservations_user_id_fkey(id, full_name, email)
      `
      )
      .single();

    if (error) {
      console.error('Error creating reservation:', error);
      throw error;
    }

    // If approval is required, create approval records (caller-supplied chain
    // when given, e.g. a cross-college room's caretaker; else the resource's own).
    if (requiresApproval && approversToSeed.length > 0) {
      await this.createApprovalRecords((data as any).id, approversToSeed);
    }

    // Update resource usage count
    await this.incrementResourceUsage(dto.resource_id);

    const reservation = data as Reservation;
    const resourceName = (reservation as any).resource?.name || '';

    // Fire-and-forget notifications — never block the booking return path.
    if (requiresApproval) {
      const requesterName = (reservation as any).user?.full_name || 'A user';
      const approverIds: string[] = approversToSeed
        .map((a) => a.user_id)
        .filter(Boolean);
      void notifyBookingSubmitted(reservation, resourceName).catch(console.error);
      void notifyApproversPendingBooking(
        approverIds,
        reservation,
        resourceName,
        requesterName
      ).catch(console.error);
    } else {
      void notifyBookingApproved(reservation, resourceName).catch(console.error);
    }

    const tpl = ResourceManagementActivityTemplates.reservationCreated(
      resourceName,
      reservation.start_time
    );
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: reservation.id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        reservation_id: reservation.id,
        resource_id: reservation.resource_id,
      },
      institutionId: (reservation as any).institution_id,
    });

    return reservation;
  }

  /**
   * Update an existing reservation
   */
  static async updateReservation(
    id: string,
    dto: UpdateReservationDto
  ): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    // If time is being changed, check availability
    if (dto.start_time || dto.end_time) {
      const existing = await this.getReservation(id);
      if (!existing) throw new Error('Reservation not found');

      const availability = await this.checkAvailability({
        resource_id: existing.resource_id,
        start_time: dto.start_time || existing.start_time,
        end_time: dto.end_time || existing.end_time,
        exclude_reservation_id: id
      });

      if (!availability.is_available) {
        throw new Error(
          availability.message ||
            'Resource is not available for the selected time'
        );
      }

      const { data: res } = await supabase
        .from('resources')
        .select('booking_config')
        .eq('id', existing.resource_id)
        .single();
      this.validateBookingRange(
        (res as any)?.booking_config,
        existing.resource_id,
        dto.start_time || existing.start_time,
        dto.end_time || existing.end_time
      );
    }

    const { data, error } = await (supabase
      .from('resource_reservations') as any)
      .update({
        ...dto,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(
        `
        *,
        resource:resources(id, name),
        user:profiles!resource_reservations_user_id_fkey(id, full_name, email)
      `
      )
      .single();

    if (error) {
      console.error('Error updating reservation:', error);
      throw error;
    }

    const reservation = data as Reservation;
    const resourceName = (reservation as any).resource?.name || '';
    const tpl = ResourceManagementActivityTemplates.reservationUpdated(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: reservation.id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        reservation_id: reservation.id,
        resource_id: reservation.resource_id,
      },
      institutionId: (reservation as any).institution_id,
    });

    return reservation;
  }

  /**
   * Delete a reservation
   */
  static async deleteReservation(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Fetch reservation first to capture resource_id and resource name for logging
    const existing = await this.getReservation(id);

    const { error } = await supabase
      .from('resource_reservations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting reservation:', error);
      throw error;
    }

    if (existing) {
      const resourceName = (existing as any).resource?.name || '';
      const tpl = ResourceManagementActivityTemplates.reservationDeleted(resourceName);
      await logActivityForCurrentUser({
        actionType: tpl.actionType,
        resourceType: tpl.resourceType,
        resourceId: existing.id,
        resourceName,
        description: tpl.description,
        metadata: {
          sub_type: tpl.sub_type,
          reservation_id: existing.id,
          resource_id: existing.resource_id,
        },
        institutionId: (existing as any).institution_id,
      });
    }
  }

  /**
   * Check if a resource is available for a given time slot
   */
  static async checkAvailability(
    dto: AvailabilityCheckDto
  ): Promise<AvailabilityResult> {
    const supabase = createClientSupabaseClient();

    // Holder rows for overlapping pending/approved reservations (SECURITY DEFINER RPC).
    const { data: conflicts, error } = await supabase.rpc(
      'fn_resource_slot_conflicts',
      {
        p_resource_id: dto.resource_id,
        p_start: dto.start_time,
        p_end: dto.end_time,
        p_exclude_id: dto.exclude_reservation_id ?? null
      }
    );

    if (error) {
      console.error('Error checking availability:', error);
      throw error;
    }

    const holders = (conflicts ?? []) as SlotConflict[];

    // Capacity = resources.initial_stock_quantity (NULL ⇒ unlimited).
    const { data: resource, error: resourceError } = await supabase
      .from('resources')
      .select('initial_stock_quantity')
      .eq('id', dto.resource_id)
      .single();
    if (resourceError || !resource) {
      throw new Error('Resource not found');
    }

    const capacity = (resource as any)?.initial_stock_quantity as number | null;
    const requested = dto.quantity ?? 1;
    const committed = holders.reduce((sum, h) => sum + (h.quantity ?? 0), 0);

    const is_available =
      capacity == null || committed + requested <= capacity;

    let message = 'Resource is available';
    if (!is_available) {
      const first = holders[0];
      const who = first?.full_name || 'another user';
      const role = first?.designation ? ` (${first.designation})` : '';
      message = `Already held by ${who}${role}. Only ${Math.max(
        (capacity ?? 0) - committed,
        0
      )} unit(s) free for this window — choose another slot or contact the requester.`;
    }

    return {
      is_available,
      conflicting_reservations: is_available ? undefined : holders,
      message
    };
  }

  /**
   * Get available time slots for a resource on a specific date
   */
  static async getAvailableSlots(
    resourceId: string,
    date: string
  ): Promise<TimeSlot[]> {
    const supabase = createClientSupabaseClient();

    // Get resource booking configuration
    const { data: resource } = await supabase
      .from('resources')
      .select('booking_config, status, initial_stock_quantity')
      .eq('id', resourceId)
      .single();

    if (!resource) {
      throw new Error('Resource not found');
    }

    if (
      (resource as any).status === 'maintenance' ||
      (resource as any).status === 'out_of_order'
    ) {
      return [];
    }

    // Import date-availability service (TimeSlotGeneratorService uses static top-level import)
    const { DateAvailabilityService } = await import(
      '@/lib/services/resource-management/date-availability-service'
    );

    const bookingConfig = (resource as any).booking_config as any;

    // Step 1: Check if date is available using DateAvailabilityService
    const dateConfig = bookingConfig?.date_availability;
    if (dateConfig && !DateAvailabilityService.isDateAvailable(dateConfig, date)) {
      return []; // No slots if date unavailable
    }

    // Step 2: Generate slots using TimeSlotGeneratorService
    const timeConfig = bookingConfig?.time_slot_config;
    const generatedSlots = TimeSlotGeneratorService.generateSlotsForDate(
      timeConfig,
      date,
      resourceId
    );

    // Step 3: Get existing reservations for the date
    // Compute the user-local day window expressed in UTC so the query bounds
    // line up with how slots are stored. Hardcoding `T00:00:00Z` would query
    // a UTC day, missing late-evening local-time reservations in any
    // east-of-UTC zone (e.g. IST 11pm = next-UTC-day 17:30 UTC).
    const startOfDay = new Date(`${date}T00:00:00`).toISOString();
    const endOfDay = new Date(`${date}T23:59:59`).toISOString();

    const { data: holders, error: slotError } = await supabase.rpc('fn_resource_slot_conflicts', {
      p_resource_id: resourceId,
      p_start: startOfDay,
      p_end: endOfDay,
      p_exclude_id: null
    });
    if (slotError) {
      console.error('Error fetching slot conflicts:', slotError);
      throw slotError;
    }
    const holderRows = (holders ?? []) as SlotConflict[];
    const capacity = (resource as any).initial_stock_quantity as number | null;

    // Step 4: Mark booked slots (capacity-aware) and attach the first holder.
    return generatedSlots.map((slot) => {
      const slotStart = new Date(slot.start_time);
      const slotEnd = new Date(slot.end_time);

      const overlapping = holderRows.filter((h) => {
        const hStart = new Date(h.start_time);
        const hEnd = new Date(h.end_time);
        return hStart < slotEnd && hEnd > slotStart;
      });

      const committed = overlapping.reduce((s, h) => s + (h.quantity ?? 0), 0);
      const isBooked = capacity != null && committed >= capacity;
      const holder = overlapping[0];

      return {
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_available: !isBooked,
        resource_id: resourceId,
        slot_name: slot.slot_name,
        max_capacity: slot.max_capacity,
        existing_reservation_id: isBooked ? holder?.reservation_id : undefined,
        booked_by_name: isBooked ? holder?.full_name ?? null : undefined,
        booked_by_designation: isBooked ? holder?.designation ?? null : undefined,
        booked_status: isBooked ? holder?.status : undefined,
        booked_start: isBooked ? holder?.start_time : undefined,
        booked_end: isBooked ? holder?.end_time : undefined
      };
    });
  }

  /**
   * Get month availability calendar
   */
  static async getMonthAvailability(
    resourceId: string,
    month: number,
    year: number
  ): Promise<CalendarSlot[]> {
    const supabase = createClientSupabaseClient();

    // Get resource booking configuration
    const { data: resource } = await supabase
      .from('resources')
      .select('booking_config, status')
      .eq('id', resourceId)
      .single();

    if (!resource) {
      throw new Error('Resource not found');
    }

    // Import DateAvailabilityService
    const { DateAvailabilityService } = await import(
      '@/lib/services/resource-management/date-availability-service'
    );

    const daysInMonth = new Date(year, month, 0).getDate();
    const calendar: CalendarSlot[] = [];
    const bookingConfig = (resource as any).booking_config as any;
    const dateAvailability = bookingConfig?.date_availability;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${month.toString().padStart(2, '0')}-${day
        .toString()
        .padStart(2, '0')}`;

      // Check if date is available based on DateAvailabilityService
      const isDateAvailable = DateAvailabilityService.isDateAvailable(
        dateAvailability,
        date
      );

      // If date is not available (blocked by date config), mark it as unavailable
      if (!isDateAvailable) {
        calendar.push({
          date,
          slots: [],
          is_fully_booked: false,
          is_partially_booked: false,
          is_available: false,
          is_maintenance: false,
          is_date_unavailable: true // New flag to indicate date is blocked by config
        });
        continue;
      }

      // Get time slots for available dates
      const slots = await this.getAvailableSlots(resourceId, date);

      // If no slots were generated, it means date is unavailable
      if (slots.length === 0) {
        calendar.push({
          date,
          slots: [],
          is_fully_booked: false,
          is_partially_booked: false,
          is_available: false,
          is_maintenance: (resource as any).status === 'maintenance',
          is_date_unavailable: true
        });
        continue;
      }

      const fullyBooked = slots.every((s) => !s.is_available);
      const partiallyBooked =
        slots.some((s) => !s.is_available) && !fullyBooked;
      const available = slots.every((s) => s.is_available);

      calendar.push({
        date,
        slots,
        is_fully_booked: fullyBooked,
        is_partially_booked: partiallyBooked,
        is_available: available,
        is_maintenance: (resource as any).status === 'maintenance',
        is_date_unavailable: false
      });
    }

    return calendar;
  }

  /**
   * Approve a reservation. Delegates authorization + chain logic to the
   * approve_reservation SECURITY DEFINER RPC, then fetches the joined
   * row for the return shape the UI expects.
   */
  static async approveReservation(
    dto: ApproveReservationDto,
    _approverId: string
  ): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    const { error: rpcError } = await (supabase as any).rpc(
      'approve_reservation',
      {
        p_reservation_id: dto.reservation_id,
        p_notes: dto.notes ?? null
      }
    );

    if (rpcError) {
      console.error('Error approving reservation:', rpcError);
      throw rpcError;
    }

    const { data, error: fetchError } = await (supabase
      .from('resource_reservations') as any)
      .select(
        `
        *,
        resource:resources(id, name),
        user:profiles!resource_reservations_user_id_fkey(id, full_name, email)
      `
      )
      .eq('id', dto.reservation_id)
      .single();

    if (fetchError) {
      console.error('Error fetching approved reservation:', fetchError);
      throw fetchError;
    }

    const reservation = data as Reservation;
    const resourceName = (reservation as any).resource?.name || '';

    void notifyBookingApproved(reservation, resourceName).catch(console.error);

    const tpl = ResourceManagementActivityTemplates.reservationApproved(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: reservation.id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        reservation_id: reservation.id,
        resource_id: reservation.resource_id,
      },
      institutionId: (reservation as any).institution_id,
    });

    return reservation;
  }

  /**
   * Reject a reservation. Delegates to the reject_reservation
   * SECURITY DEFINER RPC, then fetches the joined row.
   */
  static async rejectReservation(
    dto: RejectReservationDto,
    _approverId: string
  ): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    const { error: rpcError } = await (supabase as any).rpc(
      'reject_reservation',
      {
        p_reservation_id: dto.reservation_id,
        p_reason: dto.rejection_reason
      }
    );

    if (rpcError) {
      console.error('Error rejecting reservation:', rpcError);
      throw rpcError;
    }

    const { data, error: fetchError } = await (supabase
      .from('resource_reservations') as any)
      .select(
        `
        *,
        resource:resources(id, name),
        user:profiles!resource_reservations_user_id_fkey(id, full_name, email)
      `
      )
      .eq('id', dto.reservation_id)
      .single();

    if (fetchError) {
      console.error('Error fetching rejected reservation:', fetchError);
      throw fetchError;
    }

    const reservation = data as Reservation;
    const resourceName = (reservation as any).resource?.name || '';

    void notifyBookingRejected(reservation, resourceName, dto.rejection_reason).catch(console.error);

    const tpl = ResourceManagementActivityTemplates.reservationRejected(
      resourceName,
      dto.rejection_reason
    );
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: reservation.id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        reservation_id: reservation.id,
        resource_id: reservation.resource_id,
        rejection_reason: dto.rejection_reason,
      },
      institutionId: (reservation as any).institution_id,
    });

    return reservation;
  }

  /**
   * Cancel a reservation
   */
  static async cancelReservation(
    dto: CancelReservationDto,
    _userId: string
  ): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    // Use the cancel_reservation SECURITY DEFINER RPC so that:
    // 1. Admins with resources.manage can cancel any reservation (the direct
    //    UPDATE policy only allowed the original booker).
    // 2. The RPC returns the updated row via RETURNING * without going through
    //    the institution-based SELECT RLS policy that caused PGRST116 errors
    //    even when the cancellation itself succeeded.
    const { error: rpcError } = await (supabase as any).rpc(
      'cancel_reservation',
      {
        p_reservation_id: dto.reservation_id,
        p_reason: dto.cancellation_reason ?? null
      }
    );

    if (rpcError) {
      console.error('Error cancelling reservation:', rpcError);
      throw rpcError;
    }

    // Fetch the full joined row the UI expects (resource name, user details).
    const { data, error } = await (supabase
      .from('resource_reservations') as any)
      .select(
        `
        *,
        resource:resources(id, name),
        user:profiles!resource_reservations_user_id_fkey(id, full_name, email)
      `
      )
      .eq('id', dto.reservation_id)
      .single();

    if (error) {
      console.error('Error fetching cancelled reservation:', error);
      throw error;
    }

    const reservation = data as Reservation;
    const resourceName = (reservation as any).resource?.name || '';
    const tpl = ResourceManagementActivityTemplates.reservationCancelled(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: reservation.id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        reservation_id: reservation.id,
        resource_id: reservation.resource_id,
      },
      institutionId: (reservation as any).institution_id,
    });

    return reservation;
  }

  /**
   * Check in to a reservation
   */
  static async checkIn(dto: CheckInDto, userId: string): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase
      .from('resource_reservations') as any)
      .update({
        checked_in_at: new Date().toISOString(),
        checked_in_by: userId,
        notes: dto.notes
          ? `${dto.notes}\n--- Checked in by ${userId} ---`
          : undefined
      })
      .eq('id', dto.reservation_id)
      .select(
        `
        *,
        resource:resources(id, name),
        user:profiles!resource_reservations_user_id_fkey(id, full_name, email)
      `
      )
      .single();

    if (error) {
      console.error('Error checking in:', error);
      throw error;
    }

    // Log usage
    await this.logUsage(dto.reservation_id, 'check_in', userId);

    const reservation = data as Reservation;
    const resourceName = (reservation as any).resource?.name || '';
    const tpl = ResourceManagementActivityTemplates.reservationCheckedIn(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: reservation.id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        reservation_id: reservation.id,
        resource_id: reservation.resource_id,
      },
      institutionId: (reservation as any).institution_id,
    });

    return reservation;
  }

  /**
   * Check out from a reservation
   */
  static async checkOut(
    dto: CheckOutDto,
    userId: string
  ): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase
      .from('resource_reservations') as any)
      .update({
        status: 'completed',
        checked_out_at: new Date().toISOString(),
        checked_out_by: userId,
        notes: dto.notes
          ? `${dto.notes}\n--- Checked out by ${userId} ---`
          : undefined
      })
      .eq('id', dto.reservation_id)
      .select(
        `
        *,
        resource:resources(id, name),
        user:profiles!resource_reservations_user_id_fkey(id, full_name, email)
      `
      )
      .single();

    if (error) {
      console.error('Error checking out:', error);
      throw error;
    }

    // Log usage
    await this.logUsage(dto.reservation_id, 'check_out', userId);

    const reservation = data as Reservation;
    const resourceName = (reservation as any).resource?.name || '';
    const tpl = ResourceManagementActivityTemplates.reservationCheckedOut(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: reservation.id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        reservation_id: reservation.id,
        resource_id: reservation.resource_id,
      },
      institutionId: (reservation as any).institution_id,
    });

    return reservation;
  }

  /**
   * Get reservation statistics
   */
  static async getReservationStats(userId?: string): Promise<ReservationStats> {
    const supabase = createClientSupabaseClient();

    let query = (supabase as any).from('resource_reservations').select('status');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }

    const stats: ReservationStats = {
      total_reservations: data?.length || 0,
      pending_approvals:
        data?.filter((r: any) => r.status === 'pending').length || 0,
      approved_count: data?.filter((r: any) => r.status === 'approved').length || 0,
      rejected_count: data?.filter((r: any) => r.status === 'rejected').length || 0,
      cancelled_count:
        data?.filter((r: any) => r.status === 'cancelled').length || 0,
      completed_count:
        data?.filter((r: any) => r.status === 'completed').length || 0,
      no_show_count: data?.filter((r: any) => r.status === 'no_show').length || 0,
      upcoming_reservations: 0, // Calculated separately
      overdue_reservations: 0 // Calculated separately
    };

    return stats;
  }

  /**
   * Get user reservation summary
   */
  static async getUserReservationSummary(
    userId: string
  ): Promise<UserReservationSummary> {
    const stats = await this.getReservationStats(userId);

    const summary: UserReservationSummary = {
      total_reservations: stats.total_reservations,
      active_reservations: stats.pending_approvals + stats.approved_count,
      pending_approvals: stats.pending_approvals,
      upcoming_bookings: stats.upcoming_reservations,
      past_bookings: stats.completed_count,
      cancellation_rate:
        stats.total_reservations > 0
          ? (stats.cancelled_count / stats.total_reservations) * 100
          : 0,
      no_show_rate:
        stats.total_reservations > 0
          ? (stats.no_show_count / stats.total_reservations) * 100
          : 0
    };

    return summary;
  }

  /**
   * Helper: Create approval records
   */
  private static async createApprovalRecords(
    reservationId: string,
    approvers: any[]
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    const approvalRecords = approvers
      .filter((a) => a.user_id)
      .map((approver) => ({
        reservation_id: reservationId,
        approver_user_id: approver.user_id,
        approval_level: approver.level ?? 1,
        status: 'pending'
      }));

    if (approvalRecords.length === 0) return;

    const { error } = await (supabase as any)
      .from('resource_approvals')
      .insert(approvalRecords);

    if (error) {
      console.error('Error seeding approval chain:', error);
    }
  }

  /**
   * Helper: Increment resource usage count
   */
  private static async incrementResourceUsage(
    resourceId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    await (supabase as any).rpc('increment_resource_usage', {
      resource_id: resourceId
    });
  }

  /**
   * Helper: Log resource usage
   */
  private static async logUsage(
    reservationId: string,
    action: string,
    userId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    const reservation = await this.getReservation(reservationId);
    if (!reservation) return;

    await (supabase as any).from('resource_usage_logs').insert({
      resource_id: reservation.resource_id,
      reservation_id: reservationId,
      user_id: userId,
      action,
      start_time: reservation.start_time,
      end_time: reservation.end_time
    });
  }
}
