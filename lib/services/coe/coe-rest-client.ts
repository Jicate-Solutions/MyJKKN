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

/**
 * Global COE concurrency limiter (semaphore).
 *
 * COE rate-limits PER KEY, and all MyJKKN learners share one key. On high-load
 * moments (e.g. 300+ students opening results at once) an unbounded burst of
 * requests trips COE's 429 limit. This caps the total number of in-flight COE
 * requests across the whole app — excess requests queue for a slot rather than
 * bursting. It is the core backpressure guard for the shared key.
 *
 * Tune with COE_MAX_CONCURRENCY (default 6). The slot is held across 429
 * retry/backoff on purpose, so a retrying request doesn't let new ones flood in.
 */
const MAX_CONCURRENT_COE_REQUESTS = (() => {
  const n = Number(process.env.COE_MAX_CONCURRENCY);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 6;
})();

let activeCoeRequests = 0;
const coeWaitQueue: Array<() => void> = [];

/**
 * GET response cache + single-flight (M4 + M5 + M6).
 *
 * - Single-flight: concurrent identical GETs share ONE upstream request. On a
 *   result-day burst (300 students), 300 identical session-level fetches collapse
 *   to 1 COE call. This alone removes most duplicate load and the thundering herd.
 * - TTL cache: successful GET responses are memoized for a short window, so repeat
 *   views / navigations don't re-hit COE. Per-server-instance (serverless), which
 *   is still a large win because each warm instance serves many requests.
 * - Jitter: a small random spread on the TTL avoids many entries expiring at the
 *   exact same instant.
 *
 * Per-student safety: MyJKKN routes filter to the caller's own register_number
 * AFTER the COE response, exactly as before — caching memoizes the same upstream
 * payload the route already fetched-then-filtered, so the security boundary is
 * unchanged. Only GETs are cached; writes (POST/PUT/DELETE) never are.
 *
 * Tune with COE_CACHE_TTL_MS (default 60000; set 0 to disable caching while
 * keeping single-flight).
 */
const DEFAULT_COE_CACHE_TTL_MS = (() => {
  const n = Number(process.env.COE_CACHE_TTL_MS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 60_000;
})();

interface CoeCacheEntry {
  value: unknown;
  expiry: number;
}
const coeGetCache = new Map<string, CoeCacheEntry>();
const coeInFlightGets = new Map<string, Promise<unknown>>();

async function coeCachedGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number
): Promise<T> {
  const now = Date.now();

  // 1. Fresh cache hit — no COE call, no semaphore slot.
  if (ttlMs > 0) {
    const cached = coeGetCache.get(key);
    if (cached && cached.expiry > now) return cached.value as T;
  }

  // 2. Single-flight: join an identical request already in flight.
  const existing = coeInFlightGets.get(key);
  if (existing) return existing as Promise<T>;

  // 3. Start the request; cache the result on success.
  const promise = (async () => {
    const value = await fetcher();
    if (ttlMs > 0) {
      // ±10% jitter so entries don't all expire at the same instant.
      const jitter = ttlMs * (0.9 + Math.random() * 0.2);
      coeGetCache.set(key, { value, expiry: Date.now() + jitter });
    }
    return value;
  })();
  coeInFlightGets.set(key, promise);
  try {
    return (await promise) as T;
  } finally {
    coeInFlightGets.delete(key);
  }
}

function acquireCoeSlot(): Promise<void> {
  if (activeCoeRequests < MAX_CONCURRENT_COE_REQUESTS) {
    activeCoeRequests++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => coeWaitQueue.push(resolve));
}

function releaseCoeSlot(): void {
  const next = coeWaitQueue.shift();
  if (next) {
    // Hand the slot directly to the next waiter (count stays the same).
    next();
  } else {
    activeCoeRequests = Math.max(0, activeCoeRequests - 1);
  }
}

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
   *
   * Routed through the cache + single-flight layer (M4/M5/M6): concurrent
   * identical GETs share one upstream call, and successful responses are cached
   * for `opts.cacheTtlMs` (default COE_CACHE_TTL_MS, 60s). Pass `cacheTtlMs: 0`
   * to bypass caching while still benefiting from single-flight de-duplication.
   */
  async get<T>(
    path: string,
    params?: Record<string, string | undefined>,
    opts?: { cacheTtlMs?: number }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      });
    }

    const urlStr = url.toString();
    const ttlMs = opts?.cacheTtlMs ?? DEFAULT_COE_CACHE_TTL_MS;
    return coeCachedGet<T>(urlStr, () => this.request<T>('GET', urlStr), ttlMs);
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
   * PUT request to COE API. Used for partial updates (e.g. PUT /api/v1/courses/{id}).
   */
  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', `${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request to COE API. Supports optional query params (e.g. ?check=true for dry-run).
   */
  async delete<T>(
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
    return this.request<T>('DELETE', url.toString());
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

    // Acquire a global slot before hitting COE — caps total in-flight requests
    // across the app so concurrent load never bursts the per-key rate limit.
    await acquireCoeSlot();
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, {
          method,
          headers,
          ...options,
        });

        // Rate limited — retry with exponential backoff (slot stays held).
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

          throw new CoeApiError(errorMessage, response.status, errorBody.details, errorBody);
        }

        return response.json() as Promise<T>;
      }

      throw new CoeApiError('COE API rate limit exceeded after retries', 429);
    } finally {
      releaseCoeSlot();
    }
  }
}

/**
 * Typed error for COE API failures.
 */
export class CoeApiError extends Error {
  status: number;
  details?: string[];
  /**
   * The raw JSON error body COE returned.
   *
   * Some COE endpoints answer with a MACHINE code in `error` and the readable
   * sentence in `message` — e.g. the IA save route's
   * `{ error: "WOULD_CLEAR", message: "This save would erase..." }`. `this.message`
   * resolves to `error` first (unchanged, so existing callers keep their
   * behaviour), which for those endpoints is the bare code. A route that needs
   * to branch on the code AND show the sentence reads them off here instead.
   *
   * See COE docs/ia-question-paper-entry-spec.md 9.4: "Coded errors carry the
   * readable text in `message`, not `error`."
   */
  body?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    details?: string[],
    body?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CoeApiError';
    this.status = status;
    this.details = details;
    this.body = body;
  }
}
