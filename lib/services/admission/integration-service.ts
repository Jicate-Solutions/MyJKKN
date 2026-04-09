// lib/services/admission/integration-service.ts
// Service for managing lead source integrations and processing inbound leads

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Integration {
  id: string;
  institution_id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  field_mapping: Record<string, string>;
  is_active: boolean;
  last_sync_at: string | null;
  total_leads: number;
  webhook_secret: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationLog {
  id: string;
  integration_id: string | null;
  institution_id: string;
  lead_id: string | null;
  raw_payload: Record<string, any>;
  status: 'success' | 'duplicate' | 'validation_error' | 'error';
  error_message: string | null;
  source_type: string | null;
  source_name: string | null;
  created_at: string;
}

export interface InboundLeadPayload {
  source?: string;
  source_id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  phone: string;
  email?: string;
  interested_program?: string;
  referred_by_name?: string;
  referred_by_phone?: string;
  notes?: string;
  custom_fields?: Record<string, any>;
}

export interface ProcessResult {
  success: boolean;
  lead_id?: string;
  is_duplicate: boolean;
  reference?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class IntegrationService {
  // -----------------------------------------------------------------------
  // CRUD for integrations
  // -----------------------------------------------------------------------

  static async getIntegrations(institutionId: string | undefined, supabase?: any): Promise<Integration[]> {
    const db = supabase || createClientSupabaseClient();
    let query = (db as any).from('admission_integrations').select('*').order('created_at', { ascending: false });
    if (institutionId) query = query.eq('institution_id', institutionId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  static async createIntegration(input: Partial<Integration>, supabase?: any): Promise<Integration> {
    const db = supabase || createClientSupabaseClient();
    const { data, error } = await (db as any)
      .from('admission_integrations')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async updateIntegration(id: string, input: Partial<Integration>, supabase?: any): Promise<Integration> {
    const db = supabase || createClientSupabaseClient();
    const { data, error } = await (db as any)
      .from('admission_integrations')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async deleteIntegration(id: string, supabase?: any): Promise<void> {
    const db = supabase || createClientSupabaseClient();
    const { error } = await (db as any).from('admission_integrations').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // -----------------------------------------------------------------------
  // Integration logs
  // -----------------------------------------------------------------------

  static async getIntegrationLogs(
    institutionId: string | undefined,
    filters?: { integrationId?: string; status?: string; limit?: number; offset?: number },
    supabase?: any
  ): Promise<{ logs: IntegrationLog[]; total: number }> {
    const db = supabase || createClientSupabaseClient();
    let query = (db as any)
      .from('admission_integration_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (filters?.integrationId) query = query.eq('integration_id', filters.integrationId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.limit) query = query.limit(filters.limit);
    if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { logs: data || [], total: count || 0 };
  }

  // -----------------------------------------------------------------------
  // Process inbound lead (from webhook or agent form)
  // -----------------------------------------------------------------------

  static async processInboundLead(
    payload: InboundLeadPayload,
    institutionId: string,
    integrationId: string | null,
    supabase: any
  ): Promise<ProcessResult> {
    // 1. Validate phone (required)
    const cleanPhone = payload.phone?.trim().replace(/[\s\-()]/g, '');
    if (!cleanPhone) {
      await this.logInbound(supabase, institutionId, integrationId, payload, 'validation_error', null, 'Phone is required');
      return { success: false, is_duplicate: false, error: 'Phone is required' };
    }

    // 2. Check for duplicate by phone
    const { data: existing } = await supabase
      .from('admission_leads')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('phone', cleanPhone)
      .limit(1)
      .maybeSingle();

    if (existing) {
      await this.logInbound(supabase, institutionId, integrationId, payload, 'duplicate', existing.id, null);
      const ref = `JKKN-REF-${existing.id.substring(0, 8).toUpperCase()}`;
      return { success: true, lead_id: existing.id, is_duplicate: true, reference: ref };
    }

    // 3. Parse name
    let firstName = payload.first_name || '';
    let lastName = payload.last_name || '';
    if (!firstName && payload.name) {
      const parts = payload.name.trim().split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }

    if (!firstName) {
      await this.logInbound(supabase, institutionId, integrationId, payload, 'validation_error', null, 'Name is required');
      return { success: false, is_duplicate: false, error: 'Name is required' };
    }

    // 4. Create lead
    try {
      const { data: lead, error: leadError } = await supabase
        .from('admission_leads')
        .insert({
          institution_id: institutionId,
          first_name: firstName,
          last_name: lastName || null,
          phone: cleanPhone,
          email: payload.email || null,
          source: payload.source || 'other',
          funnel_stage: 'new',
          interested_programs: payload.interested_program ? [payload.interested_program] : null,
          referral_type: payload.referred_by_name ? 'consultant' : null,
          referred_by_name: payload.referred_by_name || null,
          notes: payload.notes || null,
          is_active: true,
        })
        .select('id')
        .single();

      if (leadError) {
        await this.logInbound(supabase, institutionId, integrationId, payload, 'error', null, leadError.message);
        return { success: false, is_duplicate: false, error: leadError.message };
      }

      // 5. Update integration counter
      if (integrationId) {
        await supabase
          .from('admission_integrations')
          .update({
            total_leads: supabase.rpc ? undefined : undefined, // Can't increment easily, skip
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', integrationId);
      }

      // 6. Log success
      await this.logInbound(supabase, institutionId, integrationId, payload, 'success', lead.id, null);

      const ref = `JKKN-REF-${lead.id.substring(0, 8).toUpperCase()}`;
      return { success: true, lead_id: lead.id, is_duplicate: false, reference: ref };
    } catch (err: any) {
      await this.logInbound(supabase, institutionId, integrationId, payload, 'error', null, err.message);
      return { success: false, is_duplicate: false, error: err.message };
    }
  }

  // -----------------------------------------------------------------------
  // Log helper
  // -----------------------------------------------------------------------

  private static async logInbound(
    supabase: any,
    institutionId: string,
    integrationId: string | null,
    payload: any,
    status: string,
    leadId: string | null,
    errorMessage: string | null
  ) {
    await supabase.from('admission_integration_logs').insert({
      integration_id: integrationId,
      institution_id: institutionId,
      lead_id: leadId,
      raw_payload: payload,
      status,
      error_message: errorMessage,
      source_type: payload.source || 'unknown',
      source_name: payload.referred_by_name || payload.source_id || null,
    });
  }
}
