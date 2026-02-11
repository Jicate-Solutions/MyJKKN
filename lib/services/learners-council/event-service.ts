// lib/services/learners-council/event-service.ts
// LC-003: Event Coordination - Service Layer

import { createClientSupabaseClient } from '@/lib/supabase/client';
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

    let query = this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
   */
  static async approveEvent(
    eventId: string,
    approverId: string,
    comments?: string
  ): Promise<LCEvent> {
    // Record the approval action
    const { error: approvalError } = await this.supabase
      .from('lc_event_approvals')
      .insert({
        event_id: eventId,
        approver_id: approverId,
        action: 'approve',
        comments: comments || null,
        acted_at: new Date().toISOString(),
      });

    if (approvalError) {
      console.error('[learners-council/events] Error recording approval:', approvalError);
      throw new Error(`Failed to record approval: ${approvalError.message}`);
    }

    // Update event status to approved
    const { data, error } = await this.supabase
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
   */
  static async rejectEvent(
    eventId: string,
    approverId: string,
    comments: string
  ): Promise<LCEvent> {
    // Record the rejection
    const { error: approvalError } = await this.supabase
      .from('lc_event_approvals')
      .insert({
        event_id: eventId,
        approver_id: approverId,
        action: 'reject',
        comments,
        acted_at: new Date().toISOString(),
      });

    if (approvalError) {
      console.error('[learners-council/events] Error recording rejection:', approvalError);
      throw new Error(`Failed to record rejection: ${approvalError.message}`);
    }

    // Update event status to cancelled
    const { data, error } = await this.supabase
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

  // ============================================================================
  // PARTICIPANT MANAGEMENT
  // ============================================================================

  /**
   * Register for an event
   */
  static async registerForEvent(
    eventId: string,
    userId: string
  ): Promise<LCEventParticipant> {
    const { data, error } = await this.supabase
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

    // Increment participant count
    await this.supabase.rpc('increment_event_participants', { event_id: eventId });

    return data as unknown as LCEventParticipant;
  }

  /**
   * Cancel event registration
   */
  static async cancelRegistration(eventId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('lc_event_participants')
      .update({ status: 'cancelled' })
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) {
      console.error('[learners-council/events] Error cancelling registration:', error);
      throw new Error(`Failed to cancel registration: ${error.message}`);
    }
  }

  /**
   * Mark attendance for a participant
   */
  static async markAttendance(
    eventId: string,
    participantId: string,
    attended: boolean
  ): Promise<void> {
    const { error } = await this.supabase
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
   * Submit feedback for an event
   */
  static async submitFeedback(
    eventId: string,
    userId: string,
    feedback: string,
    rating: number
  ): Promise<void> {
    const { error } = await this.supabase
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
}
