// lib/services/whatsapp/whatsapp-personal-connection-service.ts
// Manages wa_personal_connections table — one row per institution

import { createClient } from '@supabase/supabase-js';
import type {
  PersonalWhatsAppConnection,
  PersonalConnectionState,
} from '@/types/whatsapp-personal';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class WhatsAppPersonalConnectionService {
  static async getConnection(
    institutionId: string
  ): Promise<PersonalWhatsAppConnection | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_personal_connections')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (error) {
      console.error('[whatsapp-personal] getConnection error:', error.message);
      return null;
    }
    return data as PersonalWhatsAppConnection | null;
  }

  static async upsertConnection(
    institutionId: string,
    updates: Partial<PersonalWhatsAppConnection>
  ): Promise<PersonalWhatsAppConnection | null> {
    const supabase = getServiceClient();
    const { id: _id, institution_id: _inst, created_at: _ca, updated_at: _ua, ...payload } =
      updates as any;

    const { data, error } = await supabase
      .from('wa_personal_connections')
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
      console.error('[whatsapp-personal] upsertConnection error:', error.message);
      return null;
    }
    return data as PersonalWhatsAppConnection;
  }

  static async updateStatus(
    institutionId: string,
    status: PersonalConnectionState,
    extra?: { phone_number?: string; push_name?: string; connected_by?: string }
  ): Promise<void> {
    const supabase = getServiceClient();
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'ready') {
      updateData.connected_at = new Date().toISOString();
      if (extra?.phone_number) updateData.phone_number = extra.phone_number;
      if (extra?.push_name) updateData.push_name = extra.push_name;
      if (extra?.connected_by) updateData.connected_by = extra.connected_by;
    }
    if (status === 'disconnected') {
      updateData.disconnected_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('wa_personal_connections')
      .update(updateData)
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[whatsapp-personal] updateStatus error:', error.message);
    }
  }

  /** Find any connection with status 'ready' (for multi-institution users) */
  static async getAnyReadyConnection(): Promise<PersonalWhatsAppConnection | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_personal_connections')
      .select('*')
      .eq('status', 'ready')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[whatsapp-personal] getAnyReadyConnection error:', error.message);
      return null;
    }
    return data as PersonalWhatsAppConnection | null;
  }

  static async deleteConnection(institutionId: string): Promise<boolean> {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from('wa_personal_connections')
      .delete()
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[whatsapp-personal] deleteConnection error:', error.message);
      return false;
    }
    return true;
  }

  static async isConnected(institutionId: string): Promise<boolean> {
    const conn = await this.getConnection(institutionId);
    return conn?.status === 'ready';
  }
}
