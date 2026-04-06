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

// ── User Management (CCM API) ──────────────────────────────────────────────

export interface ExotelDevice {
  device_id: string;
  is_active: boolean;
  type: string; // 'softphone' | 'browser' | 'sip' etc.
}

export interface ExotelActiveCall {
  call_sid: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  start_time: string;
}

export interface ExotelUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'user';
  devices: ExotelDevice[];
  active_call: ExotelActiveCall | null;
  last_login: string | null;
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

// ═══════════════════════════════════════════════════════════════════════════
// CDR TYPES (used by inbound-call-sync-service)
// ═══════════════════════════════════════════════════════════════════════════

export interface ExotelCallRecord {
  Sid: string;
  Status: string;
  Direction: string;
  From: string;
  To: string;
  StartTime: string | null;
  EndTime: string | null;
  Duration: string | null;
  ConversationDuration?: string | null;
  Price: string | null;
  Currency?: string;
  RecordingUrl?: string | null;
  PreSignedRecordingUrl?: string | null;
  DateCreated: string;
  DateUpdated?: string;
  PhoneNumberSid?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDALONE HELPERS (used by inbound-call-sync-service)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if Exotel env vars are configured (standalone convenience function).
 */
export function isExotelConfigured(): boolean {
  return !!(
    process.env.EXOTEL_API_KEY &&
    process.env.EXOTEL_API_TOKEN &&
    process.env.EXOTEL_ACCOUNT_SID
  );
}

/**
 * Get an ExotelClient instance with CDR pagination support.
 */
export function getExotelClient() {
  if (!isExotelConfigured()) {
    throw new Error('Exotel is not configured');
  }
  return {
    /**
     * Async generator that yields pages of call records from the CDR API.
     */
    async *fetchCallRecords(params: {
      direction?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: string;
      pageSize?: number;
    }): AsyncGenerator<ExotelCallRecord[]> {
      const pageSize = params.pageSize || 100;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const queryParts: string[] = [`PageSize=${pageSize}`, `Offset=${offset}`];
        if (params.dateFrom) queryParts.push(`StartTime%3E=${encodeURIComponent(params.dateFrom)}`);
        if (params.dateTo) queryParts.push(`StartTime%3C=${encodeURIComponent(params.dateTo)}`);
        if (params.status) queryParts.push(`Status=${encodeURIComponent(params.status)}`);
        if (params.direction) {
          const dir = params.direction === 'inbound' ? 'incoming' : 'outgoing';
          queryParts.push(`Direction=${dir}`);
        }

        const result = await ExotelClient.fetchCDRPage(queryParts.join('&'));

        const calls: ExotelCallRecord[] = result?.Calls || [];
        if (calls.length === 0) {
          hasMore = false;
        } else {
          yield calls;
          offset += pageSize;
          // If fewer than pageSize returned, we've reached the end
          if (calls.length < pageSize) hasMore = false;
        }
      }
    },
  };
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
   * Build base URL for the CCM (User Management) API.
   * The CCM subdomain mirrors the voice subdomain pattern:
   *   api.exotel.com → ccm-api.exotel.com
   *   api.in.exotel.com → ccm-api.in.exotel.com
   */
  private static getCcmBaseUrl(): string {
    const config = this.getConfig();
    // Replace leading 'api.' with 'ccm-api.' to get the CCM subdomain
    const ccmSubdomain = config.subdomain.replace(/^api\./, 'ccm-api.');
    return `https://${ccmSubdomain}/v2/accounts/${config.accountSid}`;
  }

  /**
   * Build Basic auth header.
   */
  private static getAuthHeader(): string {
    const config = this.getConfig();
    return `Basic ${Buffer.from(`${config.apiKey}:${config.apiToken}`).toString('base64')}`;
  }

