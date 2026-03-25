// lib/services/whatsapp/whatsapp-consent-service.ts
// WhatsApp Opt-in Consent Tracking — DPDPA 2023 / TCCCPR / Meta Policy compliance
// Gap 2 — P0 Critical

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export type ConsentSource =
  | 'website_form'
  | 'whatsapp_inbound'
  | 'manual'
  | 'import'
  | 'chatbot'
  | 'keyword_stop';

export interface ConsentStatus {
  hasConsent: boolean;
  optInAt: string | null;
  source: string | null;
}

export interface ConsentLogEntry {
  id: string;
  institution_id: string;
  lead_id: string;
  action: 'opt_in' | 'opt_out';
  source: string;
  ip_address: string | null;
  user_agent: string | null;
  performed_by: string | null;
  created_at: string;
}

export interface ConsentStats {
  total_leads: number;
  opted_in: number;
  opted_out: number;
  never_set: number;
  opt_in_rate: number;
}

export interface GrantConsentParams {
  leadId: string;
  institutionId: string;
  source: ConsentSource;
  performedBy?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RevokeConsentParams {
  leadId: string;
  institutionId: string;
  source: string;
  performedBy?: string;
}

// =============================================================================
// Service Client
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// STOP keywords that trigger automatic opt-out
const STOP_KEYWORDS = ['stop', 'unsubscribe', 'opt out', 'opt-out', 'cancel', 'remove'];

// =============================================================================
// Service
// =============================================================================

export class WhatsAppConsentService {
  /**
   * Check if a lead has opted in to WhatsApp messaging
   */
  static async checkConsent(leadId: string): Promise<ConsentStatus> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('admission_leads')
      .select('wa_opt_in, wa_opt_in_at, wa_opt_in_source')
      .eq('id', leadId)
      .single();

    if (error) {
      console.error('[wa-consent] Failed to check consent:', error);
      return { hasConsent: false, optInAt: null, source: null };
    }

    return {
      hasConsent: data.wa_opt_in ?? false,
      optInAt: data.wa_opt_in_at || null,
      source: data.wa_opt_in_source || null,
    };
  }

  /**
   * Grant WhatsApp opt-in consent for a lead
   */
  static async grantConsent(params: GrantConsentParams): Promise<void> {
    const supabase = getServiceClient();

    // Update lead record
    const { error: updateError } = await supabase
      .from('admission_leads')
      .update({
        wa_opt_in: true,
        wa_opt_in_at: new Date().toISOString(),
        wa_opt_in_source: params.source,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.leadId);

    if (updateError) {
      console.error('[wa-consent] Failed to grant consent:', updateError);
      throw new Error('Failed to grant consent');
    }

    // Log the consent action
    const { error: logError } = await supabase
      .from('wa_consent_log')
      .insert({
        institution_id: params.institutionId,
        lead_id: params.leadId,
        action: 'opt_in',
        source: params.source,
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
        performed_by: params.performedBy || null,
      });

    if (logError) {
      console.error('[wa-consent] Failed to log consent grant:', logError);
    }
  }

  /**
   * Revoke WhatsApp consent for a lead
   */
  static async revokeConsent(params: RevokeConsentParams): Promise<void> {
    const supabase = getServiceClient();

    // Update lead record
    const { error: updateError } = await supabase
      .from('admission_leads')
      .update({
        wa_opt_in: false,
        wa_opt_out_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.leadId);

    if (updateError) {
      console.error('[wa-consent] Failed to revoke consent:', updateError);
      throw new Error('Failed to revoke consent');
    }

    // Log the consent action
    const { error: logError } = await supabase
      .from('wa_consent_log')
      .insert({
        institution_id: params.institutionId,
        lead_id: params.leadId,
        action: 'opt_out',
        source: params.source,
        performed_by: params.performedBy || null,
      });

    if (logError) {
      console.error('[wa-consent] Failed to log consent revocation:', logError);
    }
  }

  /**
   * Auto-grant consent when a prospect sends JKKN a WhatsApp message first (implicit consent).
   * Only grants if wa_opt_in is currently false.
   */
  static async autoGrantOnInbound(leadId: string, institutionId: string): Promise<void> {
    const supabase = getServiceClient();

    // Check current status — only grant if not already opted in
    const { data } = await supabase
      .from('admission_leads')
      .select('wa_opt_in')
      .eq('id', leadId)
      .single();

    if (data?.wa_opt_in) {
      return; // Already opted in
    }

    await this.grantConsent({
      leadId,
      institutionId,
      source: 'whatsapp_inbound',
    });
  }

  /**
   * Handle STOP keyword — revoke consent when inbound message matches stop keywords.
   */
  static async handleStopKeyword(leadId: string, institutionId: string): Promise<void> {
    await this.revokeConsent({
      leadId,
      institutionId,
      source: 'keyword_stop',
    });
  }

  /**
   * Check if a message text contains a STOP keyword
   */
  static isStopKeyword(text: string): boolean {
    const normalized = text.toLowerCase().trim();
    return STOP_KEYWORDS.some((kw) => normalized.includes(kw));
  }

  /**
   * Get consent audit log for a lead
   */
  static async getConsentLog(leadId: string): Promise<ConsentLogEntry[]> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_consent_log')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[wa-consent] Failed to fetch consent log:', error);
      return [];
    }

    return (data as ConsentLogEntry[]) || [];
  }

  /**
   * Get consent statistics for an institution
   */
  static async getConsentStats(institutionId: string): Promise<ConsentStats> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('admission_leads')
      .select('wa_opt_in, wa_opt_out_at')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[wa-consent] Failed to fetch consent stats:', error);
      return {
        total_leads: 0,
        opted_in: 0,
        opted_out: 0,
        never_set: 0,
        opt_in_rate: 0,
      };
    }

    const leads = data || [];
    const totalLeads = leads.length;
    const optedIn = leads.filter((l) => l.wa_opt_in === true).length;
    // Opted out = had opted in before (has opt_out_at) but currently not opted in
    const optedOut = leads.filter((l) => l.wa_opt_in === false && l.wa_opt_out_at !== null).length;
    const neverSet = leads.filter((l) => l.wa_opt_in === false && l.wa_opt_out_at === null).length;

    return {
      total_leads: totalLeads,
      opted_in: optedIn,
      opted_out: optedOut,
      never_set: neverSet,
      opt_in_rate: totalLeads > 0 ? Math.round((optedIn / totalLeads) * 100) : 0,
    };
  }
}
