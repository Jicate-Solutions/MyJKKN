// lib/services/telephony/exotel-client.ts
// Reusable HTTP client for Exotel V1/V2 APIs
// Auth: Basic auth header | Retry: 2 retries with 1s backoff | Timeout: 15s

import { withRetry, withTimeout } from '@/lib/retry';
import { logger } from '@/lib/utils/enhanced-logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ExotelConfig {
  apiKey: string;
  apiToken: string;
  accountSid: string;
  subdomain: string;
  callerId: string;
}

export interface MakeCallParams {
  from: string;        // Counselor phone (called first)
  to: string;          // Prospect phone (bridged second)
  callerId: string;    // ExoPhone number
  record?: boolean;
  statusCallback?: string;
  statusCallbackEvents?: ('terminal' | 'answered')[];
  timeLimit?: number;  // Max duration in seconds (default 1800)
  timeOut?: number;    // Ring timeout in seconds (default 30)
  customField?: string; // Our DB record ID for webhook correlation
}

export interface ExotelCallResponse {
  Call: {
    Sid: string;
    Status: string;
    From: string;
    To: string;
    PhoneNumberSid: string;
    DateCreated: string;
  };
}

export interface ExotelCallDetailsResponse {
  Call: {
    Sid: string;
    Status: string;
    Direction: string;
    From: string;
    To: string;
    StartTime: string;
    EndTime: string;
    Duration: string;
    ConversationDuration?: string;
    Price: string;
    Currency?: string;
    RecordingUrl?: string;
    PhoneNumberSid: string;
    DateCreated: string;
    DateUpdated: string;
  };
}

export interface SendSmsParams {
  from: string;        // ExoPhone or Sender ID
  to: string;          // Recipient phone
  body: string;        // Message content (max 2000 chars)
  dltEntityId?: string;  // Required for India
  dltTemplateId?: string;
  smsType?: 'transactional' | 'transactional_opt_in' | 'promotional';
  statusCallback?: string;
  customField?: string;
  priority?: 'normal' | 'high';
}

export interface ExotelSmsResponse {
  SMSMessage: {
    Sid: string;
    Status: string;
    DetailedStatusCode: number;
    DetailedStatus: string;
    SmsUnits: number;
  };
}

export interface AnalyzeCallParams {
  callSid: string;
  tasks: ('transcript' | 'summarization' | 'sentiment' | 'categorise')[];
  callbackUrl: string;
  categories?: string[];  // for 'categorise' task
}

export interface AnalyzeCallResponse {
  request_id: string;
  status: string;
}

export interface ExoVoiceAnalyzeWebhookPayload {
  call_sid: string;
  request_id: string;
  status: 'completed' | 'failed';
  insights: {
    transcript?: {
      text: string;
      language: string;
    };
    summarization?: {
      summary: string;
    };
    sentiment?: {
      label: 'positive' | 'negative' | 'neutral';
      score: number;
    };
    categorise?: {
      categories: string[];
    };
  };
  error?: string;
}

export class ExotelApiError extends Error {
  statusCode: number;
  exotelCode?: string;
  responseBody?: string;

