/**
 * Transport Webhook Service
 *
 * Sends HMAC-SHA256 signed webhook notifications to the external
 * Transport Management System (TMS) when transport requests are approved.
 *
 * Configuration via environment variables:
 *   TMS_WEBHOOK_URL    - The TMS endpoint to POST notifications to
 *   TMS_WEBHOOK_SECRET - Shared secret for HMAC-SHA256 signature
 *
 * @module services/service-requests/transport-webhook
 * @created 2026-02-09
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';

interface TransportWebhookPayload {
  event: string;
  timestamp: string;
  request_id: string;
  request_number: string;
  institution_id: string | null;
}

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 * Uses Web Crypto API (available in Edge Runtime and Node 18+).
 */
async function generateSignature(
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Send a webhook notification to the TMS when a transport request is approved.
 *
 * This is a fire-and-forget operation — failures are logged but don't
 * block the approval flow.
 */
export async function notifyTmsWebhook(
  requestId: string,
  requestNumber: string,
  institutionId: string | null
): Promise<void> {
  const webhookUrl = process.env.TMS_WEBHOOK_URL;
  const webhookSecret = process.env.TMS_WEBHOOK_SECRET;

  if (!webhookUrl) {
    console.warn('[transport-webhook] TMS_WEBHOOK_URL not configured, skipping notification');
    return;
  }

  const payload: TransportWebhookPayload = {
    event: 'transport_request.approved',
    timestamp: new Date().toISOString(),
    request_id: requestId,
    request_number: requestNumber,
    institution_id: institutionId,
  };

  const body = JSON.stringify(payload);
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add HMAC signature if secret is configured
    if (webhookSecret) {
      const signature = await generateSignature(body, webhookSecret);
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    httpStatus = response.status;

    if (!response.ok) {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      console.error('[transport-webhook] Delivery failed:', errorMessage);
    } else {
      console.log('[transport-webhook] Notification delivered successfully');
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[transport-webhook] Delivery error:', errorMessage);
  }

  // Log the webhook delivery attempt
  try {
    const supabase = await createServerSupabaseClient() as any;
    await supabase.from('webhook_logs').insert({
      event_type: 'transport_request.approved',
      table_name: 'service_requests',
      record_id: requestId,
      payload,
      http_status: httpStatus,
      error_message: errorMessage,
    });
  } catch (logError) {
    console.error('[transport-webhook] Failed to log webhook delivery:', logError);
  }
}
