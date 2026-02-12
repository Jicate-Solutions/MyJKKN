// lib/services/learners-council/event-service.ts
// LC-003: Event Coordination - Service Layer

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LCNotificationService } from './notification-service';
import type {
  LCEvent,
  LCEventParticipant,
  LCEventApproval,
  CreateEventDto,
  UpdateEventDto,
  EventStatus,
} from '@/types/learners-council';

const EVENT_SELECT = `
  *,
  proposer:profiles!proposed_by(id, full_name, avatar_url),
  institution:institutions(id, name)
`;

const EVENT_DETAIL_SELECT = `
  *,
  proposer:profiles!proposed_by(id, full_name, avatar_url),
  institution:institutions(id, name),
  participants:lc_event_participants(*, user:profiles!user_id(id, full_name, email)),
  approvals:lc_event_approvals(*, approver:profiles!approver_id(id, full_name))
`;

export class LCEventService {
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // EVENT CRUD
  // ============================================================================

  /**
   * List events with filters and pagination
   */
  static async getEvents(filters: {
    status?: string;
    scope?: string;
    institution_id?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: LCEvent[]; count: number }> {
    const { status, scope, institution_id, page = 1, limit = 20 } = filters;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = (this.supabase as any)
      .from('lc_events')
      .select(EVENT_SELECT, { count: 'exact' })
      .order('starts_at', { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq('status', status);
    }
    if (scope) {
      query = query.eq('scope', scope);
    }
    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[learners-council/events] Error fetching events:', error);
      throw new Error(`Failed to fetch events: ${error.message}`);
    }

    return { data: (data || []) as unknown as LCEvent[], count: count || 0 };
  }

  /**
   * Get single event with participants & approvals
   */
  static async getEventById(id: string): Promise<LCEvent | null> {
    const { data, error } = await (this.supabase as any)
      .from('lc_events')
      .select(EVENT_DETAIL_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[learners-council/events] Error fetching event:', error);
      throw new Error(`Failed to fetch event: ${error.message}`);
    }

    return data as unknown as LCEvent;
  }

  /**
   * Create a new event as draft
   */
  static async createEvent(dto: CreateEventDto, userId: string): Promise<LCEvent> {
    const { data, error } = await (this.supabase as any)
      .from('lc_events')
      .insert({
        title: dto.title,
        description: dto.description,
        type: dto.type,
        scope: dto.scope,
        institution_id: dto.institution_id || null,
        venue_resource_id: dto.venue_resource_id || null,
        venue_name: dto.venue_name || null,
        starts_at: dto.starts_at,
        ends_at: dto.ends_at,
        max_participants: dto.max_participants || null,
        requires_od: dto.requires_od ?? false,
        budget_estimate: dto.budget_estimate || null,
        tags: dto.tags || [],
        attachments: dto.attachments || [],
        proposed_by: userId,
        status: 'draft' as EventStatus,
        current_participants: 0,
        feedback_enabled: true,
      })
      .select(EVENT_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/events] Error creating event:', error);
      throw new Error(`Failed to create event: ${error.message}`);
    }

    return data as unknown as LCEvent;
  }

  /**
   * Update an event
   */
  static async updateEvent(id: string, dto: UpdateEventDto): Promise<LCEvent> {
    const { data, error } = await (this.supabase as any)
      .from('lc_events')
      .update(dto)
      .eq('id', id)
      .select(EVENT_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/events] Error updating event:', error);
      throw new Error(`Failed to update event: ${error.message}`);
    }