  /**
   * Fetch call records from CDR API (public, used by getExotelClient).
   */
  static async fetchCDRPage(queryString: string): Promise<any> {
    return this.request<any>('GET', `/Calls.json?${queryString}`);
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

  // ═══════════════════════════════════════════════════════════════════════
  // USER MANAGEMENT API (CCM subdomain)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Core HTTP request for the CCM (User Management) API.
   * Uses ccm-api subdomain, always JSON, always v2.
   */
  private static async ccmRequest<T>(method: string, path: string): Promise<T> {
    const baseUrl = this.getCcmBaseUrl();
    const url = `${baseUrl}${path}`;
    const authHeader = this.getAuthHeader();

    logger.info('telephony/exotel-ccm', `${method} ${path}`);

    const response = await withRetry(
      () =>
        withTimeout(
          fetch(url, {
            method,
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
          }),
          15000,
          `Exotel CCM API timeout: ${method} ${path}`
        ),
      2,
      1000
    );

    const responseText = await response.text();

    if (!response.ok) {
      logger.error('telephony/exotel-ccm', `API error: ${response.status}`, {
        path,
        status: response.status,
        body: responseText.substring(0, 500),
      });

      throw new ExotelApiError(
        `Exotel CCM API ${method} ${path} failed: ${response.status}`,
        response.status,
        undefined,
        responseText.substring(0, 500)
      );
    }

    try {
      const data = JSON.parse(responseText);
      logger.info('telephony/exotel-ccm', `${method} ${path} success`);
      return data as T;
    } catch {
      throw new ExotelApiError(
        `Exotel CCM API returned non-JSON: ${responseText.substring(0, 200)}`,
        response.status
      );
    }
  }

  /**
   * Get all Exotel users (counselors/agents).
   * Uses CCM subdomain: ccm-api.{region}.exotel.com
   * Paginates automatically (max 50 per page).
   */
  static async getUsers(): Promise<ExotelUser[]> {
    const allUsers: ExotelUser[] = [];
    let offset = 0;
    const limit = 50;

    // Paginate through all users
    // Safety cap at 500 to avoid infinite loops
    while (offset < 500) {
      const params = `?devices=true&active_call=true&last_login=true&offset=${offset}&limit=${limit}`;
      const response = await this.ccmRequest<any>('GET', `/users${params}`);

      // The API may return { data: [...] } or { users: [...] } or just [...]
      const users: any[] = response?.data || response?.users || (Array.isArray(response) ? response : []);

      if (users.length === 0) break;

      for (const u of users) {
        allUsers.push({
          user_id: u.user_id || u.id || '',
          first_name: u.first_name || '',
          last_name: u.last_name || '',
          email: u.email || '',
          role: u.role || 'user',
          devices: (u.devices || []).map((d: any) => ({
            device_id: d.device_id || d.id || '',
            is_active: d.is_active ?? false,
            type: d.type || 'unknown',
          })),
          active_call: u.active_call ? {
            call_sid: u.active_call.call_sid || u.active_call.sid || '',
            from: u.active_call.from || '',
            to: u.active_call.to || '',
            direction: u.active_call.direction || '',
            status: u.active_call.status || '',
            start_time: u.active_call.start_time || '',
          } : null,
          last_login: u.last_login || null,
        });
      }

      if (users.length < limit) break;
      offset += limit;
    }

    return allUsers;
  }

  /**
   * Get a single user with device and call status.
   */
  static async getUser(userId: string): Promise<ExotelUser> {
    const response = await this.ccmRequest<any>('GET', `/users/${userId}?devices=true&active_call=true&last_login=true`);

    const u = response?.data || response;
    return {
      user_id: u.user_id || u.id || userId,
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      email: u.email || '',
      role: u.role || 'user',
      devices: (u.devices || []).map((d: any) => ({
        device_id: d.device_id || d.id || '',
        is_active: d.is_active ?? false,
        type: d.type || 'unknown',
      })),
      active_call: u.active_call ? {
        call_sid: u.active_call.call_sid || u.active_call.sid || '',
        from: u.active_call.from || '',
        to: u.active_call.to || '',
        direction: u.active_call.direction || '',
        status: u.active_call.status || '',
        start_time: u.active_call.start_time || '',
      } : null,
      last_login: u.last_login || null,
    };
  }
}
