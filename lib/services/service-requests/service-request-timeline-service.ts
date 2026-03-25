/**
 * Service Request Timeline Service
 *
 * Manages timeline entries (status changes, comments, internal notes)
 * for service requests.
 *
 * @module services/service-requests/service-request-timeline-service
 * @created 2026-02-09
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  ServiceRequestTimelineEntry,
  ServiceTimelineEventType,
  ServiceRequestStatus,
} from '@/types/service-request';

const getSupabase = async () => await createServerSupabaseClient() as any;

export class ServiceRequestTimelineService {
  /**
   * Add a generic timeline entry
   */
  static async addTimelineEntry(
    requestId: string,
    entry: {
      actor_id: string | null;
      event_type: ServiceTimelineEventType;
      old_status?: ServiceRequestStatus | null;
      new_status?: ServiceRequestStatus | null;
      content?: string | null;
      is_internal?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<ServiceRequestTimelineEntry> {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from('service_request_timeline')
      .insert({
        service_request_id: requestId,
        actor_id: entry.actor_id,
        event_type: entry.event_type,
        old_status: entry.old_status || null,
        new_status: entry.new_status || null,
        content: entry.content || null,
        is_internal: entry.is_internal || false,
        metadata: entry.metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('[service-requests/timeline] Failed to add timeline entry:', error);
      throw new Error(`Failed to add timeline entry: ${error.message}`);
    }

    return data;
  }

  /**
   * Add a status change timeline entry
   */
  static async addStatusChange(
    requestId: string,
    actorId: string,
    oldStatus: ServiceRequestStatus,
    newStatus: ServiceRequestStatus,
    content?: string
  ): Promise<ServiceRequestTimelineEntry> {
    return this.addTimelineEntry(requestId, {
      actor_id: actorId,
      event_type: 'status_change',
      old_status: oldStatus,
      new_status: newStatus,
      content: content || `Status changed from ${oldStatus} to ${newStatus}`,
    });
  }

  /**
   * Add a public comment to the timeline
   */
  static async addComment(
    requestId: string,
    actorId: string,
    content: string
  ): Promise<ServiceRequestTimelineEntry> {
    return this.addTimelineEntry(requestId, {
      actor_id: actorId,
      event_type: 'comment',
      content,
      is_internal: false,
    });
  }

  /**
   * Add an internal note (only visible to staff/admins)
   */
  static async addInternalNote(
    requestId: string,
    actorId: string,
    content: string
  ): Promise<ServiceRequestTimelineEntry> {
    return this.addTimelineEntry(requestId, {
      actor_id: actorId,
      event_type: 'internal_note',
      content,
      is_internal: true,
    });
  }

  /**
   * Get timeline entries for a request
   */
  static async getTimeline(
    requestId: string,
    includeInternal: boolean = false
  ): Promise<ServiceRequestTimelineEntry[]> {
    const supabase = await getSupabase();

    let query = supabase
      .from('service_request_timeline')
      .select(
        `*,
        actor:profiles!actor_id(id, full_name, email, avatar_url)`
      )
      .eq('service_request_id', requestId)
      .order('created_at', { ascending: false });

    if (!includeInternal) {
      query = query.eq('is_internal', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[service-requests/timeline] Failed to fetch timeline:', error);
      throw new Error(`Failed to fetch timeline: ${error.message}`);
    }

    return data || [];
  }
}
