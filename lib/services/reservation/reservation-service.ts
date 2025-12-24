// lib/services/reservation/reservation-service.ts
// Reservation Service - Handles all reservation operations

import { createClientSupabaseClient } from '@/lib/supabase/client';
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
  CheckOutDto
} from '@/types/reservation';

export class ReservationService {
  /**
   * Get all reservations with optional filters
   */
  static async getReservations(
    filters?: ReservationFilters
  ): Promise<Reservation[]> {
    const supabase = createClientSupabaseClient();

    let query = supabase
      .from('resource_reservations')
      .select(
        `
        *,
        resource:resources(id, name, parent_category_id, subcategory_id),
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

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching reservations:', error);
      throw error;
    }

    return data as Reservation[];
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

    return data as Reservation;
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
      end_time: dto.end_time
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

    // Determine initial status based on approval config
    const requiresApproval = (resource as any)?.approval_config?.enabled || false;
    const initialStatus = requiresApproval ? 'pending' : 'approved';

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
      approved_at: requiresApproval ? null : new Date().toISOString()
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

    // If approval is required, create approval records
    if (requiresApproval && (resource as any)?.approval_config?.approvers) {
      await this.createApprovalRecords(
        (data as any).id,
        (resource as any).approval_config.approvers
      );
    }

    // Update resource usage count
    await this.incrementResourceUsage(dto.resource_id);

    return data as Reservation;
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

    return data as Reservation;
  }

  /**
   * Delete a reservation
   */
  static async deleteReservation(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await supabase
      .from('resource_reservations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting reservation:', error);
      throw error;
    }
  }

  /**
   * Check if a resource is available for a given time slot
   */
  static async checkAvailability(
    dto: AvailabilityCheckDto
  ): Promise<AvailabilityResult> {
    const supabase = createClientSupabaseClient();

    // Get all reservations for this resource that might conflict
    let query = supabase
      .from('resource_reservations')
      .select('*')
      .eq('resource_id', dto.resource_id)
      .in('status', ['pending', 'approved', 'completed'])
      .or(`and(start_time.lt.${dto.end_time},end_time.gt.${dto.start_time})`);

    // Exclude a specific reservation (for editing)
    if (dto.exclude_reservation_id) {
      query = query.neq('id', dto.exclude_reservation_id);
    }

    const { data: conflicts, error } = await query;

    if (error) {
      console.error('Error checking availability:', error);
      throw error;
    }

    const is_available = !conflicts || conflicts.length === 0;

    return {
      is_available,
      conflicting_reservations: is_available
        ? undefined
        : (conflicts as Reservation[]),
      message: is_available
        ? 'Resource is available'
        : `Resource is already booked for ${conflicts?.length} time slot(s)`
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
      .select('booking_config, status')
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

    // Import the new services
    const { DateAvailabilityService } = await import(
      '@/lib/services/resource-management/date-availability-service'
    );
    const { TimeSlotGeneratorService } = await import(
      '@/lib/services/resource-management/time-slot-generator-service'
    );

    const bookingConfig = (resource as any).booking_config as any;

    // Step 1: Check if date is available using DateAvailabilityService
    const dateConfig = bookingConfig?.date_availability;
    if (dateConfig && !DateAvailabilityService.isDateAvailable(dateConfig, date)) {
      return []; // No slots if date unavailable
    }

    // Step 2: Generate slots using TimeSlotGeneratorService
    const timeConfig = bookingConfig?.time_slot_config;
    const generatedSlots = timeConfig
      ? TimeSlotGeneratorService.generateSlotsForDate(timeConfig, date, resourceId)
      : this.generateLegacySlots(date, bookingConfig, resourceId);

    // Step 3: Get existing reservations for the date
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;

    const { data: reservations } = await supabase
      .from('resource_reservations')
      .select('start_time, end_time, id')
      .eq('resource_id', resourceId)
      .in('status', ['pending', 'approved', 'completed'])
      .gte('start_time', startOfDay)
      .lte('end_time', endOfDay);

    // Step 4: Mark booked slots
    return generatedSlots.map((slot) => {
      const isBooked = reservations?.some((r: any) => {
        const reservationStart = new Date(r.start_time);
        const reservationEnd = new Date(r.end_time);
        const slotStart = new Date(slot.start_time);
        const slotEnd = new Date(slot.end_time);

        // Check for overlap
        return reservationStart < slotEnd && reservationEnd > slotStart;
      });

      return {
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_available: !isBooked,
        resource_id: resourceId,
        slot_name: slot.slot_name, // Pass through custom slot name
        max_capacity: slot.max_capacity, // Pass through capacity
        existing_reservation_id: isBooked
          ? (reservations?.find((r: any) => {
              const reservationStart = new Date(r.start_time);
              const reservationEnd = new Date(r.end_time);
              const slotStart = new Date(slot.start_time);
              const slotEnd = new Date(slot.end_time);
              return reservationStart < slotEnd && reservationEnd > slotStart;
            }) as any)?.id
          : undefined
      };
    });
  }

  /**
   * Generate legacy slots for backward compatibility
   */
  private static generateLegacySlots(
    date: string,
    bookingConfig: any,
    resourceId: string
  ): Array<{ start_time: string; end_time: string; is_available: boolean; resource_id: string; slot_name?: string; max_capacity?: number }> {
    const slots = [];

    // Default: 1-hour slots from 9 AM to 5 PM
    const startHour = bookingConfig?.operating_hours?.start || 9;
    const endHour = bookingConfig?.operating_hours?.end || 17;

    for (let hour = startHour; hour < endHour; hour++) {
      const slotStart = `${date}T${hour.toString().padStart(2, '0')}:00:00`;
      const slotEnd = `${date}T${(hour + 1)
        .toString()
        .padStart(2, '0')}:00:00`;

      slots.push({
        start_time: slotStart,
        end_time: slotEnd,
        is_available: true,
        resource_id: resourceId
      });
    }

    return slots;
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
   * Approve a reservation
   */
  static async approveReservation(
    dto: ApproveReservationDto,
    approverId: string
  ): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase
      .from('resource_reservations') as any)
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        notes: dto.notes
          ? `${dto.notes}\n--- Approved by ${approverId} ---`
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
      console.error('Error approving reservation:', error);
      throw error;
    }

    // Update approval record
    await (supabase
      .from('resource_approvals') as any)
      .update({
        status: 'approved',
        approved_at: new Date().toISOString()
      })
      .eq('reservation_id', dto.reservation_id)
      .eq('approver_user_id', approverId);

    return data as Reservation;
  }

  /**
   * Reject a reservation
   */
  static async rejectReservation(
    dto: RejectReservationDto,
    approverId: string
  ): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase
      .from('resource_reservations') as any)
      .update({
        status: 'rejected',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        rejection_reason: dto.rejection_reason
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
      console.error('Error rejecting reservation:', error);
      throw error;
    }

    // Update approval record
    await (supabase
      .from('resource_approvals') as any)
      .update({
        status: 'rejected',
        rejection_reason: dto.rejection_reason,
        approved_at: new Date().toISOString()
      })
      .eq('reservation_id', dto.reservation_id)
      .eq('approver_user_id', approverId);

    return data as Reservation;
  }

  /**
   * Cancel a reservation
   */
  static async cancelReservation(
    dto: CancelReservationDto,
    userId: string
  ): Promise<Reservation> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase
      .from('resource_reservations') as any)
      .update({
        status: 'cancelled',
        cancelled_by: userId,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: dto.cancellation_reason
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
      console.error('Error cancelling reservation:', error);
      throw error;
    }

    return data as Reservation;
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

    return data as Reservation;
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

    return data as Reservation;
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

    const approvalRecords = approvers.map((approver) => ({
      reservation_id: reservationId,
      approver_user_id: approver.user_id,
      approval_level: approver.level,
      status: 'pending'
    }));

    await (supabase as any).from('resource_approvals').insert(approvalRecords);
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
