// app/actions/whatsapp/settings-actions.ts
// Server actions for WhatsApp settings management

'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  WhatsAppSettings,
  UpdateWhatsAppSettingsDto,
} from '@/types/whatsapp';

// Response types
interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get current user's session and institution
 */
async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get user's institution
  const { data: profile } = await supabase
    .from('profiles')
    .select('institution_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.institution_id) {
    throw new Error('No institution assigned');
  }

  return {
    userId: user.id,
    institutionId: profile.institution_id,
    role: profile.role
  };
}

/**
 * Check if user has admin permissions for WhatsApp settings
 */
async function checkSettingsPermission(userId: string, institutionId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .eq('institution_id', institutionId)
    .single();

  if (!profile) return false;

  // Only admin roles can manage settings
  const adminRoles = ['super_admin', 'institution_admin', 'admin'];
  return adminRoles.includes(profile.role);
}

/**
 * Get WhatsApp settings for the current institution
 */
export async function getWhatsAppSettings(): Promise<ActionResponse<WhatsAppSettings>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkSettingsPermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to view WhatsApp settings'
      };
    }

    // Use server client directly (service uses browser client which lacks auth context)
    const supabase = await createServerSupabaseClient();

    // Try to get existing settings
    const { data: existingSettings, error: selectError } = await supabase
      .from('whatsapp_settings')
      .select(`
        *,
        institution:institutions!institution_id(
          id,
          name
        )
      `)
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (selectError) {
      console.error('[whatsapp/settings-actions] Error getting settings:', selectError);
      throw new Error(selectError.message);
    }

    // If settings exist, return them
    if (existingSettings) {
      return {
        success: true,
        data: existingSettings as WhatsAppSettings
      };
    }

    // Create new settings with defaults
    const { data: newSettings, error: insertError } = await supabase
      .from('whatsapp_settings')
      .insert({
        institution_id: institutionId,
        service_url: null,
        api_key: null,
        messages_per_minute: 30,
        bulk_delay_ms: 2000,
        max_bulk_recipients: 100,
        enable_bulk_messaging: true,
        enable_templates: true,
        enable_scheduled_messages: false,
        enable_auto_replies: false,
        notify_on_disconnect: true,
        notify_email: null,
        message_log_retention_days: 90
      })
      .select(`
        *,
        institution:institutions!institution_id(
          id,
          name
        )
      `)
      .single();

    if (insertError) {
      console.error('[whatsapp/settings-actions] Error creating settings:', insertError);
      throw new Error(insertError.message);
    }

    return {
      success: true,
      data: newSettings as WhatsAppSettings
    };
  } catch (error) {
    console.error('[whatsapp/settings-actions] Error getting settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get settings'
    };
  }
}

/**
 * Update WhatsApp settings for the current institution
 */
export async function updateWhatsAppSettings(
  data: UpdateWhatsAppSettingsDto
): Promise<ActionResponse<WhatsAppSettings>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkSettingsPermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to update WhatsApp settings'
      };
    }

    // Use server client directly (service uses browser client which lacks auth context)
    const supabase = await createServerSupabaseClient();

    // Update settings
    const { data: settings, error: updateError } = await supabase
      .from('whatsapp_settings')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('institution_id', institutionId)
      .select(`
        *,
        institution:institutions!institution_id(
          id,
          name
        )
      `)
      .single();

    if (updateError) {
      console.error('[whatsapp/settings-actions] Error updating settings:', updateError);
      throw new Error(updateError.message);
    }

    revalidatePath('/whatsapp/settings');

    return {
      success: true,
      data: settings as WhatsAppSettings
    };
  } catch (error) {
    console.error('[whatsapp/settings-actions] Error updating settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update settings'
    };
  }
}

/**
 * Toggle a feature on/off
 */
export async function toggleWhatsAppFeature(
  feature: 'enable_bulk_messaging' | 'enable_templates' | 'enable_scheduled_messages' | 'enable_auto_replies' | 'notify_on_disconnect',
  enabled: boolean
): Promise<ActionResponse<WhatsAppSettings>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkSettingsPermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to update WhatsApp settings'
      };
    }

    // Use server client directly
    const supabase = await createServerSupabaseClient();

    // Toggle feature
    const { data: settings, error: updateError } = await supabase
      .from('whatsapp_settings')
      .update({
        [feature]: enabled,
        updated_at: new Date().toISOString()
      })
      .eq('institution_id', institutionId)
      .select()
      .single();

    if (updateError) {
      console.error('[whatsapp/settings-actions] Error toggling feature:', updateError);
      throw new Error(updateError.message);
    }

    revalidatePath('/whatsapp/settings');

    return {
      success: true,
      data: settings as WhatsAppSettings
    };
  } catch (error) {
    console.error('[whatsapp/settings-actions] Error toggling feature:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle feature'
    };
  }
}

