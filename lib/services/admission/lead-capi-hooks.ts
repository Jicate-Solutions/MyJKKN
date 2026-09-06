// lib/services/admission/lead-capi-hooks.ts
//
// =============================================================================
// PURPOSE
// =============================================================================
// Provides server-side hook functions that lead-creation / lead-conversion
// code paths CAN call to post a CAPI `Lead` event to Meta. This module DOES
// NOT modify the existing lead service — call sites opt in by importing
// `fireLeadCreatedCapi` etc. from here.
//
// Why a sibling module instead of inline edits to lead-service.ts?
//   - Keeps the CAPI substrate fully retractable. If we ever rip out Meta
//     attribution, deleting lib/meta/* + this hook file is the entire
//     surgery — no risk of clipping un-related lead-creation behaviour.
//   - Lets us wire CAPI into multiple call-sites (web form, WhatsApp lead
//     ingestion, COE-feed, …) without each one re-implementing the policy
//     resolve + audit-write boilerplate.
//
// Companion: lead-capi-hooks.USAGE.md — where to call these from.
//
// =============================================================================
// CALLER CONTRACT
// =============================================================================
//
//   - Always pass `leadId` — the hook uses `lead-${leadId}` as the dedupe
//     `event_id`. The browser Pixel call on the same admission page MUST
//     emit `fbq('track', 'Lead', {...}, { eventID: 'lead-' + leadId })` for
//     Meta to dedup the pair.
//   - Hooks NEVER throw. They resolve to a `CapiHookResult` carrying
//     `sent` + optional `error`. Treat them as fire-and-forget on the happy
//     path; only inspect the result if you want to log failures.
//   - PII inputs are plaintext — they're hashed inside the call chain. The
//     plaintext NEVER hits the database (only `user_data_hash` does, on the
//     audit row).

import {
  trackLead,
  trackPurchase,
  type CapiClientConfig,
  type CapiTrackInput,
} from '@/lib/meta/pixel-client';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

export interface CapiHookResult {
  sent: boolean;
  eventId?: string;
  reason?: string;
  responseStatus?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Resolver — reads policies via service role client (no auth context here
// since hooks may be called from server actions running as the lead's
// counselor, NOT necessarily a CAPI-admin).
// ---------------------------------------------------------------------------

interface ResolvedConfig {
  enabled: boolean;
  pixelId: string;
  accessToken: string;
  reason?: string;
}

async function resolveConfig(
  institutionId: string | null
): Promise<ResolvedConfig> {
  const supabase = createServiceRoleClient();
  const [enabledRes, pixelRes, tokenRefRes] = await Promise.all([
    supabase.rpc('fn_get_policy', {
      p_key: 'meta.capi.is_enabled',
      p_scope_id: institutionId,
    }),
    supabase.rpc('fn_get_policy', {
      p_key: 'meta.capi.pixel_id',
      p_scope_id: institutionId,
    }),
    supabase.rpc('fn_get_policy', {
      p_key: 'meta.capi.access_token_ref',
      p_scope_id: institutionId,
    }),
  ]);

  const enabled = enabledRes.data === true;
  const pixelId =
    typeof pixelRes.data === 'string' ? pixelRes.data.trim() : '';
  const tokenRef =
    typeof tokenRefRes.data === 'string' ? tokenRefRes.data.trim() : '';

  let accessToken = '';
  if (tokenRef.length > 0) {
    const v = process.env[tokenRef];
    accessToken = typeof v === 'string' ? v.trim() : '';
  }

  let reason: string | undefined;
  if (!enabled) reason = 'kill-switch off';
  else if (pixelId.length === 0) reason = 'pixel_id empty';
  else if (tokenRef.length === 0) reason = 'access_token_ref empty';
  else if (accessToken.length === 0)
    reason = `env var ${tokenRef} unset`;

  return { enabled, pixelId, accessToken, reason };
}

// ---------------------------------------------------------------------------
// Audit writer (best-effort)
// ---------------------------------------------------------------------------

async function writeAudit(args: {
  institutionId: string | null;
  eventName: string;
  eventId: string;
  presentKeys: string[];
  customData: Record<string, unknown> | null;
  responseStatus?: number;
  responseBody?: Record<string, unknown> | null;
  error?: string;
}): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from('meta_capi_events').insert({
      institution_id: args.institutionId,
      event_name: args.eventName,
      event_id: args.eventId,
      user_data_hash: { _present: args.presentKeys },
      custom_data: args.customData,
      response_status: args.responseStatus ?? null,
      response_body: args.responseBody ?? null,
      error: args.error ?? null,
    });
  } catch (err) {
    console.warn('[lead-capi-hooks] audit write failed:', err);
  }
}

