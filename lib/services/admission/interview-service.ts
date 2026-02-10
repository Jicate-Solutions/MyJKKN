// lib/services/admission/interview-service.ts
// Service for interview_slots and interview_bookings tables
// Used by both GD-PI page and Interviews page

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface InterviewSlotRow {
  id: string;
  institution_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number | null;
  is_online: boolean | null;
  is_available: boolean | null;
  interview_type: string | null;
  location: string | null;
  meeting_link: string | null;
  program_id: string | null;
  default_panel_members: string[] | null;
  created_by: string | null;
  created_at: string | null;
}

export interface InterviewBookingRow {
  id: string;
  institution_id: string;
  application_id: string;
  slot_id: string;
  status: 'scheduled' | 'completed' | 'no_show' | 'rescheduled' | 'cancelled' | null;
  outcome: 'selected' | 'waitlisted' | 'rejected' | 'pending' | null;
  score: number | null;
  feedback: Record<string, unknown> | null;
  panel_members: string[] | null;
  booked_at: string | null;
  booked_by: string | null;
  completed_at: string | null;
  interviewer_notes: string | null;
  internal_notes: string | null;
  previous_slot_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Joined fields
  admission_applications?: {
    id: string;
    application_number: string | null;
    program_id: string;
    lead_id: string;
    form_data: Record<string, unknown> | null;
    status: string | null;
  } | null;
  interview_slots?: InterviewSlotRow | null;
}

export interface CreateSlotInput {
  institution_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  is_online?: boolean;
  interview_type?: string;
  location?: string;
  meeting_link?: string;
  program_id?: string;
  default_panel_members?: string[];
  created_by?: string;
}

export interface UpdateBookingInput {
  status?: 'scheduled' | 'completed' | 'no_show' | 'rescheduled' | 'cancelled';
  outcome?: 'selected' | 'waitlisted' | 'rejected' | 'pending';
  score?: number;
  feedback?: Record<string, unknown>;
  panel_members?: string[];
  interviewer_notes?: string;
  internal_notes?: string;
  completed_at?: string;
}

export interface InterviewSlotFilters {
  interview_type?: string;
  program_id?: string;
  is_online?: boolean;
  date_from?: string;
  date_to?: string;
  is_available?: boolean;
}

export class InterviewService {
  private static supabase: any = createClientSupabaseClient();

