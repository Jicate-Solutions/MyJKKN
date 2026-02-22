// WhatsApp Connection Service
// Maps to wa_phone_numbers table — a "connection" is a WABA phone number entry

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface ConnectionStatus {
  isConnected: boolean;
  qrCode?: string;
  phoneNumber?: string;
  lastConnected?: string;
}

export interface WhatsAppConnection {
  id: string;
  institution_id: string;
  session_id: string;      // Maps to phone_number_id
  status: string;          // Derived from is_active
  phone_number?: string;   // Maps to display_number
  push_name?: string;      // Maps to verified_name
  jid?: string;            // Maps to business_account_id
  connected_at?: string;   // Maps to created_at
  error_message?: string;
  created_at: string;
  updated_at: string;
}

// Raw DB row shape from wa_phone_numbers
interface WAPhoneNumberRow {
  id: string;
  institution_id: string;
  phone_number_id: string;
  business_account_id: string;
  display_number: string;
  verified_name: string | null;
  quality_rating: string;
  messaging_limit: string;
  is_primary: boolean;
  is_active: boolean;
  access_token_encrypted: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Service client
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
// Row <-> Connection mapping
// =============================================================================

function rowToConnection(row: WAPhoneNumberRow): WhatsAppConnection {
  return {
    id: row.id,
    institution_id: row.institution_id,
    session_id: row.phone_number_id,
    status: row.is_active ? 'connected' : 'disconnected',
    phone_number: row.display_number,
    push_name: row.verified_name || undefined,
    jid: row.business_account_id,
    connected_at: row.created_at,
    error_message: undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// =============================================================================
// Service
// =============================================================================

export class WhatsAppConnectionService {
  /**
   * Check if institution has an active wa_phone_numbers entry
   */
  static async getConnectionStatus(institutionId: string): Promise<ConnectionStatus> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_phone_numbers')
      .select('id, display_number, is_active, created_at')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .eq('is_primary', true)
      .maybeSingle();

    if (error) {
      console.error('[WhatsAppConnectionService] getConnectionStatus error:', error.message);
      return { isConnected: false };
    }

    if (!data) {
      return { isConnected: false };
    }

    return {
      isConnected: true,
      phoneNumber: data.display_number,
      lastConnected: data.created_at,
    };
  }

  /**
   * Get the primary WABA phone number for an institution
   */
  static async getConnectionByInstitution(institutionId: string): Promise<WhatsAppConnection | null> {
    const supabase = getServiceClient();

    // Try primary first, then any active number
    const { data, error } = await supabase
      .from('wa_phone_numbers')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[WhatsAppConnectionService] getConnectionByInstitution error:', error.message);
      return null;
    }

    if (!data) return null;
    return rowToConnection(data as WAPhoneNumberRow);
  }

  /**
   * Update a wa_phone_numbers row
   */
  static async updateConnection(connectionId: string, data: Partial<WhatsAppConnection>): Promise<WhatsAppConnection | null> {
    const supabase = getServiceClient();

    // Map Connection fields back to DB columns
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.phone_number !== undefined) updateData.display_number = data.phone_number;
    if (data.push_name !== undefined) updateData.verified_name = data.push_name;
    if (data.jid !== undefined) updateData.business_account_id = data.jid;
    if (data.session_id !== undefined) updateData.phone_number_id = data.session_id;
    if (data.status !== undefined) updateData.is_active = data.status === 'connected';

    const { data: row, error } = await supabase
      .from('wa_phone_numbers')
      .update(updateData)
      .eq('id', connectionId)
      .select()
      .single();

    if (error) {
      console.error('[WhatsAppConnectionService] updateConnection error:', error.message);
      return null;
    }

    return rowToConnection(row as WAPhoneNumberRow);
  }

  /**
   * Insert a new wa_phone_numbers row
   */
  static async createConnection(data: Partial<WhatsAppConnection>): Promise<WhatsAppConnection | null> {
    const supabase = getServiceClient();

    if (!data.institution_id || !data.session_id) {
      console.error('[WhatsAppConnectionService] createConnection: institution_id and session_id (phone_number_id) are required');
      return null;
    }

    const insertData = {
      institution_id: data.institution_id,
      phone_number_id: data.session_id,
      business_account_id: data.jid || '',
      display_number: data.phone_number || '',
      verified_name: data.push_name || null,
      is_active: data.status === 'connected',
      is_primary: false, // Default; caller must explicitly set primary
    };

    const { data: row, error } = await supabase
      .from('wa_phone_numbers')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[WhatsAppConnectionService] createConnection error:', error.message);
      return null;
    }

