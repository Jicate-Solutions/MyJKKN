// lib/meta/graph-api-client.ts
// Parameterized base client for the Meta Graph API.
//
// Server-only by convention. Wraps fetch() with:
//   - version-pinned base URL (default v25.0 — see DEFAULT_GRAPH_API_VERSION)
//   - Bearer-token auth header
//   - JSON parse + normalized MetaGraphError on non-2xx
//   - Sentry span instrumentation
//   - Rate-limit header parsing (x-app-usage, x-business-use-case-usage,
//     x-ad-account-usage) surfaced to callers via MetaGraphResponse.rateLimit
//
// Product clients (WhatsApp, Instagram, Facebook Pages, etc.) layer on top by
// importing `graphRequest` and adding their own product-specific methods and
// response types. Do NOT import this from a client component — `@sentry/nextjs`
// instrumentation here is server-only.

import * as Sentry from '@sentry/nextjs';

import {
  DEFAULT_GRAPH_API_BASE,
  DEFAULT_GRAPH_API_VERSION,
  MetaGraphError,
  type MetaGraphCallConfig,
  type MetaGraphErrorResponse,
  type MetaGraphResponse,
  type RateLimitInfo,
} from '@/lib/meta/types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildUrl(args: {
  endpoint: string;
  apiBase: string;
  apiVersion: string;
  query?: Record<string, string | number | boolean | undefined>;
}): string {
  // Allow callers to pass either `/me` or `me`. Normalize to leading slash.
  const path = args.endpoint.startsWith('/') ? args.endpoint : `/${args.endpoint}`;
  const url = new URL(`${args.apiBase}/${args.apiVersion}${path}`);

  if (args.query) {
    for (const [k, v] of Object.entries(args.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  return url.toString();
}

/**
 * Best-effort JSON parse of a Meta usage header. Headers may be absent or
 * empty on some endpoints; we never throw — invalid input returns undefined.
 */
function parseUsageHeader(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Walks a usage object looking for any nested number >= 80. Meta's structure
 * varies (app-usage is flat; business-use-case-usage is keyed by business id
 * then array-of-objects). Conservative — when in doubt, returns false.
 */
function usageNearLimit(usage: Record<string, unknown> | undefined): boolean {
  if (!usage) return false;
  const stack: unknown[] = [usage];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || node === undefined) continue;
    if (typeof node === 'number') {
      if (node >= 80) return true;
      continue;
    }
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    if (typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) {
        stack.push(value);
      }
    }
  }
  return false;
}

function extractRateLimit(headers: Headers): RateLimitInfo {
  const appUsage = parseUsageHeader(headers.get('x-app-usage'));
  const businessUseCaseUsage = parseUsageHeader(
    headers.get('x-business-use-case-usage')
  );
  const adAccountUsage = parseUsageHeader(headers.get('x-ad-account-usage'));

  const nearLimit =
    usageNearLimit(appUsage) ||
    usageNearLimit(businessUseCaseUsage) ||
    usageNearLimit(adAccountUsage);

  return { appUsage, businessUseCaseUsage, adAccountUsage, nearLimit };
}

// ---------------------------------------------------------------------------
// Public client
// ---------------------------------------------------------------------------

export interface GraphRequestOptions extends MetaGraphCallConfig {
  /**
   * Endpoint path AFTER the version segment, e.g. `/me`, `/123456/phone_numbers`.
   * Leading slash optional; will be added if missing.
   */
  endpoint: string;
  /**
   * HTTP method. Defaults to 'GET'.
   */
  method?: 'GET' | 'POST' | 'DELETE';
  /**
   * Query-string parameters. The `access_token` param is NEVER set here —
   * authentication uses the Authorization header. Pass `fields`, `since`,
   * `until`, `limit`, etc. here.
   */
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * JSON body for POST. Will be stringified and sent as
   * `Content-Type: application/json`.
   */
  body?: unknown;
  /**
   * Per-call fetch timeout in milliseconds. Defaults to 15000 (15s) — Meta
   * occasionally hangs on large-cursor reads. Callers that need longer (e.g.
   * insights aggregations) can override.
   */
  timeoutMs?: number;
}

/**
 * Low-level Meta Graph request. Throws `MetaGraphError` on non-2xx and on
 * Meta-payload errors that arrive with a 200 (rare but real — some legacy
 * Graph endpoints return `{ error: ... }` with status 200).
 *
 * Returns the parsed body alongside HTTP status and rate-limit telemetry.
 */
export async function graphRequest<T>(
  options: GraphRequestOptions
): Promise<MetaGraphResponse<T>> {
  const apiBase = options.apiBase || DEFAULT_GRAPH_API_BASE;
  const apiVersion = options.apiVersion || DEFAULT_GRAPH_API_VERSION;
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs ?? 15000;

  if (!options.accessToken) {
    throw new MetaGraphError({
      message: 'Meta Graph API call missing accessToken',
      status: 0,
    });
  }

  const url = buildUrl({
    endpoint: options.endpoint,
    apiBase,
    apiVersion,
    query: options.query,
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
    Accept: 'application/json',
  };

  let bodyInit: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyInit = JSON.stringify(options.body);
  }

  const spanOp = options.sentryOp || 'meta.graph';
  const spanName = options.sentrySpanName || `${method} ${options.endpoint}`;

  return Sentry.startSpan({ op: spanOp, name: spanName }, async () => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: bodyInit,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new MetaGraphError({
          message: `Meta Graph request timed out after ${timeoutMs}ms: ${spanName}`,
          status: 0,
        });
      }
      throw new MetaGraphError({
        message: `Meta Graph request failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        status: 0,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }

    const rateLimit = extractRateLimit(response.headers);

    let parsed: unknown;
    try {
      // Meta always returns JSON for documented endpoints; if Content-Type
      // is missing we still attempt parse because Meta sometimes omits it.
      parsed = await response.json();
    } catch {
      // Non-JSON response (e.g. infrastructure HTML error page from edge).
      throw new MetaGraphError({
        message: `Meta Graph returned non-JSON response (status ${response.status})`,
        status: response.status,
      });
    }

    // Some Graph endpoints return 200 with `{ error: { ... } }` — handle both
    // shapes uniformly.
    const maybeError = (parsed as MetaGraphErrorResponse | undefined)?.error;
    if (!response.ok || maybeError) {
      throw new MetaGraphError({
        message:
          maybeError?.message ||
          `Meta Graph error: HTTP ${response.status}`,
        status: response.status,
        payload: maybeError,
      });
    }

    return {
      data: parsed as T,
      status: response.status,
      rateLimit,
    };
  });
}

/**
 * Convenience wrapper that discards rate-limit + status and returns just the
 * parsed payload. Use this when you don't need to react to rate-limit signals
 * inline.
 */
export async function graphRequestData<T>(
  options: GraphRequestOptions
): Promise<T> {
  const res = await graphRequest<T>(options);
  return res.data;
}
