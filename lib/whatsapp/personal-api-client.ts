// lib/whatsapp/personal-api-client.ts
// HTTP client for the BYOW WhatsApp Railway service
// Communicates with the Express service running whatsapp-web.js

import type {
  PersonalWhatsAppStatus,
  PersonalConnectResponse,
  PersonalSendResponse,
  PersonalBulkSendResponse,
  PersonalRecipient,
} from '@/types/whatsapp-personal';

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
  const serviceUrl = serviceConfig?.serviceUrl || process.env.WHATSAPP_PERSONAL_SERVICE_URL;
  const apiKey = serviceConfig?.apiKey || process.env.WHATSAPP_PERSONAL_API_KEY;

  if (!serviceUrl) {
    throw new Error('BYOW WhatsApp service URL not configured');
  }
  if (!apiKey) {
    throw new Error('BYOW WhatsApp API key not configured');
  }

  const url = `${serviceUrl}${endpoint}`;

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