  /**
   * Fetch all interview slots for an institution with optional filters
   */
  static async getSlots(institutionId: string, filters?: InterviewSlotFilters): Promise<InterviewSlotRow[]> {
    let query = this.supabase
      .from('interview_slots')
      .select('*')
      .eq('institution_id', institutionId)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (filters?.interview_type) {
      query = query.eq('interview_type', filters.interview_type);
    }
    if (filters?.program_id) {
      query = query.eq('program_id', filters.program_id);
    }
    if (filters?.is_online !== undefined) {
      query = query.eq('is_online', filters.is_online);
    }
    if (filters?.date_from) {
      query = query.gte('slot_date', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('slot_date', filters.date_to);
    }
    if (filters?.is_available !== undefined) {
      query = query.eq('is_available', filters.is_available);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as InterviewSlotRow[];
  }

  /**
   * Fetch a single interview slot by ID
   */
  static async getSlot(slotId: string): Promise<InterviewSlotRow | null> {
    const { data, error } = await this.supabase
      .from('interview_slots')
      .select('*')
      .eq('id', slotId)
      .single();

    if (error) throw error;
    return data as InterviewSlotRow | null;
  }

  /**
   * Create a new interview slot
   */
  static async createSlot(input: CreateSlotInput): Promise<InterviewSlotRow> {
    const { data, error } = await this.supabase
      .from('interview_slots')
      .insert({
        institution_id: input.institution_id,
        slot_date: input.slot_date,
        start_time: input.start_time,
        end_time: input.end_time,
        capacity: input.capacity,
        is_online: input.is_online ?? false,
        interview_type: input.interview_type ?? 'interview',
        location: input.location,
        meeting_link: input.meeting_link,
        program_id: input.program_id,
        default_panel_members: input.default_panel_members,
        created_by: input.created_by,
        booked_count: 0,
        is_available: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as InterviewSlotRow;
  }

  /**
   * Update an interview slot
   */
  static async updateSlot(slotId: string, updates: Partial<InterviewSlotRow>): Promise<InterviewSlotRow> {
    const { data, error } = await this.supabase
      .from('interview_slots')
      .update(updates)
      .eq('id', slotId)
      .select()
      .single();

    if (error) throw error;
    return data as InterviewSlotRow;
  }

  /**
   * Delete an interview slot
   */
  static async deleteSlot(slotId: string): Promise<void> {
    const { error } = await this.supabase
      .from('interview_slots')
      .delete()
      .eq('id', slotId);

    if (error) throw error;
  }

  /**
   * Fetch bookings for a specific slot
   */
  static async getBookingsForSlot(slotId: string): Promise<InterviewBookingRow[]> {
    const { data, error } = await this.supabase
      .from('interview_bookings')
      .select(`
        *,
        admission_applications (
          id,
          application_number,
          program_id,
          lead_id,
          form_data,
          status
        )
      `)
      .eq('slot_id', slotId)
      .order('booked_at', { ascending: true });

    if (error) throw error;
    return (data || []) as unknown as InterviewBookingRow[];
  }

  /**
   * Fetch all bookings for an institution with optional filters
   */
  static async getBookings(
    institutionId: string,
    filters?: { status?: string; slot_id?: string; application_id?: string }
  ): Promise<InterviewBookingRow[]> {
    let query = this.supabase
      .from('interview_bookings')
      .select(`
        *,
        admission_applications (
          id,
          application_number,
          program_id,
          lead_id,
          form_data,
          status
        ),
        interview_slots (
          id,
          slot_date,
          start_time,
          end_time,
          is_online,
          interview_type,
          location,
          meeting_link,
          program_id,
          capacity,
          booked_count
        )
      `)
      .eq('institution_id', institutionId)
      .order('booked_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.slot_id) {
      query = query.eq('slot_id', filters.slot_id);
    }
    if (filters?.application_id) {
      query = query.eq('application_id', filters.application_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as unknown as InterviewBookingRow[];
  }

  /**
   * Update a booking (e.g., mark as completed, add score/feedback)
   */
  static async updateBooking(bookingId: string, updates: UpdateBookingInput): Promise<InterviewBookingRow> {
    const { data, error } = await this.supabase
      .from('interview_bookings')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as InterviewBookingRow;
  }

  /**
   * Get stats for interview slots/bookings
   */
  static async getStats(institutionId: string, interviewType?: string) {
    const slotsQuery = this.supabase
      .from('interview_slots')
      .select('id, capacity, booked_count, slot_date, is_available', { count: 'exact' })
      .eq('institution_id', institutionId);

    if (interviewType) {
      slotsQuery.eq('interview_type', interviewType);
    }

    const { data: slots, count: totalSlots } = await slotsQuery;

    const bookingsQuery = this.supabase
      .from('interview_bookings')
      .select('id, status, outcome, score', { count: 'exact' })
      .eq('institution_id', institutionId);

    const { data: bookings, count: totalBookings } = await bookingsQuery;

    const totalCapacity = (slots || []).reduce((sum, s) => sum + (s.capacity || 0), 0);
    const totalBooked = (slots || []).reduce((sum, s) => sum + (s.booked_count || 0), 0);
    const today = new Date().toISOString().split('T')[0];
    const todaySlots = (slots || []).filter(s => s.slot_date === today).length;
    const completedBookings = (bookings || []).filter(b => b.status === 'completed').length;
    const avgScore = (bookings || [])
      .filter(b => b.score !== null)
      .reduce((sum, b, _, arr) => sum + (b.score || 0) / arr.length, 0);

    return {
      totalSlots: totalSlots || 0,
      totalCapacity,
      totalBooked,
      todaySlots,
      completedBookings,
      avgScore,
      totalBookings: totalBookings || 0,
    };
  }
}