  constructor(message: string, statusCode: number, exotelCode?: string, responseBody?: string) {
    super(message);
    this.name = 'ExotelApiError';
    this.statusCode = statusCode;
    this.exotelCode = exotelCode;
    this.responseBody = responseBody;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════════════════

export class ExotelClient {
  /**
   * Read and validate all Exotel env vars. Throws if any are missing.
   */
  static getConfig(): ExotelConfig {
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const accountSid = process.env.EXOTEL_ACCOUNT_SID;
    const subdomain = process.env.EXOTEL_SUBDOMAIN || 'api.in.exotel.com';
    const callerId = process.env.EXOTEL_CALLER_ID || '';

    if (!apiKey || !apiToken || !accountSid) {
      throw new ExotelApiError(
        'Exotel not configured: missing EXOTEL_API_KEY, EXOTEL_API_TOKEN, or EXOTEL_ACCOUNT_SID',
        500
      );
    }

    return { apiKey, apiToken, accountSid, subdomain, callerId };
  }

  /**
   * Check if all required env vars are present (non-throwing).
   */
  static isConfigured(): boolean {
    return !!(
      process.env.EXOTEL_API_KEY &&
      process.env.EXOTEL_API_TOKEN &&
      process.env.EXOTEL_ACCOUNT_SID
    );
  }

  /**
   * Build base URL for Exotel API.
   */
  private static getBaseUrl(version: 'v1' | 'v2' = 'v1'): string {
    const config = this.getConfig();
    return `https://${config.subdomain}/${version}/Accounts/${config.accountSid}`;
  }

  /**
   * Build Basic auth header.
   */
  private static getAuthHeader(): string {
    const config = this.getConfig();
    return `Basic ${Buffer.from(`${config.apiKey}:${config.apiToken}`).toString('base64')}`;
  }

  /**
   * Core HTTP request with retry + timeout.
   * V1 endpoints use form-encoded body, V2 use JSON.
   */
  private static async request<T>(
    method: string,
    path: string,
    body?: Record<string, string>,
    options?: { version?: 'v1' | 'v2'; contentType?: string }
  ): Promise<T> {
    const version = options?.version || 'v1';
    const baseUrl = this.getBaseUrl(version);
    const url = `${baseUrl}${path}`;
    const authHeader = this.getAuthHeader();

    const isJson = version === 'v2' || options?.contentType === 'application/json';

    const headers: Record<string, string> = {
      Authorization: authHeader,
      'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
    };

    let requestBody: string | undefined;
    if (body && method !== 'GET') {
      requestBody = isJson
        ? JSON.stringify(body)
        : new URLSearchParams(body).toString();
    }

    logger.info('telephony/exotel', `${method} ${path}`, {
      version,
      hasBody: !!requestBody,
    });

    const response = await withRetry(
      () =>
        withTimeout(
          fetch(url, {
            method,
            headers,
            body: requestBody,
          }),
          15000,
          `Exotel API timeout: ${method} ${path}`
        ),
      2,
      1000
    );

    const responseText = await response.text();

    if (!response.ok) {
      logger.error('telephony/exotel', `API error: ${response.status}`, {
        path,
        status: response.status,
        body: responseText.substring(0, 500),
      });

      let exotelCode: string | undefined;
      try {
        const parsed = JSON.parse(responseText);
        exotelCode = parsed?.RestException?.Code || parsed?.error_data?.code;
      } catch {
        // Response not JSON
      }

      throw new ExotelApiError(
        `Exotel API ${method} ${path} failed: ${response.status}`,
        response.status,
        exotelCode,
        responseText.substring(0, 500)
      );
    }

    try {
      const data = JSON.parse(responseText);
      logger.info('telephony/exotel', `${method} ${path} success`);
      return data as T;
    } catch {
      throw new ExotelApiError(
        `Exotel API returned non-JSON: ${responseText.substring(0, 200)}`,
        response.status
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VOICE API (V1)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initiate a click-to-call: Exotel calls `from` first, then bridges to `to`.
   */
  static async makeCall(params: MakeCallParams): Promise<ExotelCallResponse> {
    const body: Record<string, string> = {
      From: params.from,
      To: params.to,
      CallerId: params.callerId,
      Record: params.record !== false ? 'true' : 'false',
    };

    if (params.statusCallback) body.StatusCallback = params.statusCallback;
    if (params.statusCallbackEvents) {
      body.StatusCallbackEvents = params.statusCallbackEvents.join(',');
    }
    if (params.timeLimit) body.TimeLimit = String(params.timeLimit);
    if (params.timeOut) body.TimeOut = String(params.timeOut);
    if (params.customField) body.CustomField = params.customField;

    return this.request<ExotelCallResponse>('POST', '/Calls/connect', body);
  }

  /**
   * Get details for an existing call by CallSid.
   */
  static async getCallDetails(callSid: string): Promise<ExotelCallDetailsResponse> {
    return this.request<ExotelCallDetailsResponse>('GET', `/Calls/${callSid}.json`);
  }

  /**
   * Get recent calls from Exotel (for sync/polling).
   * Returns up to pageSize calls after the given start time.
   */
  static async getRecentCalls(sinceTime: string, pageSize: number = 50, offset: number = 0): Promise<any> {
    const encodedTime = encodeURIComponent(sinceTime);
    return this.request<any>('GET', `/Calls.json?PageSize=${pageSize}&Offset=${offset}&StartTime%3E=${encodedTime}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SMS API (V1)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Send an SMS via Exotel.
   */
  static async sendSms(params: SendSmsParams): Promise<ExotelSmsResponse> {
    const body: Record<string, string> = {
      From: params.from,
      To: params.to,
      Body: params.body,
    };

    if (params.dltEntityId) body.DltEntityId = params.dltEntityId;
    if (params.dltTemplateId) body.DltTemplateId = params.dltTemplateId;
    if (params.smsType) body.SmsType = params.smsType;
    if (params.statusCallback) body.StatusCallback = params.statusCallback;
    if (params.customField) body.CustomField = params.customField;
    if (params.priority) body.Priority = params.priority;

    return this.request<ExotelSmsResponse>('POST', '/Sms/send', body);
  }

  /**
   * Submit call recording for AI analysis via ExoVoiceAnalyze.
   * Async: POST returns job_id, results arrive at callbackUrl webhook.
   * Endpoint: POST /v1/Accounts/{sid}/Calls/{callSid}/ExoVoiceAnalyze.json
   */
  static async analyzeCall(params: AnalyzeCallParams): Promise<AnalyzeCallResponse> {
    const body: Record<string, string> = {
      InsightTasks: params.tasks.join(','),
      CallbackUrl: params.callbackUrl,
    };

    if (params.categories?.length) {
      body.Categories = params.categories.join(',');
    }

    return this.request<AnalyzeCallResponse>(
      'POST',
      `/Calls/${params.callSid}/ExoVoiceAnalyze.json`,
      body
    );
  }
}
