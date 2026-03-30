/**
 * Exotel V1 API HTTP Client
 *
 * Handles authentication, request/response formatting, retry logic,
 * and error classification for the Exotel cloud telephony API.
 *
 * IMPORTANT: Exotel V1 API accepts application/x-www-form-urlencoded (NOT JSON).
 * Append .json to URL paths to receive JSON responses (default is XML).
 */

import { toExotelFormat, maskPhone } from '@/lib/utils/phone-number';
import { logger } from '@/lib/utils/enhanced-logger';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ExotelError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ExotelError';
    this.code = code;
  }
}

export class ExotelConfigError extends ExotelError {
  constructor(missingVars: string[]) {
    super(
      `Missing required Exotel environment variables: ${missingVars.join(', ')}`,
      'CONFIG_ERROR',
    );
    this.name = 'ExotelConfigError';
  }
}

export class ExotelApiError extends ExotelError {
  public readonly statusCode: number;
  public readonly body: unknown;

  constructor(message: string, statusCode: number, body: unknown) {
    super(message, 'API_ERROR');
    this.name = 'ExotelApiError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

export class ExotelRateLimitError extends ExotelError {
  constructor(message: string = 'Exotel rate limit exceeded') {
    super(message, 'RATE_LIMIT');
    this.name = 'ExotelRateLimitError';
  }
}

export class ExotelNetworkError extends ExotelError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
    this.name = 'ExotelNetworkError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExotelCallbackPayload {
  CallSid: string;
  Status: string;
  Direction?: string;
  From?: string;
  To?: string;
  Duration?: string;
  RecordingUrl?: string;
  Price?: string;
  CustomField?: string;
  StartTime?: string;
  EndTime?: string;
  AnswerTime?: string;
}

export interface ExotelCallRecord {
  Sid: string;
  ParentCallSid?: string;
  DateCreated?: string;
  DateUpdated?: string;
  AccountSid?: string;
  To: string;
  From: string;
  PhoneNumberSid?: string;
  PhoneNumber?: string;
  Status: string;
  StartTime?: string;
  EndTime?: string;
  Duration?: string;
  Price?: string;
  Direction: string;
  AnsweredBy?: string;
  ForwardedFrom?: string;
  CallerName?: string;
  Uri?: string;
  RecordingUrl?: string;
  PreSignedRecordingUrl?: string;
  Details?: {
    ConversationDuration?: number;
    Leg1Status?: string;
    Leg2Status?: string;
    Legs?: Array<{ Leg: { Id: number; OnCallDuration: number } }>;
  };
}

export interface FetchCallRecordsParams {
  /** Filter by call direction */
  direction?: 'inbound' | 'outbound-api' | 'outbound-dial';
  /** Start date (YYYY-MM-DD) */
  dateFrom: string;
  /** End date (YYYY-MM-DD) */
  dateTo: string;
  /** Comma-separated statuses: completed,no-answer,busy,failed */
  status?: string;
  /** Filter by ExoPhone number (To number for inbound) */
  phoneNumber?: string;
  /** Records per page (max 100) */
  pageSize?: number;
}

export interface FetchCallRecordsResponse {
  Metadata: {
    Total?: number;
    PageSize?: number;
    FirstPageUri?: string;
    PrevPageUri?: string;
    NextPageUri?: string;
  };
  Calls: ExotelCallRecord[];
}

export interface MakeCallParams {
  /** Counselor phone — Exotel calls this FIRST */
  from: string;
  /** Prospect phone — bridged after counselor picks up */
  to: string;
  /** DB record UUID for webhook correlation */
  customField: string;
  /** URL Exotel will POST status updates to */
  statusCallbackUrl: string;
  /** Override default ExoPhone caller ID */
  callerId?: string;
  /** Max ring time in seconds */
  timeLimit?: number;
}

export interface ExotelCallResponse {
  callSid: string;
  status: string;
  raw?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const MODULE = 'telephony/exotel';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export class ExotelClient {
  private readonly apiKey: string;
  private readonly apiToken: string;
  private readonly accountSid: string;
  private readonly subdomain: string;
  private readonly callerId: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor() {
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const accountSid = process.env.EXOTEL_ACCOUNT_SID;
    const callerId = process.env.EXOTEL_CALLER_ID;

    const missing: string[] = [];
    if (!apiKey) missing.push('EXOTEL_API_KEY');
    if (!apiToken) missing.push('EXOTEL_API_TOKEN');
    if (!accountSid) missing.push('EXOTEL_ACCOUNT_SID');
    if (!callerId) missing.push('EXOTEL_CALLER_ID');

    if (missing.length > 0) {
      throw new ExotelConfigError(missing);
    }

    this.apiKey = apiKey!;
    this.apiToken = apiToken!;
    this.accountSid = accountSid!;
    this.callerId = callerId!;
    this.subdomain = process.env.EXOTEL_SUBDOMAIN || 'api.in.exotel.com';
    this.timeout = DEFAULT_TIMEOUT_MS;
    this.maxRetries = MAX_RETRIES;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getAuthHeader(): string {
    const credentials = Buffer.from(
      `${this.apiKey}:${this.apiToken}`,
    ).toString('base64');
    return `Basic ${credentials}`;
  }

  private getBaseUrl(version: 'v1' | 'v2' = 'v1'): string {
    return `https://${this.subdomain}/${version}/Accounts/${this.accountSid}`;
  }

  private isRetryable(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private async request<T = any>(
    method: 'GET' | 'POST',
    path: string,
    body?: URLSearchParams,
  ): Promise<T> {
    const url = `${this.getBaseUrl('v1')}${path}`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const headers: Record<string, string> = {
          Authorization: this.getAuthHeader(),
          Accept: 'application/json',
        };

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (body && method === 'POST') {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          fetchOptions.body = body.toString();
        }

        const response = await fetch(url, fetchOptions);

        clearTimeout(timer);

        // Parse response body
        let responseBody: any;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        // Success
        if (response.ok) {
          return responseBody as T;
        }

        // Rate limit
        if (response.status === 429) {
          if (attempt < this.maxRetries) {
            const delay = 1000 * (attempt + 1);
            logger.warn(MODULE, `Rate limited (429), retrying in ${delay}ms`, {
              attempt: attempt + 1,
              maxRetries: this.maxRetries,
            });
            await this.sleep(delay);
            continue;
          }
          throw new ExotelRateLimitError();
        }

        // Server error — retryable
        if (response.status >= 500) {
          if (attempt < this.maxRetries) {
            const delay = 1000 * (attempt + 1);
            logger.warn(MODULE, `Server error (${response.status}), retrying in ${delay}ms`, {
              attempt: attempt + 1,
              maxRetries: this.maxRetries,
            });
            await this.sleep(delay);
            continue;
          }
        }

        // Client error (4xx) or exhausted retries on 5xx — throw immediately
        throw new ExotelApiError(
          `Exotel API error: ${response.status} ${response.statusText}`,
          response.status,
          responseBody,
        );
      } catch (error) {
        clearTimeout(timer);

        // Re-throw our own errors
        if (error instanceof ExotelError) {
          throw error;
        }

        // Abort / timeout
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (attempt < this.maxRetries) {
            const delay = 1000 * (attempt + 1);
            logger.warn(MODULE, `Request timed out, retrying in ${delay}ms`, {
              attempt: attempt + 1,
            });
            await this.sleep(delay);
            continue;
          }
          throw new ExotelNetworkError(
            `Exotel request timed out after ${this.timeout}ms`,
          );
        }

        // Other network errors
        if (attempt < this.maxRetries) {
          const delay = 1000 * (attempt + 1);
          logger.warn(MODULE, `Network error, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            error: String(error),
          });
          await this.sleep(delay);
          continue;
        }

        throw new ExotelNetworkError(
          `Exotel network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Should not reach here, but satisfy TypeScript
    throw new ExotelNetworkError('Exotel request failed after all retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Make a request to a full URL (used for cursor pagination where NextPageUri is absolute).
   */
  private async requestFullUrl<T = any>(method: 'GET' | 'POST', url: string): Promise<T> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: this.getAuthHeader(),
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timer);

        let responseBody: any;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        if (response.ok) return responseBody as T;

        if (response.status === 429 && attempt < this.maxRetries) {
          await this.sleep(1000 * (attempt + 1));
          continue;
        }

        if (response.status >= 500 && attempt < this.maxRetries) {
          await this.sleep(1000 * (attempt + 1));
          continue;
        }

        throw new ExotelApiError(
          `Exotel API error: ${response.status} ${response.statusText}`,
          response.status,
          responseBody,
        );
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof ExotelError) throw error;
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * (attempt + 1));
          continue;
        }
        throw new ExotelNetworkError(
          `Exotel network error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    throw new ExotelNetworkError('Exotel request failed after all retries');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Initiate an outbound call via Exotel.
   *
   * Exotel calls the `from` number (counselor) first. Once the counselor
   * picks up, it bridges to the `to` number (prospect).
   */
  async makeCall(params: MakeCallParams): Promise<ExotelCallResponse> {
    const fromFormatted = toExotelFormat(params.from);
    const toFormatted = toExotelFormat(params.to);
    const callerId = params.callerId || this.callerId;

    logger.info(MODULE, 'Initiating call', {
      from: maskPhone(params.from),
      to: maskPhone(params.to),
      customField: params.customField,
    });

    const body = new URLSearchParams();
    body.append('From', fromFormatted);
    body.append('To', toFormatted);
    body.append('CallerId', callerId);
    body.append('CustomField', params.customField);
    body.append('StatusCallback', params.statusCallbackUrl);
    body.append('StatusCallbackEvents[0]', 'terminal');
    body.append('StatusCallbackEvents[1]', 'answered');

    if (params.timeLimit) {
      body.append('TimeLimit', String(params.timeLimit));
    }

    const data = await this.request<{ Call: { Sid: string; Status: string; [key: string]: any } }>(
      'POST',
      '/Calls/connect.json',
      body,
    );

    const callSid = data.Call.Sid;
    const status = data.Call.Status;

    logger.info(MODULE, 'Call initiated', {
      callSid,
      status,
      from: maskPhone(params.from),
      to: maskPhone(params.to),
    });

    return {
      callSid,
      status,
      raw: data.Call,
    };
  }

  /**
   * Fetch call detail records in bulk with cursor-based pagination.
   * Yields arrays of call records, one page at a time.
   * Use Direction=inbound to fetch incoming calls.
   */
  async *fetchCallRecords(
    params: FetchCallRecordsParams
  ): AsyncGenerator<ExotelCallRecord[], void, unknown> {
    const queryParams = new URLSearchParams();

    // Date range filter (required, max 31 days per Exotel API)
    queryParams.set('DateCreated', `gte:${params.dateFrom} 00:00:00;lte:${params.dateTo} 23:59:59`);

    if (params.direction) {
      queryParams.set('Direction', params.direction);
    }
    if (params.status) {
      queryParams.set('Status', params.status);
    }
    if (params.phoneNumber) {
      queryParams.set('PhoneNumber', params.phoneNumber);
    }

    const pageSize = Math.min(params.pageSize || 100, 100);
    queryParams.set('PageSize', String(pageSize));
    queryParams.set('SortBy', 'DateCreated:desc');
    queryParams.set('details', 'true');

    let path = `/Calls.json?${queryParams.toString()}`;
    let pageCount = 0;
    const maxPages = 50; // Safety limit: 50 pages * 100 records = 5,000 calls max per sync

    while (path && pageCount < maxPages) {
      logger.info(MODULE, 'Fetching CDR page', { page: pageCount + 1, direction: params.direction });

      const url = path.startsWith('http')
        ? path // NextPageUri from Exotel may be a full URL
        : `${this.getBaseUrl('v1')}${path}`;

      const response = await this.requestFullUrl<FetchCallRecordsResponse>('GET', url);

      if (response.Calls && response.Calls.length > 0) {
        yield response.Calls;
      }

      // Follow cursor pagination
      const nextUri = response.Metadata?.NextPageUri;
      if (nextUri && response.Calls?.length === pageSize) {
        path = nextUri;
        pageCount++;
      } else {
        break;
      }
    }

    if (pageCount >= maxPages) {
      logger.warn(MODULE, `CDR fetch hit max page limit (${maxPages})`, {
        direction: params.direction,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
    }
  }

  /**
   * Retrieve details of an existing call by its SID.
   */
  async getCallDetails(callSid: string): Promise<Record<string, any>> {
    logger.info(MODULE, 'Fetching call details', { callSid });

    const data = await this.request<{ Call: Record<string, any> }>(
      'GET',
      `/Calls/${callSid}.json`,
    );

    return data.Call;
  }
}

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

let _client: ExotelClient | null = null;

/**
 * Returns a lazily-initialized singleton ExotelClient.
 * When EXOTEL_MOCK=true, returns a MockExotelClient instead.
 * Throws ExotelConfigError if required env vars are missing (non-mock mode).
 */
export function getExotelClient(): ExotelClient {
  if (!_client) {
    if (process.env.EXOTEL_MOCK === 'true') {
      const { MockExotelClient } = require('./exotel-client-mock');
      _client = new MockExotelClient() as unknown as ExotelClient;
    } else {
      _client = new ExotelClient();
    }
  }
  return _client;
}

/**
 * Check whether Exotel environment variables are configured
 * without throwing an error.
 */
export function isExotelConfigured(): boolean {
  return !!(
    process.env.EXOTEL_API_KEY &&
    process.env.EXOTEL_API_TOKEN &&
    process.env.EXOTEL_ACCOUNT_SID &&
    process.env.EXOTEL_CALLER_ID
  );
}

/**
 * Reset the singleton client instance. Useful for testing.
 */
export function resetExotelClient(): void {
  _client = null;
}
