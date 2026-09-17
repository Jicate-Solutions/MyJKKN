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

/**
 * Strip credentials out of a message before it is thrown, logged or persisted.
 *
 * Why this exists: when the configured Meta token contains an illegal header
 * character (a stray line break survives a copy-paste into the env var),
 * `fetch` rejects inside `Headers.append`, and the DOM spec puts the OFFENDING
 * HEADER VALUE — i.e. the whole Bearer token — into the error message. That
 * message is interpolated into MetaGraphError below, and several cron routes
 * persist it verbatim into `social_instagram_logs.error_message`.
 *
 * Measured on production 2026-09-08: 3,536 rows already carry a Bearer prefix,
 * accumulating since 19 June from `stories_poll` and one sibling job. The table
 * has RLS, but every holder of `social.instagram.view` can read those rows.
 *
 * Redaction is deliberately broad — a token that is merely *suspected* is still
 * redacted, because a lost diagnostic string costs far less than a leaked
 * credential. Meta user/page/system tokens start `EAA`; the generic Bearer and
 * access_token forms cover the rest.
 */
export function redactCredentials(message: string): string {
  return (
    message
      // FIRST, and the reason this function exists: the DOM quotes the whole
      // offending header value back at you. Because the stored token contains a
      // LINE BREAK, a token-shaped pattern anchored on Bearer stops at that
      // break and leaves the remainder in the clear. Measured on production
      // 2026-09-09: all 29 rows written after the first version of this
      // function still carried 20+ raw token characters after the redaction
      // marker, every one of them containing a newline. Redact the quoted
      // value whole and the split cannot matter.
      .replace(/(Headers\.\w+:\s*)"[\s\S]*?"/g, '$1"[REDACTED_HEADER_VALUE]"')
      // Bearer followed by token characters that may be interrupted by
      // whitespace or control characters — the split-token case again, for any
      // message that is not the Headers one.
      .replace(
        /Bearer(?:[\s\u0000-\u001f]|%0A)*[A-Za-z0-9._\-]{8,}(?:(?:[\s\u0000-\u001f]|%0A)+[A-Za-z0-9._\-]+)*/gi,
        'Bearer [REDACTED]'
      )
      .replace(/\bEAA[A-Za-z0-9]{12,}/g, '[REDACTED_META_TOKEN]')
      .replace(/(access_token=)[^&\s"']+/gi, '$1[REDACTED]')
  );
}

/**
 * The env vars a Meta token is normally read from, in fallback order. Named in
 * the warning below; a caller that reads a different var passes its own label.
 */
const META_TOKEN_ENV_CHAIN =
  'META_IG_SYSTEM_USER_TOKEN / MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN';

const warnedTokenSources = new Set<string>();

/**
 * Remove every whitespace character from a Meta access token.
 *
 * Why this exists: the production token was pasted into its Vercel env var
 * with a line break in the MIDDLE of the value (ig-stories-poll/route.ts
 * records ~129 characters surviving after it), so `Headers.append` rejects the
 * Bearer header and every Graph call throws. `.trim()` cannot fix a mid-value
 * break. Meta tokens never contain whitespace, so stripping all of it loses
 * nothing.
 *
 * Warns once per token source per process when something was removed: the
 * count only, never any token character. The durable fix is still re-adding
 * the env var from an unwrapped copy.
 */
export function normalizeMetaToken(
  raw?: string | null,
  source = META_TOKEN_ENV_CHAIN
): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/\s+/g, '');
  const removed = raw.length - cleaned.length;
  if (removed > 0 && !warnedTokenSources.has(source)) {
    warnedTokenSources.add(source);
    console.warn(
      `[meta] Removed ${removed} whitespace character(s) from the Meta access token (${source}). ` +
        'Meta tokens never contain whitespace, so the stored value was pasted with a line break. ' +
        'The cleaned token is used for now; the durable fix is to re-add the env var from an unwrapped copy ' +
        `(printf '%s' "$TOKEN" | vercel env add <NAME> production) and redeploy.`
    );
  }
  return cleaned || undefined;
}

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

  // Strip whitespace BEFORE the header is built: a token pasted with a line
  // break makes Headers.append throw (see normalizeMetaToken).
  const accessToken = normalizeMetaToken(
    options.accessToken,
    `${META_TOKEN_ENV_CHAIN}, or a per-account token stored in the database`
  );
  if (!accessToken) {
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
    Authorization: `Bearer ${accessToken}`,
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
          message: redactCredentials(`Meta Graph request timed out after ${timeoutMs}ms: ${spanName}`),
          status: 0,
        });
      }
      throw new MetaGraphError({
        message: redactCredentials(
          `Meta Graph request failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        ),
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