// ---------------------------------------------------------------------------
// 1. fireLeadCreatedCapi
// ---------------------------------------------------------------------------

export interface LeadCreatedInput {
  leadId: string;
  institutionId?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  /** Source URL of the form that produced the lead (for attribution). */
  sourceUrl?: string | null;
  /** Lead source label — e.g. `web-form`, `whatsapp`, `coe-feed`. */
  leadSource?: string | null;
  /** End-user IP (forward from request headers). */
  clientIp?: string | null;
  /** End-user UA (forward from request headers). */
  clientUserAgent?: string | null;
  /** Facebook `_fbc` cookie value (forward from browser). */
  fbc?: string | null;
  /** Facebook `_fbp` cookie value (forward from browser). */
  fbp?: string | null;
  /** Estimated lead value for Meta's bid optimization. */
  value?: number;
  /** ISO-4217 currency for `value`. */
  currency?: string;
}

/**
 * Fire a Meta CAPI `Lead` event for a newly-created admission lead.
 * Hook never throws — returns `CapiHookResult` so the caller can log
 * failures without affecting the lead-creation flow.
 *
 * Dedup contract: the same browser Pixel call MUST emit
 * `fbq('track', 'Lead', {...}, { eventID: 'lead-' + leadId })`.
 */
export async function fireLeadCreatedCapi(
  input: LeadCreatedInput
): Promise<CapiHookResult> {
  const eventId = `lead-${input.leadId}`;
  const institutionId = input.institutionId ?? null;

  const cfg = await resolveConfig(institutionId);
  if (!cfg.enabled || cfg.pixelId.length === 0 || cfg.accessToken.length === 0) {
    await writeAudit({
      institutionId,
      eventName: 'Lead',
      eventId,
      presentKeys: presentKeysFrom(input),
      customData: customDataFrom(input),
      error: cfg.reason,
    });
    return { sent: false, eventId, reason: cfg.reason };
  }

  const config: CapiClientConfig = {
    pixelId: cfg.pixelId,
    accessToken: cfg.accessToken,
  };
  const trackInput: CapiTrackInput = {
    eventId,
    user: {
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      firstName: input.firstName ?? undefined,
      lastName: input.lastName ?? undefined,
      country: input.country ?? undefined,
      externalId: input.leadId,
    },
    userDataRaw: {
      ...(input.clientIp ? { client_ip_address: input.clientIp } : {}),
      ...(input.clientUserAgent
        ? { client_user_agent: input.clientUserAgent }
        : {}),
      ...(input.fbc ? { fbc: input.fbc } : {}),
      ...(input.fbp ? { fbp: input.fbp } : {}),
    },
    customData: customDataFrom(input) ?? undefined,
    eventSourceUrl: input.sourceUrl ?? undefined,
    actionSource: 'website',
  };

  const result = await trackLead(config, trackInput);
  await writeAudit({
    institutionId,
    eventName: 'Lead',
    eventId,
    presentKeys: presentKeysFrom(input),
    customData: customDataFrom(input),
    responseStatus: result.responseStatus,
    responseBody:
      (result.responseBody as Record<string, unknown> | undefined) ?? null,
    error: result.error?.message,
  });

  return {
    sent: result.sent,
    eventId,
    responseStatus: result.responseStatus,
    error: result.error?.message,
  };
}

function presentKeysFrom(input: LeadCreatedInput): string[] {
  const keys: string[] = [];
  if (input.email) keys.push('email');
  if (input.phone) keys.push('phone');
  if (input.firstName) keys.push('firstName');
  if (input.lastName) keys.push('lastName');
  if (input.country) keys.push('country');
  if (input.clientIp) keys.push('client_ip');
  if (input.clientUserAgent) keys.push('client_ua');
  if (input.fbc) keys.push('fbc');
  if (input.fbp) keys.push('fbp');
  return keys;
}

