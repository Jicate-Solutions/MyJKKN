// app/actions/whatsapp/connection-actions.ts
// Server actions for WhatsApp connection management

'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppConnectionService } from '@/lib/services/whatsapp/whatsapp-connection-service';
import { WhatsAppSettingsService } from '@/lib/services/whatsapp/whatsapp-settings-service';
import {
  getConnectionStatus as getServiceConnectionStatus,
  initializeConnection as serviceInitializeConnection,
  disconnectSession as serviceDisconnectSession
} from '@/lib/services/whatsapp/whatsapp-api-client';
import type {
  WhatsAppConnection,
  WhatsAppSettings,
  WhatsAppServiceStatus
} from '@/types/whatsapp';

// Response types
interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface InitConnectionResponse {
  connection: WhatsAppConnection;
  qrCode?: string;
  status: string;
}

interface ConnectionStatusActionResponse {
  connection: WhatsAppConnection | null;
  serviceStatus: WhatsAppServiceStatus | null;
  isConnected: boolean;
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
 * Check if user has admin permissions for WhatsApp
 */
async function checkAdminPermission(userId: string, institutionId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .eq('institution_id', institutionId)
    .single();

  if (!profile) return false;

  // Admin roles that can manage WhatsApp connection
  const adminRoles = ['super_admin', 'institution_admin', 'admin', 'administrator'];
  return adminRoles.includes(profile.role);
}

/**
 * Get WhatsApp connection status for current institution
 */
export async function getConnectionStatus(): Promise<ActionResponse<ConnectionStatusActionResponse>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check if user has access (either admin or shared access)
    const isAdmin = await checkAdminPermission(userId, institutionId);
    // Skip shared access check for now since it also uses browser client
    // const hasSharedAccess = await WhatsAppConnectionService.checkUserAccessByInstitution(userId, institutionId);

    if (!isAdmin) {
      return {
        success: false,
        error: 'You do not have access to WhatsApp for this institution'
      };
    }

    // Use server client for DB operations (service class uses browser client which lacks auth context)
    const supabase = await createServerSupabaseClient();

    // Get connection from database using server client
    const { data: connection, error: selectError } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (selectError) {
      console.error('[whatsapp/actions] Error getting connection:', selectError);
      throw new Error(selectError.message);
    }

    // If no connection exists, return empty state
    if (!connection) {
      return {
        success: true,
        data: {
          connection: null,
          serviceStatus: null,
          isConnected: false
        }
      };
    }

    let serviceStatus: WhatsAppServiceStatus | null = null;

    // If we have a session ID, check actual status from WhatsApp service
    if (connection.session_id) {
      try {
        serviceStatus = await getServiceConnectionStatus(connection.session_id);

        // Update connection status if it changed (use server client)
        if (serviceStatus.status !== connection.status) {
          if (serviceStatus.status === 'ready') {
            // Update to ready status - phone may or may not be available
            // (Railway yi-connect doesn't return phone in /status)
            const updateData: Record<string, unknown> = {
              status: 'ready',
              connected_at: connection.connected_at || new Date().toISOString(),
              connected_by: connection.connected_by || userId,
              error_message: null,
              updated_at: new Date().toISOString()
            };

            // Only update phone info if provided
            if (serviceStatus.phone) {
              updateData.phone_number = serviceStatus.phone;
              updateData.push_name = serviceStatus.pushName || null;
              updateData.jid = serviceStatus.jid || null;
            }

            await supabase
              .from('whatsapp_connections')
              .update(updateData)
              .eq('id', connection.id);

            // Update local connection object to reflect new status
            connection.status = 'ready';
            if (serviceStatus.phone) {
              connection.phone_number = serviceStatus.phone;
              connection.push_name = serviceStatus.pushName || null;
              connection.jid = serviceStatus.jid || null;
            }
          } else if (serviceStatus.status === 'disconnected') {
            await supabase
              .from('whatsapp_connections')
              .update({
                status: 'disconnected',
                disconnected_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', connection.id);
            connection.status = 'disconnected';
          } else if (serviceStatus.status === 'qr_ready' && serviceStatus.qr) {
            // Update last_qr_at when QR is available
            await supabase
              .from('whatsapp_connections')
              .update({
                status: 'qr_ready',
                last_qr_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', connection.id);
            connection.status = 'qr_ready';
          }
        }
      } catch (error) {
        console.warn('[whatsapp/actions] Could not reach WhatsApp service:', error);
        // Service might be down, but we still have DB state
      }
    }

    // Determine isConnected from either service status (most accurate) or DB status
    const isConnected = serviceStatus?.status === 'ready' || connection.status === 'ready';

    return {
      success: true,
      data: {
        connection,
        serviceStatus,
        isConnected
      }
    };
  } catch (error) {
    console.error('[whatsapp/actions] Error getting connection status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get connection status'
    };
  }
}

/**
 * Initialize WhatsApp connection (get QR code)
 */
export async function initializeConnection(): Promise<ActionResponse<InitConnectionResponse>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Only admins can initialize connection
    const isAdmin = await checkAdminPermission(userId, institutionId);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Only administrators can connect WhatsApp'
      };
    }

