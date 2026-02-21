// WhatsApp Cloud API Client
// Meta WhatsApp Business Cloud API v21.0
// Base URL: https://graph.facebook.com/v21.0/{phone_number_id}/messages

import axios, { type AxiosInstance } from 'axios';

// =============================================================================
// Types
// =============================================================================

export interface WAMessageResponse {
  messaging_product: 'whatsapp';
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

export interface WATemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: number;
  parameters: WATemplateParameter[];
}

export type WATemplateParameter =
  | { type: 'text'; text: string }
  | { type: 'currency'; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: 'date_time'; date_time: { fallback_value: string } }
  | { type: 'image'; image: { link: string } }
  | { type: 'document'; document: { link: string; filename?: string } }
  | { type: 'video'; video: { link: string } };

export interface WAInteractiveButton {
  type: 'reply';
  reply: { id: string; title: string };
}

export interface WAInteractiveListSection {
  title: string;
  rows: { id: string; title: string; description?: string }[];
}

export interface WAInteractive {
  type: 'button' | 'list' | 'flow';
  header?: { type: 'text'; text: string } | { type: 'image'; image: { link: string } };
  body: { text: string };
  footer?: { text: string };
  action: {
    // For buttons
    buttons?: WAInteractiveButton[];
    // For lists
    button?: string;
    sections?: WAInteractiveListSection[];
    // For flows
    name?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface WAMediaInfo {
  messaging_product: 'whatsapp';
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
}

// =============================================================================
// Client
// =============================================================================

class WhatsAppCloudAPIClient {
  private client: AxiosInstance;
  private phoneNumberId: string;

  constructor() {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error(
        'Missing WhatsApp Cloud API credentials. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.'
      );
    }

    this.phoneNumberId = phoneNumberId;

    this.client = axios.create({
      baseURL: `https://graph.facebook.com/v21.0`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Send a plain text message
   */
  async sendTextMessage(to: string, text: string, previewUrl = false): Promise<WAMessageResponse> {
    const { data } = await this.client.post<WAMessageResponse>(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: previewUrl, body: text },
      }
    );
    return data;
  }

  /**
   * Send a pre-approved template message
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components?: WATemplateComponent[]
  ): Promise<WAMessageResponse> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components && components.length > 0 ? { components } : {}),
      },
    };

    const { data } = await this.client.post<WAMessageResponse>(
      `/${this.phoneNumberId}/messages`,
      payload
    );
    return data;
  }

  /**
   * Send a media message (image, video, document, audio)
   */
  async sendMediaMessage(
    to: string,
    type: 'image' | 'video' | 'document' | 'audio',
    mediaUrl: string,
    caption?: string,
    filename?: string
  ): Promise<WAMessageResponse> {
    const mediaPayload: Record<string, unknown> = { link: mediaUrl };
    if (caption && (type === 'image' || type === 'video' || type === 'document')) {
      mediaPayload.caption = caption;
    }
    if (filename && type === 'document') {
      mediaPayload.filename = filename;
    }

    const { data } = await this.client.post<WAMessageResponse>(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type,
        [type]: mediaPayload,
      }
    );
    return data;
  }

  /**
   * Send an interactive message (buttons, lists, flows)
   */
  async sendInteractiveMessage(
    to: string,
    interactive: WAInteractive
  ): Promise<WAMessageResponse> {
    const { data } = await this.client.post<WAMessageResponse>(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive,
      }
    );
    return data;
  }

  /**
   * Send a location message
   */
  async sendLocationMessage(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string
  ): Promise<WAMessageResponse> {
    const { data } = await this.client.post<WAMessageResponse>(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'location',
        location: {
          latitude,
          longitude,
          ...(name ? { name } : {}),
          ...(address ? { address } : {}),
        },
      }
    );
    return data;
  }

  /**
   * Mark a message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  /**
   * Get media URL from media ID (for downloading prospect-sent media)
   */
  async getMediaUrl(mediaId: string): Promise<string> {
    const { data } = await this.client.get<WAMediaInfo>(`/${mediaId}`);
    return data.url;
  }

  /**
   * Download media binary given a media URL (returned from getMediaUrl)
   */
  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const { data } = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    return Buffer.from(data);
  }

  /**
   * Check if the Cloud API is configured
   */
  static isConfigured(): boolean {
    return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }
}

