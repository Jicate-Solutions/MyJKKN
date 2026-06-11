/**
 * Instagram Business Login client (Track 3).
 *
 * Everything here talks to the INSTAGRAM-LOGIN side of Meta's split:
 *   - www.instagram.com/oauth/authorize   (user authorization)
 *   - api.instagram.com/oauth/access_token (code → short-lived token)
 *   - graph.instagram.com                  (long-lived exchange, refresh,
 *                                           /me, /me/insights, /me/media)
 *
 * NOT to be confused with lib/instagram/api-client.ts, which talks to
 * graph.facebook.com (Facebook Login, Page-linked accounts, system token).
 * An Instagram-Login token does not work on graph.facebook.com and vice
 * versa — that split is exactly why metrics_source='instagram_login' is a
 * separate poller lane.
 *
 * Config (all server-only env):
 *   INSTAGRAM_APP_ID      — Instagram App ID from the app's Instagram >
 *                           Business Login product (NOT the Meta App ID).
 *   INSTAGRAM_APP_SECRET  — Instagram App Secret (same product page).
 *   INSTAGRAM_REDIRECT_URI — optional override; defaults to production.
 *
 * Until INSTAGRAM_APP_ID/SECRET are set, the connect flow is dormant:
 * routes respond 503 "not configured".
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const IG_GRAPH = 'https://graph.instagram.com';
const IG_GRAPH_VERSIONED = 'https://graph.instagram.com/v25.0';
const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

/** Scopes needed for profile + insights reads. */
export const IG_LOGIN_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
];

const DEFAULT_REDIRECT_URI =
  'https://www.jkkn.ai/api/social/instagram/connect/callback';

/** Connect links stay valid this long (shareable to dept staff over chat). */
export const STATE_TTL_MS = 24 * 60 * 60 * 1000;

export class IgLoginError extends Error {
  code?: number;
  subcode?: number;
  constructor(message: string, code?: number, subcode?: number) {
    super(message);
    this.name = 'IgLoginError';
    this.code = code;
    this.subcode = subcode;
  }
  /** OAuthException 190 = token invalid/expired — connection needs reauth. */
  get isTokenError(): boolean {
    return this.code === 190;
  }
}

export function igLoginConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

export function getRedirectUri(): string {
  return process.env.INSTAGRAM_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

// ---------------------------------------------------------------------------
// State param — HMAC-signed, so connect links are shareable (the person who
// authorizes is the dept staffer logged into that IG account on their own
// device, not the admin who clicked the button). Payload binds the link to a
// social_dept_accounts row; the signature (keyed on the app secret) prevents
// forgery; the timestamp bounds the window.
// ---------------------------------------------------------------------------

interface StatePayload {
  /** social_dept_accounts.id this connect link was issued for */
  d: string;
  /** nonce */
  n: string;
  /** issued-at (ms epoch) */
  t: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hmac(data: string): Buffer {
  return createHmac('sha256', process.env.INSTAGRAM_APP_SECRET || '')
    .update(data)
    .digest();
}

export function signState(deptAccountId: string): string {
  const payload: StatePayload = {
    d: deptAccountId,
    n: randomBytes(8).toString('hex'),
    t: Date.now(),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${body}.${b64url(hmac(body))}`;
}

export interface StateVerification {
  ok: boolean;
  /** set when ok */
  deptAccountId: string | null;
  /** set when !ok */
  reason: string | null;
}

// Single shape (not a discriminated union): the repo compiles with
// strictNullChecks:false, under which `!result.ok` does not narrow a union —
// callers must check both `ok` and `deptAccountId`.
export function verifyState(state: string): StateVerification {
  const fail = (reason: string): StateVerification => ({
    ok: false,
    deptAccountId: null,
    reason,
  });
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return fail('malformed state');
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = b64url(hmac(body));
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return fail('bad signature');
  }
  let payload: StatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as StatePayload;
  } catch {
    return fail('unparseable state');
  }
  if (!payload.d || !payload.t) return fail('incomplete state');
  if (Date.now() - payload.t > STATE_TTL_MS) {
    return fail('link expired — ask the admin for a fresh connect link');
  }
  return { ok: true, deptAccountId: payload.d, reason: null };
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID || '',
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: IG_LOGIN_SCOPES.join(','),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchanges
// ---------------------------------------------------------------------------

interface MetaErrorEnvelope {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
  error_message?: string; // api.instagram.com oauth error shape
  error_type?: string;
}

async function igFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const json = (await res.json().catch(() => ({}))) as T & MetaErrorEnvelope;
  if (!res.ok || json.error || json.error_message) {
    const message =
      json.error?.message || json.error_message || `HTTP ${res.status}`;
    throw new IgLoginError(message, json.error?.code, json.error?.error_subcode);
  }
  return json;
}

export interface ShortLivedToken {
  access_token: string;
  /** App-scoped user id from the token exchange. */
  user_id: string;
  permissions?: string;
}

/** authorization_code → short-lived token (~1 hour). */
export async function exchangeCodeForToken(code: string): Promise<ShortLivedToken> {
  const form = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID || '',
    client_secret: process.env.INSTAGRAM_APP_SECRET || '',
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
    code,
  });
  const json = await igFetch<{
    access_token?: string;
    user_id?: number | string;
    permissions?: string | string[];
    data?: Array<{
      access_token: string;
      user_id: number | string;
      permissions?: string | string[];
    }>;
  }>(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  // Meta has shipped both a flat shape and a data-array shape — accept either.
  const payload = json.data?.[0] ?? json;
  if (!payload.access_token) {
    throw new IgLoginError('token exchange returned no access_token');
  }
  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions.join(',')
    : payload.permissions;
  return {
    access_token: payload.access_token,
    user_id: String(payload.user_id ?? ''),
    permissions,
  };
}

export interface LongLivedToken {
  access_token: string;
  token_type: string;
  /** seconds (~5,184,000 = 60 days) */
  expires_in: number;
}

/** short-lived → long-lived 60-day token. */
export async function exchangeForLongLivedToken(
  shortToken: string
): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: process.env.INSTAGRAM_APP_SECRET || '',
    access_token: shortToken,
  });
  return igFetch<LongLivedToken>(`${IG_GRAPH}/access_token?${params.toString()}`);
}

/** Refresh an unexpired long-lived token (must be ≥24h old) for 60 more days. */
export async function refreshLongLivedToken(token: string): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: token,
  });
  return igFetch<LongLivedToken>(
    `${IG_GRAPH}/refresh_access_token?${params.toString()}`
  );
}

// ---------------------------------------------------------------------------
// Graph reads (graph.instagram.com, versioned)
// ---------------------------------------------------------------------------

/** Generic GET on graph.instagram.com/v25.0 with the per-account token. */
export async function igGraphGet<T>(
  path: string,
  token: string,
  query: Record<string, string> = {}
): Promise<T> {
  const params = new URLSearchParams({ ...query, access_token: token });
  return igFetch<T>(`${IG_GRAPH_VERSIONED}${path}?${params.toString()}`);
}

export interface IgMe {
  id?: string;
  /** Instagram professional account id. */
  user_id?: string;
  username?: string;
  name?: string;
  account_type?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

export async function fetchIgMe(token: string): Promise<IgMe> {
  return igGraphGet<IgMe>('/me', token, {
    fields:
      'id,user_id,username,name,account_type,followers_count,follows_count,media_count',
  });
}
