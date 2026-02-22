// WhatsApp Settings Service
// Real Supabase implementation — one settings row per institution (upsert pattern)

import { createClient } from '@supabase/supabase-js';
import type { WhatsAppSettings } from '@/types/whatsapp';

// =============================================================================
// Service client (service role — bypasses RLS)
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// =============================================================================
// Default settings (returned when no row exists yet)
// =============================================================================

function buildDefaults(institutionId: string): WhatsAppSettings {
  const now = new Date().toISOString();
  return {
    id: '',
    institution_id: institutionId,
    service_url: null,
    api_key: null,
    messages_per_minute: 20,
    bulk_delay_ms: 3000,
    max_bulk_recipients: 100,
    enable_bulk_messaging: false,
    enable_templates: true,
    enable_scheduled_messages: false,
    enable_auto_replies: false,
    notify_on_disconnect: true,
    notify_email: null,
    message_log_retention_days: 30,
    created_at: now,
    updated_at: now,
  };
}

// =============================================================================
// Service
// =============================================================================

export class WhatsAppSettingsService {
  /**
   * Fetch settings for an institution.
   * Returns null if no row exists yet.
   */
  static async getSettings(institutionId: string): Promise<WhatsAppSettings | null> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_settings')
      .select('*')
      .eq('institution_id', institutionId)
      .single();

    if (error) {
      // PGRST116 = no rows returned — that is fine, settings haven't been created yet
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch WhatsApp settings: ${error.message}`);
    }

    return data as WhatsAppSettings;
  }

  /**
   * Return existing settings, or create a default row and return it.
   */
  static async getOrCreateSettings(institutionId: string): Promise<WhatsAppSettings> {
    const existing = await this.getSettings(institutionId);
    if (existing) return existing;

    // Upsert a default row (ON CONFLICT do nothing, then re-read)
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_settings')
      .upsert(
        { institution_id: institutionId },
        { onConflict: 'institution_id', ignoreDuplicates: true }
      )
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create default WhatsApp settings: ${error.message}`);
    }

    // If upsert returns data, use it; otherwise re-read (race condition guard)
    if (data) return data as WhatsAppSettings;

    const refetched = await this.getSettings(institutionId);
    if (refetched) return refetched;

    // Absolute fallback — return in-memory defaults
    return buildDefaults(institutionId);
  }

  /**
   * Update (or create) settings for an institution.
   * Uses upsert so callers don't need to worry about whether a row exists.
   */
  static async updateSettings(
    institutionId: string,
    settings: Partial<WhatsAppSettings>
  ): Promise<WhatsAppSettings> {
    const supabase = getServiceClient();

    // Strip fields that shouldn't be written by callers
    const { id: _id, institution_id: _inst, created_at: _ca, updated_at: _ua, institution: _rel, ...payload } = settings as any;

    const { data, error } = await supabase
      .from('wa_settings')
      .upsert(
        {
          institution_id: institutionId,
          ...payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'institution_id' }
      )
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update WhatsApp settings: ${error.message}`);
    }

    return data as WhatsAppSettings;
  }

  /**
   * Toggle the enable_auto_replies flag for an institution.
   */
  static async toggleEnabled(institutionId: string, isEnabled: boolean): Promise<void> {
    const supabase = getServiceClient();

    // Ensure row exists first
    await this.getOrCreateSettings(institutionId);

    const { error } = await supabase
      .from('wa_settings')
      .update({
        enable_auto_replies: isEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq('institution_id', institutionId);

    if (error) {
      throw new Error(`Failed to toggle auto-replies: ${error.message}`);
    }
  }

  /**
   * In-memory defaults (no DB call). Useful for UI fallback rendering.
   */
  private static getDefaultSettings(institutionId: string): WhatsAppSettings {
    return buildDefaults(institutionId);
  }
}

// =============================================================================
// Standalone function exports (backward compatibility)
// =============================================================================

export async function getSettings(institutionId: string): Promise<WhatsAppSettings | null> {
  return WhatsAppSettingsService.getSettings(institutionId);
}

export async function updateSettings(
  institutionId: string,
  settings: Partial<WhatsAppSettings>
): Promise<WhatsAppSettings> {
  return WhatsAppSettingsService.updateSettings(institutionId, settings);
}
