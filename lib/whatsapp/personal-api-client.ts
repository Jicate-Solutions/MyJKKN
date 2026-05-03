// lib/whatsapp/personal-api-client.ts
// HTTP client for the BYOW WhatsApp Railway service
// Communicates with the Express service running whatsapp-web.js
//
// Server-only by convention. All current consumers are API routes / server
// actions / cron-triggered services. Do NOT import from a client component —
// the policy gate uses the server-side fn_get_policy reader (next/headers).

import * as Sentry from '@sentry/nextjs';
import { getPolicyBool } from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';
import type {
  PersonalWhatsAppStatus,
  PersonalConnectResponse,
  PersonalSendResponse,
  PersonalBulkSendResponse,
  PersonalRecipient,
} from '@/types/whatsapp-personal';

/**
 * Thrown when wa_byow.is_enabled is false (auto-disabled by health-check cron
 * after N consecutive Railway failures, OR manually disabled by super_admin).
 * Routes can catch this and return 503 with a clear message.
 */
export class ByowDisabledError extends Error {
  constructor(message = 'BYOW WhatsApp is disabled. Check /admin/policies for wa_byow.is_enabled.') {
    super(message);
    this.name = 'ByowDisabledError';
  }
}

// ---------------------------------------------------------------------------
// Core HTTP client
// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the Railway WhatsApp service.
 * Falls back to env vars if no explicit URL/key provided (single-institution mode).
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  serviceConfig?: { serviceUrl: string; apiKey: string }
): Promise<T> {
  // Kill-switch gate (v4 spec). Reads wa_byow.is_enabled from platform_policies.
  // Default true so first-deploy works; cron flips false after N consecutive
  // health failures. Skip the gate for /health probes themselves to avoid
  // chicken-and-egg (cron calls /health to decide whether to disable).
  if (endpoint !== '/health') {
    const enabled = await getPolicyBool(POLICY_KEYS.WA_BYOW_IS_ENABLED, true);
    if (!enabled) {
      throw new ByowDisabledError();
    }
  }

  const serviceUrl = serviceConfig?.serviceUrl || process.env.WHATSAPP_PERSONAL_SERVICE_URL;
  const apiKey = serviceConfig?.apiKey || process.env.WHATSAPP_PERSONAL_API_KEY;

  if (!serviceUrl) {
    throw new Error('BYOW WhatsApp service URL not configured');
  }
  if (!apiKey) {
    throw new Error('BYOW WhatsApp API key not configured');
  }

  const url = `${serviceUrl}${endpoint}`;

  return Sentry.startSpan(
    { op: 'whatsapp.byow', name: endpoint },
    async () => {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `BYOW API error: ${response.status}`);
      }

      return response.json();
    }
  );
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/** Initialize WhatsApp connection and get QR code */
export async function personalConnectAPI(
  config?: { serviceUrl: string; apiKey: string }
): Promise<PersonalConnectResponse> {
  return apiRequest<PersonalConnectResponse>('/connect', { method: 'POST' }, config);
}

/** Get current connection status (includes QR code if in qr_ready state) */
export async function personalGetStatusAPI(
  config?: { serviceUrl: string; apiKey: string }
): Promise<PersonalWhatsAppStatus> {
  return apiRequest<PersonalWhatsAppStatus>('/status', { method: 'GET' }, config);
}

/** Send a single message */
export async function personalSendMessageAPI(
  to: string,
  message: string,
  config?: { serviceUrl: string; apiKey: string }
): Promise<PersonalSendResponse> {
  return apiRequest<PersonalSendResponse>(
    '/send',
    { method: 'POST', body: JSON.stringify({ to, message }) },
    config
  );
}

/** Send messages to multiple recipients with delay between each */
export async function personalSendBulkAPI(
  recipients: PersonalRecipient[],
  delayMs: number = 1500,
  config?: { serviceUrl: string; apiKey: string }
): Promise<PersonalBulkSendResponse> {
  return apiRequest<PersonalBulkSendResponse>(
    '/send-bulk',
    { method: 'POST', body: JSON.stringify({ recipients, delayMs }) },
    config
  );
}

/** Disconnect from WhatsApp (logs out, clears session) */
export async function personalDisconnectAPI(
  config?: { serviceUrl: string; apiKey: string }
): Promise<{ success: boolean; message: string }> {
  return apiRequest('/disconnect', { method: 'POST' }, config);
}
