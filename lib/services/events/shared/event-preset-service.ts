// lib/services/events/shared/event-preset-service.ts
// Events Platform Promotion PR9 — preset CRUD for the `event_presets` table.
//
// Decisions #4/#5 — OFFICIAL (admin-published) + PERSONAL (per-coordinator) presets.
// All reads/writes go through the browser supabase client; RLS (defined in the PR1
// migration) enforces scope:
//   • read   → official presets OR your own personal presets
//   • write personal → only your own scope='personal' rows
//   • write official → admins / holders of events.presets.manage
// No service-role here — RLS is the single gate, exactly like sibling shared services.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { EventPreset, CreatePresetDto, PresetConfig } from '@/types/events-presets';

const MOD = 'events/presets';

export class EventPresetService {
  private static supabase = createClientSupabaseClient();

  /**
   * List presets for an event type: every official preset + the caller's own
   * personal presets (RLS filters the rest out). Official-first, then by name.
   */
  static async listPresets(eventType: string): Promise<EventPreset[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_presets')
        .select('*')
        .eq('event_type', eventType)
        .order('scope', { ascending: true }) // 'official' < 'personal'
        .order('name', { ascending: true });
      if (error) {
        logger.error(MOD, 'Failed to list presets', error);
        throw error;
      }
      return (data as EventPreset[]) ?? [];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in listPresets', error);
      throw error;
    }
  }

  /** Create a personal preset for the current user (RLS sets/checks ownership). */
  static async createPersonal(dto: CreatePresetDto, ownerId: string): Promise<EventPreset> {
    try {
      const insertPayload = {
        event_type: dto.event_type,
        name: dto.name.trim(),
        scope: 'personal' as const,
        owner_id: ownerId,
        config: dto.config ?? {},
        institution_id: dto.institution_id ?? null,
      };
      const { data, error } = await (this.supabase as any)
        .from('event_presets')
        .insert([insertPayload])
        .select('*')
        .single();
      if (error) {
        logger.error(MOD, 'Failed to create personal preset', error);
        throw new Error(error.message || 'Failed to create preset');
      }
      logger.info(MOD, 'Personal preset created', { eventType: dto.event_type, name: dto.name });
      return data as EventPreset;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in createPersonal', error);
      throw error;
    }
  }

  /**
   * Publish an OFFICIAL preset (admins / events.presets.manage holders only —
   * RLS rejects the write otherwise). owner_id is left null for official presets.
   */
  static async publishOfficial(dto: CreatePresetDto): Promise<EventPreset> {
    try {
      const insertPayload = {
        event_type: dto.event_type,
        name: dto.name.trim(),
        scope: 'official' as const,
        owner_id: null,
        config: dto.config ?? {},
        institution_id: dto.institution_id ?? null,
      };
      const { data, error } = await (this.supabase as any)
        .from('event_presets')
        .insert([insertPayload])
        .select('*')
        .single();
      if (error) {
        logger.error(MOD, 'Failed to publish official preset', error);
        throw new Error(error.message || 'Failed to publish official preset');
      }
      logger.info(MOD, 'Official preset published', { eventType: dto.event_type, name: dto.name });
      return data as EventPreset;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in publishOfficial', error);
      throw error;
    }
  }

  /**
   * Copy an official preset into a personal one the caller owns, so they can
   * tweak it. Returns the new personal preset.
   */
  static async copyToPersonal(source: EventPreset, ownerId: string, name?: string): Promise<EventPreset> {
    return this.createPersonal(
      {
        event_type: source.event_type,
        name: name?.trim() || `${source.name} (my copy)`,
        scope: 'personal',
        config: source.config ?? {},
        institution_id: source.institution_id ?? null,
      },
      ownerId
    );
  }

  /** Update a preset's name and/or config (RLS gates which rows are writable). */
  static async update(
    id: string,
    patch: { name?: string; config?: PresetConfig }
  ): Promise<EventPreset> {
    try {
      const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) updatePayload.name = patch.name.trim();
      if (patch.config !== undefined) updatePayload.config = patch.config;
      const { data, error } = await (this.supabase as any)
        .from('event_presets')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        logger.error(MOD, 'Failed to update preset', { id, error });
        throw new Error(error.message || 'Failed to update preset');
      }
      return data as EventPreset;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in update', error);
      throw error;
    }
  }

  /** Delete a preset (RLS gates which rows are deletable). */
  static async remove(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any).from('event_presets').delete().eq('id', id);
      if (error) {
        logger.error(MOD, 'Failed to delete preset', { id, error });
        throw new Error(error.message || 'Failed to delete preset');
      }
      logger.info(MOD, 'Preset deleted', { id });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in remove', error);
      throw error;
    }
  }
}