    // Use server client for all DB operations (service uses browser client which lacks auth context)
    const supabase = await createServerSupabaseClient();

    // Check if connection already exists using server client
    const { data: existingConnection, error: selectError } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (selectError) {
      console.error('[whatsapp/actions] Error checking existing connection:', selectError);
      throw new Error(selectError.message);
    }

    let connection: WhatsAppConnection;
    const sessionId = existingConnection?.session_id || `inst_${institutionId.replace(/-/g, '').slice(0, 12)}`;

    if (existingConnection) {
      // Connection exists - check if already connected
      if (existingConnection.status === 'ready') {
        return {
          success: true,
          data: {
            connection: existingConnection as WhatsAppConnection,
            status: 'already_connected'
          }
        };
      }

      // Update existing connection to connecting status
      const { data: updatedConnection, error: updateError } = await supabase
        .from('whatsapp_connections')
        .update({
          status: 'connecting',
          connected_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConnection.id)
        .select()
        .single();

      if (updateError) {
        console.error('[whatsapp/actions] Error updating connection:', updateError);
        throw new Error(updateError.message);
      }

      connection = updatedConnection as WhatsAppConnection;
    } else {
      // No connection exists - create new one
      const { data: newConnection, error: insertError } = await supabase
        .from('whatsapp_connections')
        .insert({
          institution_id: institutionId,
          session_id: sessionId,
          status: 'connecting',
          connected_by: userId
        })
        .select()
        .single();

      if (insertError) {
        console.error('[whatsapp/actions] Error creating connection:', insertError);
        throw new Error(insertError.message);
      }

      connection = newConnection as WhatsAppConnection;
    }

    // Initialize connection with WhatsApp service
    try {
      const initResult = await serviceInitializeConnection(sessionId);

      // Update connection status based on service response
      if (initResult.qr) {
        // QR code ready - waiting for scan
        const { data: qrConnection } = await supabase
          .from('whatsapp_connections')
          .update({
            last_qr_at: new Date().toISOString(),
            status: 'qr_ready',
            updated_at: new Date().toISOString()
          })
          .eq('id', connection.id)
          .select()
          .single();

        if (qrConnection) {
          connection = qrConnection as WhatsAppConnection;
        }
      } else if (initResult.status === 'ready') {
        // Already connected - update database to reflect this
        const { data: connectedConnection } = await supabase
          .from('whatsapp_connections')
          .update({
            status: 'ready',
            connected_at: connection.connected_at || new Date().toISOString(),
            phone_number: initResult.phone || connection.phone_number,
            push_name: initResult.pushName || connection.push_name,
            jid: initResult.jid || connection.jid,
            error_message: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', connection.id)
          .select()
          .single();

        if (connectedConnection) {
          connection = connectedConnection as WhatsAppConnection;
        }
      }

      revalidatePath('/whatsapp');

      return {
        success: true,
        data: {
          connection,
          qrCode: initResult.qr,
          status: initResult.status
        }
      };
    } catch (serviceError) {
      console.error('[whatsapp/actions] WhatsApp service error:', serviceError);

      // Mark connection as failed using server client
      await supabase
        .from('whatsapp_connections')
        .update({
          status: 'error',
          error_message: serviceError instanceof Error ? serviceError.message : 'Service unavailable',
          updated_at: new Date().toISOString()
        })
        .eq('id', connection.id);

      return {
        success: false,
        error: 'Could not connect to WhatsApp service. Please try again later.'
      };
    }
  } catch (error) {
    console.error('[whatsapp/actions] Error initializing connection:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize connection'
    };
  }
}

/**
 * Refresh QR code for pending connection
 */
export async function refreshQrCode(): Promise<ActionResponse<{ qrCode: string }>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Only admins can refresh QR
    const isAdmin = await checkAdminPermission(userId, institutionId);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Only administrators can manage WhatsApp connection'
      };
    }

    // Use server client for all DB operations
    const supabase = await createServerSupabaseClient();

    const { data: connection, error: selectError } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (selectError) {
      console.error('[whatsapp/actions] Error getting connection:', selectError);
      throw new Error(selectError.message);
    }

    if (!connection || !connection.session_id) {
      return {
        success: false,
        error: 'No pending connection found. Please start a new connection.'
      };
    }

    const result = await serviceInitializeConnection(connection.session_id);

    if (result.qr) {
      await supabase
        .from('whatsapp_connections')
        .update({
          last_qr_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', connection.id);

      return {
        success: true,
        data: { qrCode: result.qr }
      };
    }

    return {
      success: false,
      error: 'Could not generate QR code'
    };
  } catch (error) {
    console.error('[whatsapp/actions] Error refreshing QR code:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh QR code'
    };
  }
}

