// lib/services/events/shared/event-volunteer-service.ts
// Shared volunteer-roster + incident-log service for ANY event type (Events Platform Promotion PR4).
// Reads the renamed event_volunteer_checkins / event_incidents tables. Decision #8: volunteers may be
// external (non-JKKN) people added by name/phone (guest helpers, parent marshals) — flagged via the
// external_name / external_phone columns. The marathon race-day GPS/checkpoint logic stays in
// MarathonLiveOpsService; this service holds only the event-generic volunteer + incident concerns.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MarathonVolunteerCheckin,
  MarathonIncident,
  CreateEventVolunteerDto,
  CreateMarathonIncidentDto,
} from '@/types/events-marathon';

const MOD = 'events/volunteer';

export class EventVolunteerService {
  private static supabase = createClientSupabaseClient();

  // --- Volunteers ----------------------------------------------------------

  /** All volunteer check-ins for an event, newest first. */
  static async getVolunteers(eventId: string): Promise<MarathonVolunteerCheckin[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_volunteer_checkins')
        .select('*')
        .eq('event_id', eventId)
        .order('checked_in_at', { ascending: false });
      if (error) {
        logger.error(MOD, 'Failed to fetch volunteers', error);
        throw error;
      }
      return (data as unknown as MarathonVolunteerCheckin[]) ?? [];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getVolunteers', error);
      throw error;
    }
  }

  /**
   * Check in a volunteer at a station. Two paths:
   *   - MyJKKN volunteer  → member_id/member_role/member_email link them to their profile.
   *   - External guest    → external_name/external_phone, no member link (decision #8).
   * A partial unique index blocks checking the same JKKN person into an event twice
   * while they are still on duty; that surfaces as 23505.
   */
  static async checkinVolunteer(dto: CreateEventVolunteerDto): Promise<MarathonVolunteerCheckin> {
    try {
      const isExternal = dto.is_external === true;
      const insertPayload = {
        event_id: dto.event_id,
        volunteer_name: dto.volunteer_name,
        volunteer_phone: dto.volunteer_phone ?? null,
        station: dto.station,
        role: dto.role ?? null,
        notes: dto.notes ?? null,
        // Guest markers: default external_name to the display name so reports can filter on it.
        external_name: isExternal ? (dto.external_name ?? dto.volunteer_name) : null,
        external_phone: isExternal ? (dto.external_phone ?? dto.volunteer_phone ?? null) : null,
        // MyJKKN link — guests never carry one.
        member_id: isExternal ? null : (dto.member_id ?? null),
        member_role: isExternal ? null : (dto.member_role ?? null),
        member_email: isExternal ? null : (dto.member_email ?? null),
        checked_in_at: new Date().toISOString(),
      };
      const { data, error } = await (this.supabase as any)
        .from('event_volunteer_checkins')
        .insert([insertPayload])
        .select('*');
      if (error) {
        logger.error(MOD, 'Failed to check in volunteer', error);
        if (error.code === '23505') {
          throw new Error(`${dto.volunteer_name} is already checked in for this event.`);
        }
        throw error;
      }
      const created = Array.isArray(data) ? data[0] : data;
      logger.info(MOD, 'Volunteer checked in', {
        eventId: dto.event_id,
        name: dto.volunteer_name,
        external: isExternal,
      });
      return created as unknown as MarathonVolunteerCheckin;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in checkinVolunteer', error);
      throw error;
    }
  }

  /** Mark a volunteer checked out (stamps checked_out_at). */
  static async checkoutVolunteer(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('event_volunteer_checkins')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        logger.error(MOD, 'Failed to check out volunteer', { id, error });
        throw error;
      }
      logger.info(MOD, 'Volunteer checked out', { id });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in checkoutVolunteer', error);
      throw error;
    }
  }

  /** Delete a volunteer check-in record permanently. */
  static async deleteVolunteer(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('event_volunteer_checkins')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error(MOD, 'Failed to delete volunteer', {
          id,
          message: error.message,
          code: error.code,
        });
        throw new Error(error.message || 'Failed to delete volunteer');
      }
      logger.info(MOD, 'Volunteer deleted', { id });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in deleteVolunteer', error);
      throw error;
    }
  }

  // --- Incidents -----------------------------------------------------------

  /** All incidents for an event, newest first. */
  static async getIncidents(eventId: string): Promise<MarathonIncident[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_incidents')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      if (error) {
        logger.error(MOD, 'Failed to fetch incidents', error);
        throw error;
      }
      return (data as unknown as MarathonIncident[]) ?? [];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getIncidents', error);
      throw error;
    }
  }

  /** Log a new incident (status starts 'reported'). */
  static async createIncident(dto: CreateMarathonIncidentDto): Promise<MarathonIncident> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_incidents')
        .insert([
          {
            event_id: dto.event_id,
            type: dto.type,
            severity: dto.severity,
            title: dto.title,
            description: dto.description ?? null,
            location: dto.location ?? null,
            lat: dto.lat ?? null,
            lng: dto.lng ?? null,
            bib_number: dto.bib_number ?? null,
            status: 'reported',
          },
        ])
        .select('*')
        .single();
      if (error) {
        logger.error(MOD, 'Failed to create incident', error);
        throw error;
      }
      logger.info(MOD, 'Incident created', {
        id: data.id,
        type: dto.type,
        severity: dto.severity,
      });
      return data as unknown as MarathonIncident;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in createIncident', error);
      throw error;
    }
  }

  /** Resolve an incident with resolution notes. */
  static async resolveIncident(id: string, resolutionNotes: string): Promise<MarathonIncident> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_incidents')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes,
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        logger.error(MOD, 'Failed to resolve incident', { id, error });
        throw error;
      }
      logger.info(MOD, 'Incident resolved', { id });
      return data as unknown as MarathonIncident;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in resolveIncident', error);
      throw error;
    }
  }

  /** Delete an incident record permanently. */
  static async deleteIncident(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('event_incidents')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error(MOD, 'Failed to delete incident', { id, error });
        throw new Error(error.message || 'Failed to delete incident');
      }
      logger.info(MOD, 'Incident deleted', { id });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in deleteIncident', error);
      throw error;
    }
  }
}
