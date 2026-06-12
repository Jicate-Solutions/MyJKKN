// lib/meta/types.ts
// Shared Meta Graph API types used across product clients (WhatsApp, Instagram,
// Facebook Pages, etc.). Server-only by convention.

// ---------------------------------------------------------------------------
// API version
// ---------------------------------------------------------------------------

/**
 * Default Graph API version. Pinning here avoids accidental drift when Meta
 * releases new versions.
 *
 * Bumped v21.0 → v25.0 on 2026-06-11 (#1282 follow-up): every route touched
 * in the 2026-06 social sprint already pins v25.0 explicitly; this aligns the
 * remaining default-version callers (ads sync/discover, CAPI/pixel, IG DM,
 * stories sync, messenger send, leadgen webhook + backfill, facebook
 * accounts sync/discover) with the same version. The WhatsApp admission
 * routes use their own hardcoded v21.0 fetch URLs and are unaffected.
 *
 * NOTE: Meta supports a published version for ~2 years. Bump deliberately;
 * don't track latest.
 */
export const DEFAULT_GRAPH_API_VERSION = 'v25.0';

export const DEFAULT_GRAPH_API_BASE = 'https://graph.facebook.com';

// ---------------------------------------------------------------------------
// Error shape
// ---------------------------------------------------------------------------

/**
 * Raw error returned by the Meta Graph API in the response body when a call
 * fails. See https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */
export interface MetaGraphErrorPayload {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
  is_transient?: boolean;
}

/**
 * Wrapper Meta uses around the error payload in JSON responses.
 */
export interface MetaGraphErrorResponse {
  error: MetaGraphErrorPayload;
}

/**
 * Normalized error thrown by the Graph API client. Carries the HTTP status, the
 * raw Meta payload (when present), and a human-readable message so callers can
 * route on either `code`/`subcode` or `status`.
 */
export class MetaGraphError extends Error {
  public readonly status: number;
  public readonly code?: number;
  public readonly subcode?: number;
  public readonly type?: string;
  public readonly fbtraceId?: string;
  public readonly isTransient: boolean;
  public readonly payload?: MetaGraphErrorPayload;

  constructor(args: {
    message: string;
    status: number;
    payload?: MetaGraphErrorPayload;
  }) {
    super(args.message);
    this.name = 'MetaGraphError';
    this.status = args.status;
    this.code = args.payload?.code;
    this.subcode = args.payload?.error_subcode;
    this.type = args.payload?.type;
    this.fbtraceId = args.payload?.fbtrace_id;
    this.isTransient = Boolean(args.payload?.is_transient);
    this.payload = args.payload;
  }
}

// ---------------------------------------------------------------------------
// Rate-limit awareness
// ---------------------------------------------------------------------------

/**
 * Meta returns app/business usage telemetry in response headers. This is the
 * normalized shape the client surfaces to callers. All fields are best-effort —
 * Meta does not document the schema as stable, and some endpoints omit headers.
 *
 * Header sources:
 *   x-app-usage                  → appUsage
 *   x-business-use-case-usage    → businessUseCaseUsage
 *   x-ad-account-usage           → adAccountUsage (ads only)
 */
export interface RateLimitInfo {
  /** Parsed `x-app-usage` (per-app throttle) */
  appUsage?: Record<string, unknown>;
  /** Parsed `x-business-use-case-usage` (per-business throttle, per use case) */
  businessUseCaseUsage?: Record<string, unknown>;
  /** Parsed `x-ad-account-usage` (ads endpoints only) */
  adAccountUsage?: Record<string, unknown>;
  /**
   * Convenience flag — true if any of the parsed usage objects indicates
   * call_count, total_time, or total_cputime >= 80%.
   */
  nearLimit: boolean;
}

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

/**
 * Per-call config for product clients built on top of the base Graph client.
 * Callers pass the long-lived system-user / page / business token they want
 * to authenticate with.
 */
export interface MetaGraphCallConfig {
  /** Access token used as `Authorization: Bearer <token>` */
  accessToken: string;
  /**
   * Override the Graph API version for this call (rare — used during version
   * deprecation windows). Falls back to DEFAULT_GRAPH_API_VERSION.
   */
  apiVersion?: string;
  /**
   * Override the Graph API base host (rare — used by tests or for Meta's edge
   * routing). Falls back to DEFAULT_GRAPH_API_BASE.
   */
  apiBase?: string;
  /**
   * Sentry span name override. Defaults to the endpoint path.
   */
  sentrySpanName?: string;
  /**
   * Override the Sentry op tag for grouping (default: 'meta.graph').
   * Product clients should pass e.g. 'meta.instagram' so different products
   * surface as separate Sentry transactions.
   */
  sentryOp?: string;
}

/**
 * The shape returned by the low-level client. Includes parsed body, raw status,
 * and rate-limit telemetry so callers can react before they get throttled.
 */
export interface MetaGraphResponse<T> {
  data: T;
  status: number;
  rateLimit: RateLimitInfo;
}

// ---------------------------------------------------------------------------
// Generic Graph list envelope
// ---------------------------------------------------------------------------

/**
 * Meta returns list endpoints wrapped in `{ data: [...], paging: { cursors,
 * next, previous } }`. We type the envelope here so product clients don't
 * each re-declare it.
 */
export interface MetaGraphListResponse<T> {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}