    return data as unknown as LCEvent;
  }

  // ============================================================================
  // APPROVAL WORKFLOW
  // ============================================================================

  /**
   * Submit event for approval - changes status from draft to pending_review
   */
  static async submitEventForApproval(id: string): Promise<LCEvent> {
    const { data, error } = await (this.supabase as any)
      .from('lc_events')
      .update({ status: 'pending_review' as EventStatus })
      .eq('id', id)
      .eq('status', 'draft')
      .select(EVENT_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/events] Error submitting event:', error);
      throw new Error(`Failed to submit event for approval: ${error.message}`);
    }

    return data as unknown as LCEvent;
  }

  /**
   * Approve an event
   * FIX: Added approver_role parameter — lc_event_approvals.approver_role is NOT NULL
   */
  static async approveEvent(
    eventId: string,
    approverId: string,
    approverRole: string,
    comments?: string
  ): Promise<LCEvent> {
    const { error: approvalError } = await (this.supabase as any)
      .from('lc_event_approvals')
      .insert({
        event_id: eventId,
        approver_id: approverId,
        approver_role: approverRole,
        action: 'approve',
        comments: comments || null,
        acted_at: new Date().toISOString(),
      });

    if (approvalError) {
      console.error('[learners-council/events] Error recording approval:', approvalError);
      throw new Error(`Failed to record approval: ${approvalError.message}`);
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_events')
      .update({ status: 'approved' as EventStatus })
      .eq('id', eventId)
      .select(EVENT_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/events] Error approving event:', error);
      throw new Error(`Failed to approve event: ${error.message}`);
    }

    return data as unknown as LCEvent;
  }

  /**
   * Reject an event
   * FIX: Added approver_role parameter — lc_event_approvals.approver_role is NOT NULL
   * NOTE: DB CHECK constraint does not include 'rejected' as a valid status.
   * Status is set to 'cancelled'; the rejection is tracked via lc_event_approvals action='reject'.
   */
  static async rejectEvent(
    eventId: string,
    approverId: string,
    approverRole: string,
    comments: string
  ): Promise<LCEvent> {
    const { error: approvalError } = await (this.supabase as any)
      .from('lc_event_approvals')
      .insert({
        event_id: eventId,
        approver_id: approverId,
        approver_role: approverRole,
        action: 'reject',
        comments,
        acted_at: new Date().toISOString(),
      });

    if (approvalError) {
      console.error('[learners-council/events] Error recording rejection:', approvalError);
      throw new Error(`Failed to record rejection: ${approvalError.message}`);
    }

    // 'cancelled' is the valid DB status for rejected events
    const { data, error } = await (this.supabase as any)
      .from('lc_events')
      .update({ status: 'cancelled' as EventStatus })
      .eq('id', eventId)
      .select(EVENT_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/events] Error rejecting event:', error);
      throw new Error(`Failed to reject event: ${error.message}`);
    }

    return data as unknown as LCEvent;
  }

  /**
   * Publish an approved event — transitions approved -> published
   */
  static async publishEvent(eventId: string): Promise<LCEvent> {
    const { data, error } = await (this.supabase as any)
      .from('lc_events')
      .update({ status: 'published' as EventStatus })
      .eq('id', eventId)
      .eq('status', 'approved')
      .select(EVENT_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/events] Error publishing event:', error);
      throw new Error(`Failed to publish event: ${error.message}`);
    }

    return data as unknown as LCEvent;
  }

  /**
   * Mark event as completed, triggers post-event phase
   */
  static async completeEvent(eventId: string): Promise<LCEvent> {
    const { data, error } = await (this.supabase as any)
      .from('lc_events')
      .update({ status: 'completed' as EventStatus })
      .eq('id', eventId)
      .select(EVENT_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/events] Error completing event:', error);
      throw new Error(`Failed to complete event: ${error.message}`);
    }

    return data as unknown as LCEvent;
  }

  // ============================================================================
  // PARTICIPANT MANAGEMENT
  // ============================================================================

  /**
   * Register for an event
   * FIX: Replaced nonexistent increment_event_participants RPC with direct update
   */
  static async registerForEvent(
    eventId: string,
    userId: string
  ): Promise<LCEventParticipant> {
    // Capacity enforcement: check if event is full before registering
    const { data: event } = await (this.supabase as any)
      .from('lc_events')
      .select('current_participants, max_participants')
      .eq('id', eventId)
      .single();

    if (event && event.max_participants && event.current_participants >= event.max_participants) {
      throw new Error('Event is full — registration closed');
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_event_participants')
      .insert({
        event_id: eventId,
        user_id: userId,
        status: 'registered',
        registered_at: new Date().toISOString(),
      })
      .select('*, user:profiles!user_id(id, full_name, email)')
      .single();

    if (error) {
      console.error('[learners-council/events] Error registering:', error);
      throw new Error(`Failed to register for event: ${error.message}`);
    }

    // current_participants is auto-incremented by database trigger trg_event_participant_count

    return data as unknown as LCEventParticipant;
  }

  /**
   * Cancel event registration — also decrements participant count
   */
  static async cancelRegistration(eventId: string, userId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('lc_event_participants')
      .update({ status: 'cancelled' })
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) {
      console.error('[learners-council/events] Error cancelling registration:', error);
      throw new Error(`Failed to cancel registration: ${error.message}`);
    }

    // current_participants is auto-decremented by database trigger trg_event_participant_count
  }

  /**
   * Mark attendance for a participant
   */
  static async markAttendance(
    eventId: string,
    participantId: string,
    attended: boolean
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('lc_event_participants')
      .update({
        status: attended ? 'attended' : 'absent',
        attended_at: attended ? new Date().toISOString() : null,
      })
      .eq('event_id', eventId)
      .eq('id', participantId);

    if (error) {
      console.error('[learners-council/events] Error marking attendance:', error);
      throw new Error(`Failed to mark attendance: ${error.message}`);
    }
  }

  /**
   * Bulk mark attendance for multiple attendees at once
   */
  static async bulkMarkAttendance(
    eventId: string,
    attendeeIds: string[]
  ): Promise<void> {
    const now = new Date().toISOString();

    const { error } = await (this.supabase as any)
      .from('lc_event_participants')
      .update({
        status: 'attended',
        attended_at: now,
      })
      .eq('event_id', eventId)
      .in('id', attendeeIds);

    if (error) {
      console.error('[learners-council/events] Error bulk marking attendance:', error);
      throw new Error(`Failed to mark attendance: ${error.message}`);
    }
  }

  /**
   * Submit feedback for an event
   */
  static async submitFeedback(
    eventId: string,
    userId: string,
    feedback: string,
    rating: number
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('lc_event_participants')
      .update({
        feedback,
        feedback_rating: rating,
      })
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) {
      console.error('[learners-council/events] Error submitting feedback:', error);
      throw new Error(`Failed to submit feedback: ${error.message}`);
    }
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get events by date range — for calendar view
   */
  static async getEventsByDateRange(
    startDate: string,
    endDate: string,
    filters?: { scope?: string; institution_id?: string; status?: string }
  ): Promise<LCEvent[]> {
    let query = (this.supabase as any)
      .from('lc_events')
      .select(EVENT_SELECT)
      .gte('starts_at', startDate)
      .lte('starts_at', endDate)
      .order('starts_at', { ascending: true });

    if (filters?.scope) query = query.eq('scope', filters.scope);
    if (filters?.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters?.status) {
      query = query.eq('status', filters.status);
    } else {
      // Default: show non-draft, non-cancelled events on calendar
      query = query.in('status', ['pending_review', 'approved', 'published', 'in_progress', 'completed']);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[learners-council/events] Error fetching events by date range:', error);
      throw new Error(`Failed to fetch events: ${error.message}`);
    }

    return (data || []) as unknown as LCEvent[];
  }

  /**
   * Get events the user is registered for
   */
  static async getMyRegisteredEvents(userId: string): Promise<LCEventParticipant[]> {
    const { data, error } = await (this.supabase as any)
      .from('lc_event_participants')
      .select(`
        *,
        event:lc_events(*, proposer:profiles!proposed_by(id, full_name, avatar_url), institution:institutions(id, name)),
        user:profiles!user_id(id, full_name, email)
      `)
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .order('registered_at', { ascending: false });

    if (error) {
      console.error('[learners-council/events] Error fetching registered events:', error);
      throw new Error(`Failed to fetch registered events: ${error.message}`);
    }

    return (data || []) as unknown as LCEventParticipant[];
  }

  /**
   * Get aggregated feedback summary for an event
   */
  static async getEventFeedbackSummary(eventId: string): Promise<{
    totalFeedback: number;
    averageRating: number;
    ratingDistribution: Record<number, number>;
    recentFeedback: { userId: string; userName: string; feedback: string; rating: number }[];
  }> {
    const { data, error } = await (this.supabase as any)
      .from('lc_event_participants')
      .select('user_id, feedback, feedback_rating, user:profiles!user_id(id, full_name)')
      .eq('event_id', eventId)
      .not('feedback_rating', 'is', null);

    if (error) {
      console.error('[learners-council/events] Error fetching feedback summary:', error);
      throw new Error(`Failed to fetch feedback summary: ${error.message}`);
    }

    const participants = (data || []) as any[];
    const totalFeedback = participants.length;
    const sumRating = participants.reduce((sum: number, p: any) => sum + (p.feedback_rating || 0), 0);
    const averageRating = totalFeedback > 0 ? Math.round((sumRating / totalFeedback) * 10) / 10 : 0;

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    participants.forEach((p: any) => {
      if (p.feedback_rating >= 1 && p.feedback_rating <= 5) {
        ratingDistribution[p.feedback_rating]++;
      }
    });

    const recentFeedback = participants
      .filter((p: any) => p.feedback)
      .slice(0, 10)
      .map((p: any) => ({
        userId: p.user_id,
        userName: p.user?.full_name || 'Unknown',
        feedback: p.feedback,
        rating: p.feedback_rating,
      }));

    return { totalFeedback, averageRating, ratingDistribution, recentFeedback };
  }

  /**
   * Export event data suitable for CSV generation
   */
  static async exportEventData(eventId: string): Promise<{
    event: LCEvent;
    participants: { name: string; email: string; status: string; registered_at: string; attended_at: string; feedback: string; rating: string }[];
    approvals: { approver: string; role: string; action: string; comments: string; acted_at: string }[];
  }> {
    const event = await this.getEventById(eventId);
    if (!event) throw new Error('Event not found');

    const { data: participants } = await (this.supabase as any)
      .from('lc_event_participants')
      .select('*, user:profiles!user_id(id, full_name, email)')
      .eq('event_id', eventId)
      .order('registered_at', { ascending: true });

    const { data: approvals } = await (this.supabase as any)
      .from('lc_event_approvals')
      .select('*, approver:profiles!approver_id(id, full_name)')
      .eq('event_id', eventId)
      .order('step_order', { ascending: true });

    return {
      event,
      participants: (participants || []).map((p: any) => ({
        name: p.user?.full_name || '',
        email: p.user?.email || '',
        status: p.status,
        registered_at: p.registered_at || '',
        attended_at: p.attended_at || '',
        feedback: p.feedback || '',
        rating: p.feedback_rating != null ? String(p.feedback_rating) : '',
      })),
      approvals: (approvals || []).map((a: any) => ({
        approver: a.approver?.full_name || '',
        role: a.approver_role || '',
        action: a.action || '',
        comments: a.comments || '',
        acted_at: a.acted_at || '',
      })),
    };
  }

  /**
   * Check venue availability — checks existing events with same venue_resource_id
   * Returns available: true as fallback if resources table doesn't exist
   */
  static async checkVenueAvailability(
    venueId: string,
    date: string,
    startTime: string,
    endTime: string
  ): Promise<{ available: boolean; conflicts?: { title: string; starts_at: string; ends_at: string }[] }> {
    try {
      const startDateTime = `${date}T${startTime}`;
      const endDateTime = `${date}T${endTime}`;

      const { data: conflicts, error } = await (this.supabase as any)
        .from('lc_events')
        .select('id, title, starts_at, ends_at')
        .eq('venue_resource_id', venueId)
        .in('status', ['approved', 'published', 'in_progress'])
        .lte('starts_at', endDateTime)
        .gte('ends_at', startDateTime);

      if (error) {
        return { available: true };
      }

      if (conflicts && conflicts.length > 0) {
        return {
          available: false,
          conflicts: conflicts.map((c: any) => ({
            title: c.title,
            starts_at: c.starts_at,
            ends_at: c.ends_at,
          })),
        };
      }

      return { available: true };
    } catch {
      return { available: true };
    }
  }
}
