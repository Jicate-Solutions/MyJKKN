/**
 * COE REST API Client (Server-side only)
 *
 * HTTP client for calling COE's external REST API with API key authentication.
 * Used by Internal Marks (CIA) module API routes.
 *
 * NEVER import this file from client/browser code — API keys must stay server-side.
 *
 * Reads credentials from environment variables:
 *   COE_API_URL       — Base URL (e.g., http://localhost:3000 or https://coe.jkkn.ai)
 *   COE_API_KEY_ID    — X-API-Key-Id header value
 *   COE_API_SECRET    — X-API-Secret header value
 *
 * Usage in API routes:
 *   const client = CoeRestClient.create();
 *   const settings = await client.get<CiaSettings[]>('/api/v1/cia-settings', { institutions_id: '...' });
 */

export class CoeRestClient {
  private baseUrl: string;
  private apiKeyId: string;
  private apiSecret: string;

  private constructor(baseUrl: string, apiKeyId: string, apiSecret: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKeyId = apiKeyId;
    this.apiSecret = apiSecret;
  }

  /**
   * Creates a client using environment variables.
   * All institutions share the same credentials from .env.
   */
  static create(): CoeRestClient {
    const baseUrl = process.env.COE_API_URL;
    const apiKeyId = process.env.COE_API_KEY_ID;
    const apiSecret = process.env.COE_API_SECRET;

    if (!baseUrl || !apiKeyId || !apiSecret) {
      throw new Error(
        'COE API credentials not configured. ' +
          'Set COE_API_URL, COE_API_KEY_ID, and COE_API_SECRET in .env'
      );
    }

    return new CoeRestClient(baseUrl, apiKeyId, apiSecret);
  }

  /**
   * GET request to COE API.
   */
  async get<T>(
    path: string,
    params?: Record<string, string | undefined>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      });
    }

    return this.request<T>('GET', url.toString());
  }

  /**
   * POST request to COE API.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', `${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
    });
  }

  /**
   * Internal: sends authenticated request with retry on 429.
   */
  private async request<T>(
    method: string,
    url: string,
    options?: RequestInit
  ): Promise<T> {
    const headers: Record<string, string> = {
      'X-API-Key-Id': this.apiKeyId,
      'X-API-Secret': this.apiSecret,
      'Content-Type': 'application/json',
    };

    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(url, {
        method,
        headers,
        ...options,
      });

      // Rate limited — retry with exponential backoff
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage =
          errorBody.error || errorBody.message || `COE API error: ${response.status}`;

        throw new CoeApiError(errorMessage, response.status, errorBody.details);
      }

      return response.json() as Promise<T>;
    }

    throw new CoeApiError('COE API rate limit exceeded after retries', 429);
  }
}

/**
 * Typed error for COE API failures.
 */
export class CoeApiError extends Error {
  status: number;
  details?: string[];

  constructor(message: string, status: number, details?: string[]) {
    super(message);
    this.name = 'CoeApiError';
    this.status = status;
    this.details = details;
  }
}