/**
 * Disconnect WhatsApp session
 */
export async function disconnectWhatsApp(): Promise<ActionResponse<void>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Only admins can disconnect
    const isAdmin = await checkAdminPermission(userId, institutionId);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Only administrators can disconnect WhatsApp'
      };
    }

    // Use server client for all DB operations
    const supabase = await createServerSupabaseClient();

    const { data: connection, error: selectError } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (selectError) {
      console.error('[whatsapp/actions] Error getting connection:', selectError);
      throw new Error(selectError.message);
    }

    if (!connection) {
      return {
        success: true // Already disconnected
      };
    }

    // Try to disconnect from service
    if (connection.session_id) {
      try {
        await serviceDisconnectSession(connection.session_id);
      } catch (serviceError) {
        console.warn('[whatsapp/actions] Could not disconnect from service:', serviceError);
        // Continue with local disconnect anyway
      }
    }

    // Update local status using server client
    await supabase
      .from('whatsapp_connections')
      .update({
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    revalidatePath('/whatsapp');

    return {
      success: true
    };
  } catch (error) {
    console.error('[whatsapp/actions] Error disconnecting WhatsApp:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to disconnect'
    };
  }
}

/**
 * Grant WhatsApp access to another user
 */
export async function grantWhatsAppAccess(
  targetUserId: string,
  permissions: {
    canSend?: boolean;
    canViewLogs?: boolean;
    canManageTemplates?: boolean;
  } = {}
): Promise<ActionResponse<void>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Only admins can grant access
    const isAdmin = await checkAdminPermission(userId, institutionId);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Only administrators can grant WhatsApp access'
      };
    }

    const connection = await WhatsAppConnectionService.getConnectionByInstitution(institutionId);
    if (!connection) {
      return {
        success: false,
        error: 'No WhatsApp connection exists for this institution'
      };
    }

    // Determine access level based on permissions
    let accessLevel: 'view' | 'send' | 'admin' = 'view';
    if (permissions.canManageTemplates) {
      accessLevel = 'admin';
    } else if (permissions.canSend) {
      accessLevel = 'send';
    }

    await WhatsAppConnectionService.grantAccess(
      {
        connection_id: connection.id,
        profile_id: targetUserId,
        access_level: accessLevel
      },
      userId
    );

    return {
      success: true
    };
  } catch (error) {
    console.error('[whatsapp/actions] Error granting access:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to grant access'
    };
  }
}

/**
 * Revoke WhatsApp access from a user
 */
export async function revokeWhatsAppAccess(targetUserId: string): Promise<ActionResponse<void>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Only admins can revoke access
    const isAdmin = await checkAdminPermission(userId, institutionId);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Only administrators can revoke WhatsApp access'
      };
    }

    const connection = await WhatsAppConnectionService.getConnectionByInstitution(institutionId);
    if (!connection) {
      return {
        success: true // No connection, nothing to revoke
      };
    }

    await WhatsAppConnectionService.revokeAccessByConnectionAndProfile(connection.id, targetUserId);

    return {
      success: true
    };
  } catch (error) {
    console.error('[whatsapp/actions] Error revoking access:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to revoke access'
    };
  }
}

/**
 * Get WhatsApp settings for current institution
 */
export async function getWhatsAppSettings(): Promise<ActionResponse<WhatsAppSettings>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Only admins can view settings
    const isAdmin = await checkAdminPermission(userId, institutionId);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Only administrators can view WhatsApp settings'
      };
    }

    const settings = await WhatsAppSettingsService.getOrCreateSettings(institutionId);

    return {
      success: true,
      data: settings
    };
  } catch (error) {
    console.error('[whatsapp/actions] Error getting settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get settings'
    };
  }
}

/**
 * Update WhatsApp settings
 */
export async function updateWhatsAppSettings(
  updates: Partial<{
    service_url: string | null;
    api_key: string | null;
    messages_per_minute: number;
    bulk_delay_ms: number;
    max_bulk_recipients: number;
    enable_bulk_messaging: boolean;
    enable_templates: boolean;
    enable_scheduled_messages: boolean;
    enable_auto_replies: boolean;
    notify_on_disconnect: boolean;
    notify_email: string | null;
    message_log_retention_days: number;
  }>
): Promise<ActionResponse<WhatsAppSettings>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Only admins can update settings
    const isAdmin = await checkAdminPermission(userId, institutionId);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Only administrators can update WhatsApp settings'
      };
    }

    // Ensure settings exist
    await WhatsAppSettingsService.getOrCreateSettings(institutionId);

    // Update settings
    const settings = await WhatsAppSettingsService.updateSettings(institutionId, updates);

    return {
      success: true,
      data: settings
    };
  } catch (error) {
    console.error('[whatsapp/actions] Error updating settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update settings'
    };
  }
}
