// lib/services/events/core/external-participant-service.ts
// Manages external (non-JKKN) participants across events via phone-based identity.
// Phone is the unique key — returning participants are identified by phone number.
// Called exclusively from server-side API routes → uses service role client.
// Created: 2026-04-07

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import type { EventExternalParticipant } from '@/types/events';

// DTO for creating or updating an external participant
export interface CreateOrUpdateExternalParticipantDto {
  full_name: string;
  phone: string;
  email?: string;
  age?: number;
  gender?: string;
  date_of_birth?: string;
  blood_group?: string;
  organization?: string;
  city?: string;
  state?: string;
  id_proof_type?: string;
  id_proof_number?: string;
  metadata?: Record<string, unknown>;
}

export class ExternalParticipantService {
  // ============================================================================
  // Lookup
  // ============================================================================

  /**
   * Find an existing external participant by phone number.
   * Returns null when no record exists for that phone.
   */
  static async findByPhone(phone: string): Promise<EventExternalParticipant | null> {
    const supabase = createServiceRoleClient();

    try {
      const { data, error } = await supabase
        .from('event_external_participants')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      if (error) {
        logger.error('events/external-participants', 'Failed to find participant by phone', {
          phone,
          error,
        });
        throw error;
      }

      return (data as unknown as EventExternalParticipant) ?? null;
    } catch (error) {
      logger.error('events/external-participants', 'Unexpected error in findByPhone', error);
      throw error;
    }
  }

  // ============================================================================
  // Create / Update
  // ============================================================================

  /**
   * Upsert an external participant by phone.
   * - If the phone already exists: updates name, email, and any provided fields.
   * - If new: inserts a fresh record.
   * Returns the final (inserted or updated) participant record.
   */
  static async createOrUpdate(
    dto: CreateOrUpdateExternalParticipantDto
  ): Promise<EventExternalParticipant> {
    const supabase = createServiceRoleClient();

    const upsertPayload: Record<string, unknown> = {
      full_name: dto.full_name,
      phone: dto.phone,
    };

    // Only include optional fields when they carry a real value so we don't
    // accidentally overwrite existing data with undefined/null on an update.
    if (dto.email !== undefined) upsertPayload.email = dto.email;
    if (dto.age !== undefined) upsertPayload.age = dto.age;
    if (dto.gender !== undefined) upsertPayload.gender = dto.gender;
    if (dto.date_of_birth !== undefined) upsertPayload.date_of_birth = dto.date_of_birth;
    if (dto.blood_group !== undefined) upsertPayload.blood_group = dto.blood_group;
    if (dto.organization !== undefined) upsertPayload.organization = dto.organization;
    if (dto.city !== undefined) upsertPayload.city = dto.city;
    if (dto.state !== undefined) upsertPayload.state = dto.state;
    if (dto.id_proof_type !== undefined) upsertPayload.id_proof_type = dto.id_proof_type;
    if (dto.id_proof_number !== undefined) upsertPayload.id_proof_number = dto.id_proof_number;
    if (dto.metadata !== undefined) upsertPayload.metadata = dto.metadata;

    try {
      const { data, error } = await supabase
        .from('event_external_participants')
        .upsert(upsertPayload, { onConflict: 'phone', ignoreDuplicates: false })
        .select()
        .single();

      if (error) {
        logger.error('events/external-participants', 'Failed to upsert external participant', {
          phone: dto.phone,
          error,
        });
        throw error;
      }

      logger.info('events/external-participants', 'Upserted external participant', {
        phone: dto.phone,
        id: (data as Record<string, unknown>).id,
      });

      return data as unknown as EventExternalParticipant;
    } catch (error) {
      logger.error('events/external-participants', 'Unexpected error in createOrUpdate', error);
      throw error;
    }
  }

  // ============================================================================
  // Profile Linking
  // ============================================================================

  /**
   * Link an external participant to a JKKN user profile.
   * Used when an external registrant is later enrolled as a student/staff member.
   */
  static async linkToProfile(participantId: string, profileId: string): Promise<void> {
    const supabase = createServiceRoleClient();

    try {
      const { error } = await supabase
        .from('event_external_participants')
        .update({ linked_profile_id: profileId })
        .eq('id', participantId);

      if (error) {
        logger.error(
          'events/external-participants',
          'Failed to link participant to profile',
          { participantId, profileId, error }
        );
        throw error;
      }

      logger.info('events/external-participants', 'Linked external participant to profile', {
        participantId,
        profileId,
      });
    } catch (error) {
      logger.error('events/external-participants', 'Unexpected error in linkToProfile', error);
      throw error;
    }
  }

  // ============================================================================
  // Participation History
  // ============================================================================

  /**
   * Returns the participant record plus a summary of all registrations they
   * have made across events (looked up by phone).
   * Returns null if no participant record exists for the given phone.
   */
  static async getParticipationHistory(phone: string): Promise<{
    participant: EventExternalParticipant;
    registrations: {
      event_name: string;
      event_date: string;
      category: string;
      status: string;
    }[];
  } | null> {
    const supabase = createServiceRoleClient();

    try {
      // Step 1: find the participant
      const participant = await this.findByPhone(phone);
      if (!participant) return null;

      // Step 2: fetch registrations linked to this participant plus event/category info
      const { data: rows, error } = await supabase
        .from('events_registrations')
        .select(
          `
          status,
          events ( name, date ),
          event_categories ( name )
        `
        )
        .eq('external_participant_id', participant.id)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error(
          'events/external-participants',
          'Failed to fetch participation history',
          { phone, error }
        );
        throw error;
      }

      const registrations = (rows ?? []).map((row: Record<string, unknown>) => {
        const event = row.events as Record<string, unknown> | null;
        const cat = row.event_categories as Record<string, unknown> | null;
        return {
          event_name: (event?.name as string) ?? 'Unknown',
          event_date: (event?.date as string) ?? '',
          category: (cat?.name as string) ?? 'Unknown',
          status: row.status as string,
        };
      });

      return { participant, registrations };
    } catch (error) {
      logger.error(
        'events/external-participants',
        'Unexpected error in getParticipationHistory',
        error
      );
      throw error;
    }
  }
}