function customDataFrom(
  input: LeadCreatedInput
): Record<string, unknown> | null {
  const cd: Record<string, unknown> = {};
  if (input.value !== undefined) cd.value = input.value;
  if (input.currency) cd.currency = input.currency;
  if (input.leadSource) {
    cd.content_name = input.leadSource;
    cd.status = input.leadSource;
  }
  return Object.keys(cd).length > 0 ? cd : null;
}

// ---------------------------------------------------------------------------
// 2. fireLeadConvertedCapi (Purchase)
// ---------------------------------------------------------------------------

export interface LeadConvertedInput {
  /** Admission application / order id used as the dedupe key (`purchase-${id}`). */
  orderId: string;
  institutionId?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  /** Monetary value (e.g. fee paid). REQUIRED for Purchase attribution. */
  value: number;
  /** ISO-4217 currency code (e.g. INR). REQUIRED. */
  currency: string;
  /** Course / program slug or name. */
  contentName?: string | null;
  /** Source URL where the conversion happened. */
  sourceUrl?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
}

/**
 * Fire a Meta CAPI `Purchase` event for a converted lead / paid admission.
 *
 * Dedup contract: the same browser Pixel call (typically on the
 * thank-you / receipt page) MUST emit
 * `fbq('track', 'Purchase', {...}, { eventID: 'purchase-' + orderId })`.
 */
export async function fireLeadConvertedCapi(
  input: LeadConvertedInput
): Promise<CapiHookResult> {
  const eventId = `purchase-${input.orderId}`;
  const institutionId = input.institutionId ?? null;

  const cfg = await resolveConfig(institutionId);
  if (!cfg.enabled || cfg.pixelId.length === 0 || cfg.accessToken.length === 0) {
    await writeAudit({
      institutionId,
      eventName: 'Purchase',
      eventId,
      presentKeys: presentKeysFromConverted(input),
      customData: {
        value: input.value,
        currency: input.currency,
        ...(input.contentName ? { content_name: input.contentName } : {}),
      },
      error: cfg.reason,
    });
    return { sent: false, eventId, reason: cfg.reason };
  }

  const config: CapiClientConfig = {
    pixelId: cfg.pixelId,
    accessToken: cfg.accessToken,
  };
  const trackInput: CapiTrackInput = {
    eventId,
    user: {
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      firstName: input.firstName ?? undefined,
      lastName: input.lastName ?? undefined,
      country: input.country ?? undefined,
      externalId: input.orderId,
    },
    userDataRaw: {
      ...(input.clientIp ? { client_ip_address: input.clientIp } : {}),
      ...(input.clientUserAgent
        ? { client_user_agent: input.clientUserAgent }
        : {}),
      ...(input.fbc ? { fbc: input.fbc } : {}),
      ...(input.fbp ? { fbp: input.fbp } : {}),
    },
    customData: {
      value: input.value,
      currency: input.currency,
      order_id: input.orderId,
      ...(input.contentName ? { content_name: input.contentName } : {}),
    },
    eventSourceUrl: input.sourceUrl ?? undefined,
    actionSource: 'website',
  };

  const result = await trackPurchase(config, trackInput);
  await writeAudit({
    institutionId,
    eventName: 'Purchase',
    eventId,
    presentKeys: presentKeysFromConverted(input),
    customData: {
      value: input.value,
      currency: input.currency,
      ...(input.contentName ? { content_name: input.contentName } : {}),
    },
    responseStatus: result.responseStatus,
    responseBody:
      (result.responseBody as Record<string, unknown> | undefined) ?? null,
    error: result.error?.message,
  });

  return {
    sent: result.sent,
    eventId,
    responseStatus: result.responseStatus,
    error: result.error?.message,
  };
}

function presentKeysFromConverted(input: LeadConvertedInput): string[] {
  const keys: string[] = [];
  if (input.email) keys.push('email');
  if (input.phone) keys.push('phone');
  if (input.firstName) keys.push('firstName');
  if (input.lastName) keys.push('lastName');
  if (input.country) keys.push('country');
  if (input.clientIp) keys.push('client_ip');
  if (input.clientUserAgent) keys.push('client_ua');
  if (input.fbc) keys.push('fbc');
  if (input.fbp) keys.push('fbp');
  return keys;
}