// =============================================================================
// Singleton + exported convenience functions
// =============================================================================

let clientInstance: WhatsAppCloudAPIClient | null = null;

function getClient(): WhatsAppCloudAPIClient {
  if (!clientInstance) {
    clientInstance = new WhatsAppCloudAPIClient();
  }
  return clientInstance;
}

export async function sendTextMessage(to: string, text: string, previewUrl = false) {
  return getClient().sendTextMessage(to, text, previewUrl);
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  components?: WATemplateComponent[]
) {
  return getClient().sendTemplateMessage(to, templateName, languageCode, components);
}

export async function sendMediaMessage(
  to: string,
  type: 'image' | 'video' | 'document' | 'audio',
  mediaUrl: string,
  caption?: string,
  filename?: string
) {
  return getClient().sendMediaMessage(to, type, mediaUrl, caption, filename);
}

export async function sendInteractiveMessage(to: string, interactive: WAInteractive) {
  return getClient().sendInteractiveMessage(to, interactive);
}

export async function sendLocationMessage(
  to: string,
  latitude: number,
  longitude: number,
  name?: string,
  address?: string
) {
  return getClient().sendLocationMessage(to, latitude, longitude, name, address);
}

export async function markAsRead(messageId: string) {
  return getClient().markAsRead(messageId);
}

export async function getMediaUrl(mediaId: string) {
  return getClient().getMediaUrl(mediaId);
}

export async function downloadMedia(mediaUrl: string) {
  return getClient().downloadMedia(mediaUrl);
}

export function isWhatsAppConfigured() {
  return WhatsAppCloudAPIClient.isConfigured();
}

// Legacy exports for backward compatibility with existing action files
export async function getConnectionStatus(_institutionId: string) {
  return {
    isConnected: WhatsAppCloudAPIClient.isConfigured(),
    status: WhatsAppCloudAPIClient.isConfigured() ? ('ready' as const) : ('disconnected' as const),
    qrCode: null,
    qr: null,
    phoneNumber: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
  };
}

export async function initializeConnection(_institutionId: string) {
  return {
    status: WhatsAppCloudAPIClient.isConfigured() ? ('ready' as const) : ('error' as const),
    qr: null,
    qrCode: null,
    sessionId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    phone: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    pushName: null,
    jid: null,
    error: WhatsAppCloudAPIClient.isConfigured() ? null : 'WhatsApp Cloud API not configured',
  };
}

export async function disconnectSession(_institutionId: string) {
  return { success: true };
}

export async function sendMessage(request: { sessionId: string; to: string; text: string; type?: string }) {
  try {
    const result = await sendTextMessage(request.to, request.text);
    return {
      success: true,
      messageId: result.messages?.[0]?.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

export async function sendBulkMessages(request: {
  sessionId: string;
  recipients: string[];
  text: string;
  type?: string;
  delayBetweenMs?: number;
}) {
  const delay = request.delayBetweenMs || 1000;
  const results = [];

  for (const recipient of request.recipients) {
    try {
      const result = await sendTextMessage(recipient, request.text);
      results.push({
        recipient,
        success: true,
        messageId: result.messages?.[0]?.id,
      });
    } catch (error) {
      results.push({
        recipient,
        success: false,
        error: error instanceof Error ? error.message : 'Failed',
      });
    }
    // Rate limiting delay between messages
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  const sent = results.filter((r) => r.success).length;
  return {
    success: sent > 0,
    total: request.recipients.length,
    sent,
    failed: request.recipients.length - sent,
    results,
  };
}

export async function getMessageHistory(_institutionId: string, _phoneNumber: string) {
  return [];
}

export async function refreshQRCode(_institutionId: string) {
  return { qrCode: '' };
}
