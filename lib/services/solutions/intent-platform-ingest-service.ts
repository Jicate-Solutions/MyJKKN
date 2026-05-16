// lib/services/solutions/intent-platform-ingest-service.ts
// Phase C4 — Inbound Intent Platform → sh_prospects ingestion.
//
// Verifies HMAC-SHA256 signatures from the Intent Platform, then idempotently
// upserts a prospect row keyed by intent_lead_id. The receiving API route
// (app/api/integrations/intent-platform/prospects/route.ts) is the only
// consumer — never call this from user-facing UI.
//
// Env: INTENT_PLATFORM_WEBHOOK_SECRET (must be set in Vercel; HMAC fails closed
//      if missing).

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/client';

// ============================================================================
// PUBLIC TYPES
// ============================================================================

/**
 * Inbound webhook payload shape sent by the Intent Platform when a prospect
 * lead is ready to flow into MyJKKN's Solutions Hub pipeline.
 *
 * Required fields are the bare minimum needed to create an actionable prospect
 * row (sh_prospects has NOT NULL on company_name / contact_person /
 * contact_phone). Optional fields enrich the row but never block ingestion.
 *
 * `solution_type_interest` MUST match an enum value in sh_solution_type:
 *   software | training | content | consulting | research | audit
 */
export interface IntentLeadPayload {
  intent_lead_id: string;
  company_name: string;
  contact_person: string;
  contact_phone: string;
  contact_email?: string;
  expected_deal_size?: number;
  expected_close_date?: string; // ISO YYYY-MM-DD
  solution_type_interest?:
    | 'software'
    | 'training'
    | 'content'
    | 'consulting'
    | 'research'
    | 'audit';
  intent_agency_id?: string; // UUID
  source?: string;           // free-text source label, stored on source_detail
  notes?: string;
}

export interface IngestResult {
  prospect_id: string;
  prospect_code: string;
  action: 'created' | 'updated';
}

// ============================================================================
// SERVICE
// ============================================================================

export class IntentPlatformIngestService {
  /**
   * Constant-time HMAC-SHA256 verification of the raw request body against
   * the X-Intent-Signature header. Fails closed (returns false) if the
   * INTENT_PLATFORM_WEBHOOK_SECRET env var is missing or the signature does
   * not exactly match.
   *
   * Always pass the raw request body BEFORE JSON.parse — re-stringifying
   * `request.json()` will reorder keys and break the signature.
   */
  static verifySignature(rawBody: string, headerSig: string | null | undefined): boolean {
    const secret = process.env.INTENT_PLATFORM_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[intent-platform/ingest] INTENT_PLATFORM_WEBHOOK_SECRET is not configured; rejecting all webhooks');
      return false;
    }
    if (!headerSig || typeof headerSig !== 'string') {
      return false;
    }

    // Allow optional `sha256=` prefix (common HMAC header convention).
    const cleanSig = headerSig.startsWith('sha256=') ? headerSig.slice(7) : headerSig;

    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    // timingSafeEqual requires equal-length buffers. Bail early on length
    // mismatch so we never throw before the comparison.
    const computedBuf = Buffer.from(computed, 'utf8');
    const providedBuf = Buffer.from(cleanSig, 'utf8');
    if (computedBuf.length !== providedBuf.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(computedBuf, providedBuf);
    } catch {
      // timingSafeEqual can still throw on non-Buffer inputs in edge runtimes.
      return false;
    }
  }

  /**
   * Idempotently upsert a prospect row keyed by intent_lead_id.
   * Uses the partial unique index added in migration
   * 20260502000003_add_intent_columns_to_prospects.sql.
   *
   * - On insert: generates a JKKN-PRO-YYYY-NNN prospect_code via the same
   *   convention as ProspectsService.generateProspectCode.
   * - On conflict (intent_lead_id match): UPDATE the mutable fields and
   *   keep the original prospect_code (it must NEVER change).
   *
   * Returns {prospect_id, prospect_code, action}.
   */
  static async ingestLead(payload: IntentLeadPayload): Promise<IngestResult> {
    const supabase = createAdminClient();

    // 1. Existence check — drives "created" vs "updated" outcome AND lets us
    //    preserve prospect_code on update without round-tripping to the DB
    //    twice.
    const { data: existing, error: lookupError } = await supabase
      .from('sh_prospects')
      .select('id, prospect_code')
      .eq('intent_lead_id', payload.intent_lead_id)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Failed to look up existing prospect: ${lookupError.message}`);
    }

    // 2. Generate code only if we are creating a new row.
    const prospectCode = existing?.prospect_code
      ?? (await this.generateProspectCode(supabase));

    const baseRow: Record<string, unknown> = {
      prospect_code: prospectCode,
      company_name: payload.company_name,
      contact_person: payload.contact_person,
      contact_email: payload.contact_email ?? null,
      contact_phone: payload.contact_phone,
      source_type: 'intent', // sh_source_type enum value
      source_detail: payload.source ?? 'intent_platform',
      expected_deal_size: payload.expected_deal_size ?? null,
      expected_close_date: payload.expected_close_date ?? null,
      solution_type_interest: payload.solution_type_interest ?? null,
      intent_agency_id: payload.intent_agency_id ?? null,
      intent_lead_id: payload.intent_lead_id,
      notes: payload.notes ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // 3. UPSERT keyed by the intent_lead_id partial-unique index.
    const { data, error } = await supabase
      .from('sh_prospects')
      .upsert(baseRow, {
        onConflict: 'intent_lead_id',
        ignoreDuplicates: false,
      })
      .select('id, prospect_code')
      .single();

    if (error || !data) {
      throw new Error(`Failed to upsert prospect from Intent Platform: ${error?.message ?? 'no row returned'}`);
    }

    return {
      prospect_id: data.id,
      prospect_code: data.prospect_code,
      action: existing ? 'updated' : 'created',
    };
  }

  /**
   * Mirror of ProspectsService.generateProspectCode — duplicated here so the
   * webhook ingestion pathway has zero coupling to the user-facing service
   * (and zero risk of session/RLS interference). Format: JKKN-PRO-YYYY-NNN.
   */
  private static async generateProspectCode(
    supabase: ReturnType<typeof createAdminClient>,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JKKN-PRO-${year}-`;

    const { data } = await supabase
      .from('sh_prospects')
      .select('prospect_code')
      .like('prospect_code', `${prefix}%`)
      .order('prospect_code', { ascending: false })
      .limit(1);

    const lastNum = data?.[0]?.prospect_code
      ? parseInt(data[0].prospect_code.replace(prefix, ''), 10)
      : 0;

    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
  }
}
