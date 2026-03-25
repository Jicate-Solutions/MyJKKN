// app/actions/whatsapp-personal.ts
'use server';

// Server actions for BYOW WhatsApp personal connections.
// Wraps the API client with error handling and validation.

import {
  personalConnectAPI,
  personalGetStatusAPI,
  personalSendMessageAPI,
  personalSendBulkAPI,
  personalDisconnectAPI,
} from '@/lib/whatsapp/personal-api-client';
import type { PersonalRecipient } from '@/types/whatsapp-personal';

// NOTE: Server actions resolve service config from env vars internally.
// The config parameter is NOT exposed — API routes handle per-institution
// config lookup from the database before calling the API client directly.

/** Initiate WhatsApp connection — returns QR code for scanning */
export async function connectPersonalWhatsApp() {
  try {
    return await personalConnectAPI();
  } catch (error) {
    console.error('[whatsapp-personal] Connect error:', error);
    return {
      success: false,
      status: 'disconnected' as const,
      message: error instanceof Error ? error.message : 'Failed to connect',
    };
  }
}

/** Get connection status (poll this to check QR scan progress) */
export async function getPersonalWhatsAppStatus() {
  try {
    return await personalGetStatusAPI();
  } catch (error) {
    console.error('[whatsapp-personal] Status error:', error);
    return {
      success: false,
      status: 'disconnected' as const,
      qrCode: null,
      clientInfo: null,
      timestamp: new Date().toISOString(),
    };
  }
}

/** Send a single message via personal WhatsApp */
export async function sendPersonalWhatsAppMessage(to: string, message: string) {
  try {
    if (!to || !message) {
      return { success: false, error: 'Phone number and message are required' };
    }
    if (message.length > 4096) {
      return { success: false, error: 'Message too long (max 4096 characters)' };
    }
    return await personalSendMessageAPI(to, message);
  } catch (error) {
    console.error('[whatsapp-personal] Send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

/** Send messages to multiple recipients via personal WhatsApp */
export async function sendBulkPersonalWhatsAppMessages(
  recipients: PersonalRecipient[],
  delayMs: number = 1500
) {
  try {
    if (!recipients || recipients.length === 0) {
      return { success: false, error: 'At least one recipient is required' };
    }
    for (const r of recipients) {
      if (!r.phone || !r.message) {
        return { success: false, error: 'Each recipient must have phone and message' };
      }
    }
    return await personalSendBulkAPI(recipients, delayMs);
  } catch (error) {
    console.error('[whatsapp-personal] Bulk send error:', error);
    return {
      success: false,
      totalSent: 0,
      successCount: 0,
      failCount: 0,
      results: [],
      error: error instanceof Error ? error.message : 'Failed to send bulk messages',
    };
  }
}

/** Disconnect personal WhatsApp (logs out, clears session) */
export async function disconnectPersonalWhatsApp() {
  try {
    return await personalDisconnectAPI();
  } catch (error) {
    console.error('[whatsapp-personal] Disconnect error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to disconnect',
    };
  }
}