/**
 * Update rate limiting settings
 */
export async function updateRateLimits(
  limits: {
    messagesPerMinute?: number;
    bulkDelayMs?: number;
    maxBulkRecipients?: number;
  }
): Promise<ActionResponse<WhatsAppSettings>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkSettingsPermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to update WhatsApp settings'
      };
    }

    // Validate limits
    if (limits.messagesPerMinute !== undefined && (limits.messagesPerMinute < 1 || limits.messagesPerMinute > 60)) {
      return {
        success: false,
        error: 'Messages per minute must be between 1 and 60'
      };
    }

    if (limits.bulkDelayMs !== undefined && (limits.bulkDelayMs < 500 || limits.bulkDelayMs > 10000)) {
      return {
        success: false,
        error: 'Bulk delay must be between 500ms and 10000ms'
      };
    }

    if (limits.maxBulkRecipients !== undefined && (limits.maxBulkRecipients < 1 || limits.maxBulkRecipients > 1000)) {
      return {
        success: false,
        error: 'Max bulk recipients must be between 1 and 1000'
      };
    }

    // Use server client directly
    const supabase = await createServerSupabaseClient();

    // Update rate limits
    const { data: settings, error: updateError } = await supabase
      .from('whatsapp_settings')
      .update({
        messages_per_minute: limits.messagesPerMinute,
        bulk_delay_ms: limits.bulkDelayMs,
        max_bulk_recipients: limits.maxBulkRecipients,
        updated_at: new Date().toISOString()
      })
      .eq('institution_id', institutionId)
      .select()
      .single();

    if (updateError) {
      console.error('[whatsapp/settings-actions] Error updating rate limits:', updateError);
      throw new Error(updateError.message);
    }

    revalidatePath('/whatsapp/settings');

    return {
      success: true,
      data: settings as WhatsAppSettings
    };
  } catch (error) {
    console.error('[whatsapp/settings-actions] Error updating rate limits:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update rate limits'
    };
  }
}

/**
 * Update notification settings
 */
export async function updateNotificationSettings(
  notificationSettings: {
    notifyOnDisconnect?: boolean;
    notifyEmail?: string | null;
  }
): Promise<ActionResponse<WhatsAppSettings>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkSettingsPermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to update WhatsApp settings'
      };
    }

    // Validate email if provided
    if (notificationSettings.notifyEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(notificationSettings.notifyEmail)) {
        return {
          success: false,
          error: 'Invalid email address'
        };
      }
    }

    // Use server client directly
    const supabase = await createServerSupabaseClient();

    // Update notification settings
    const { data: updatedSettings, error: updateError } = await supabase
      .from('whatsapp_settings')
      .update({
        notify_on_disconnect: notificationSettings.notifyOnDisconnect,
        notify_email: notificationSettings.notifyEmail,
        updated_at: new Date().toISOString()
      })
      .eq('institution_id', institutionId)
      .select()
      .single();

    if (updateError) {
      console.error('[whatsapp/settings-actions] Error updating notification settings:', updateError);
      throw new Error(updateError.message);
    }

    revalidatePath('/whatsapp/settings');

    return {
      success: true,
      data: updatedSettings as WhatsAppSettings
    };
  } catch (error) {
    console.error('[whatsapp/settings-actions] Error updating notification settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update notification settings'
    };
  }
}

/**
 * Update message log retention days
 */
export async function updateLogRetention(
  days: number
): Promise<ActionResponse<WhatsAppSettings>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkSettingsPermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to update WhatsApp settings'
      };
    }

    // Validate days
    if (days < 7 || days > 365) {
      return {
        success: false,
        error: 'Log retention must be between 7 and 365 days'
      };
    }

    // Use server client directly
    const supabase = await createServerSupabaseClient();

    // Update retention
    const { data: settings, error: updateError } = await supabase
      .from('whatsapp_settings')
      .update({
        message_log_retention_days: days,
        updated_at: new Date().toISOString()
      })
      .eq('institution_id', institutionId)
      .select()
      .single();

    if (updateError) {
      console.error('[whatsapp/settings-actions] Error updating log retention:', updateError);
      throw new Error(updateError.message);
    }

    revalidatePath('/whatsapp/settings');

    return {
      success: true,
      data: settings as WhatsAppSettings
    };
  } catch (error) {
    console.error('[whatsapp/settings-actions] Error updating log retention:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update log retention'
    };
  }
}