    return rowToConnection(row as WAPhoneNumberRow);
  }

  /**
   * Delete a wa_phone_numbers row
   */
  static async deleteConnection(connectionId: string): Promise<boolean> {
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('wa_phone_numbers')
      .delete()
      .eq('id', connectionId);

    if (error) {
      console.error('[WhatsAppConnectionService] deleteConnection error:', error.message);
      return false;
    }

    return true;
  }

  /**
   * Grant access to a WABA connection for a user.
   * Uses user_institution_access table — if user belongs to the institution,
   * they can access the institution's WABA numbers (RLS handles this).
   */
  static async grantAccess(params: {
    connection_id: string;
    profile_id: string;
    granted_by?: string;
    access_level?: string;
    can_send_messages?: boolean;
    can_view_conversations?: boolean;
    can_manage_templates?: boolean;
    can_manage_settings?: boolean;
  }, _userId?: string): Promise<void> {
    // Access is controlled by institution membership via RLS on wa_phone_numbers.
    // The RLS policy checks user_institution_access. So granting access means
    // ensuring the user is in user_institution_access for the institution.
    const supabase = getServiceClient();

    // Get the connection's institution_id
    const { data: connection } = await supabase
      .from('wa_phone_numbers')
      .select('institution_id')
      .eq('id', params.connection_id)
      .single();

    if (!connection) {
      throw new Error('Connection not found');
    }

    // Check if access already exists
    const { data: existing } = await supabase
      .from('user_institution_access')
      .select('id')
      .eq('user_id', params.profile_id)
      .eq('institution_id', connection.institution_id)
      .maybeSingle();

    if (!existing) {
      // Insert access record
      const { error } = await supabase
        .from('user_institution_access')
        .insert({
          user_id: params.profile_id,
          institution_id: connection.institution_id,
        });

      if (error) {
        console.error('[WhatsAppConnectionService] grantAccess error:', error.message);
        throw new Error(`Failed to grant access: ${error.message}`);
      }
    }
  }

  /**
   * Revoke access to a WABA connection for a user.
   */
  static async revokeAccess(connectionId: string, profileId: string): Promise<void> {
    return this.revokeAccessByConnectionAndProfile(connectionId, profileId);
  }

  /**
   * Revoke access by removing user from user_institution_access.
   * NOTE: This removes institution-level access, not just WABA access.
   * Use with caution.
   */
  static async revokeAccessByConnectionAndProfile(connectionId: string, profileId: string): Promise<void> {
    const supabase = getServiceClient();

    // Get institution_id from the connection
    const { data: connection } = await supabase
      .from('wa_phone_numbers')
      .select('institution_id')
      .eq('id', connectionId)
      .single();

    if (!connection) {
      throw new Error('Connection not found');
    }

    const { error } = await supabase
      .from('user_institution_access')
      .delete()
      .eq('user_id', profileId)
      .eq('institution_id', connection.institution_id);

    if (error) {
      console.error('[WhatsAppConnectionService] revokeAccess error:', error.message);
      throw new Error(`Failed to revoke access: ${error.message}`);
    }
  }

  /**
   * List users who have access to a connection's institution.
   */
  static async listAccessGrantees(connectionId: string): Promise<any[]> {
    const supabase = getServiceClient();

    // Get institution_id from the connection
    const { data: connection } = await supabase
      .from('wa_phone_numbers')
      .select('institution_id')
      .eq('id', connectionId)
      .single();

    if (!connection) return [];

    const { data, error } = await supabase
      .from('user_institution_access')
      .select('user_id, created_at')
      .eq('institution_id', connection.institution_id);

    if (error) {
      console.error('[WhatsAppConnectionService] listAccessGrantees error:', error.message);
      return [];
    }

    return data || [];
  }

  /**
   * Check if user has access to an institution's WABA numbers.
   * Uses profiles table to check institution membership.
   */
  static async checkUserAccessByInstitution(
    userId: string,
    institutionId: string,
    _requiredLevel: 'view' | 'send' | 'admin'
  ): Promise<boolean> {
    const supabase = getServiceClient();

    // Check if user belongs to the institution via profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', userId)
      .single();

    if (profile?.institution_id === institutionId) {
      return true;
    }

    // Also check user_institution_access table
    const { data: access } = await supabase
      .from('user_institution_access')
      .select('id')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .maybeSingle();

    return !!access;
  }

  /**
   * Check if user has access to a specific WABA connection.
   */
  static async checkUserAccess(
    userId: string,
    connectionId: string,
    requiredLevel: 'view' | 'send' | 'admin'
  ): Promise<boolean> {
    const supabase = getServiceClient();

    // Get the connection's institution_id
    const { data: connection } = await supabase
      .from('wa_phone_numbers')
      .select('institution_id')
      .eq('id', connectionId)
      .single();

    if (!connection) return false;

    return this.checkUserAccessByInstitution(userId, connection.institution_id, requiredLevel);
  }

  /**
   * Connect: Activate a WABA number for the institution.
   * Sets is_active = true on the primary number.
   * Returns empty qrCode since WABA uses Cloud API (no QR needed).
   */
  static async connect(institutionId: string): Promise<{ qrCode: string }> {
    const supabase = getServiceClient();

    // Activate the primary number (or the most recent one)
    const { data: number } = await supabase
      .from('wa_phone_numbers')
      .select('id')
      .eq('institution_id', institutionId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (number) {
      await supabase
        .from('wa_phone_numbers')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', number.id);
    }

    // WABA Cloud API doesn't use QR codes — connection is via API token
    return { qrCode: '' };
  }

  /**
   * Disconnect: Deactivate all WABA numbers for the institution.
   */
  static async disconnect(institutionId: string): Promise<void> {
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('wa_phone_numbers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[WhatsAppConnectionService] disconnect error:', error.message);
      throw new Error(`Failed to disconnect: ${error.message}`);
    }
  }

  /**
   * Refresh QR Code — not applicable for WABA Cloud API.
   * WABA uses access tokens, not QR codes.
   */
  static async refreshQRCode(_institutionId: string): Promise<{ qrCode: string }> {
    // WABA Cloud API doesn't use QR codes
    return { qrCode: '' };
  }
}

// Export standalone functions for compatibility
export async function getConnectionStatus(institutionId: string): Promise<ConnectionStatus> {
  return WhatsAppConnectionService.getConnectionStatus(institutionId);
}

export async function connect(institutionId: string): Promise<{ qrCode: string }> {
  return WhatsAppConnectionService.connect(institutionId);
}

export async function disconnect(institutionId: string): Promise<void> {
  return WhatsAppConnectionService.disconnect(institutionId);
}

export async function refreshQRCode(institutionId: string): Promise<{ qrCode: string }> {
  return WhatsAppConnectionService.refreshQRCode(institutionId);
}
