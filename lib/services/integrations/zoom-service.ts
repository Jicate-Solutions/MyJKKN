// lib/services/integrations/zoom-service.ts
//
// Zoom meeting integration for the Universal Booking module (Wave-3 scaffold).
// Spec: specs/universal-booking-module-2026-06-12.md — D4 (location_mode
// 'online'), D12 (a video link per booking). This is the Zoom counterpart to
// google-calendar-service.ts's Meet-link generation: when a meeting type's
// location resolves to Zoom, the book route asks this service for a join URL.
//
// SERVER-ONLY: the Server-to-Server OAuth client secret lives here. NEVER
// import from a client component.
//
// Auth model: Zoom Server-to-Server OAuth (account_credentials grant). A single
// platform-level app — NOT per-host OAuth like Google — mints a short-lived
// access token from ACCOUNT_ID + CLIENT_ID + CLIENT_SECRET, then creates the
// meeting under a host (the host's Zoom user email or 'me'). No refresh token,
// no token vault: the grant is re-exchanged on demand and cached for its TTL.
//   https://developers.zoom.us/docs/internal-apps/s2s-oauth/
//
// ENV-GATED: with any of ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET
// empty, isZoomConfigured() returns false and createZoomMeeting() returns null
// WITHOUT throwing. Credentials are runtime config the Director supplies later;
// until then the module is inert and the book route falls back to its other
// location modes.
//
// Transport: native fetch (Node 24 / Next 16 — no Zoom SDK, keeps the bundle
// lean and the surface auditable). Pattern: google-calendar-service.ts.

const LOG_PREFIX = '[zoom]';

const TOKEN_URL = 'https://zoom.us/oauth/token';
const API_BASE = 'https://api.zoom.us/v2';

// ── env ──────────────────────────────────────────────────────────────────────

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

/**
 * True only when all three Server-to-Server OAuth credentials are present.
 * Callers MUST gate on this before invoking createZoomMeeting — the create
 * call itself also fails closed (returns null), but checking here lets the
 * book route skip the provider entirely and pick another location mode.
 */
export function isZoomConfigured(): boolean {
  return !!(env('ZOOM_ACCOUNT_ID') && env('ZOOM_CLIENT_ID') && env('ZOOM_CLIENT_SECRET'));
}

// ── types ────────────────────────────────────────────────────────────────────

export interface CreateZoomMeetingInput {
  /** Meeting topic shown in the Zoom client and invite. */
  topic: string;
  /** Start instant, ISO 8601 (e.g. '2026-07-01T10:00:00Z'). */
  startIso: string;
  /** Duration in minutes (Zoom requires a positive integer). */
  durationMin: number;
  /**
   * The Zoom user that hosts the meeting — an email on the Zoom account, or
   * 'me' for the token's own user. The host must exist on the Zoom account
   * tied to ZOOM_ACCOUNT_ID or Zoom returns 404 (user not found).
   */
  hostEmail: string;
  /** IANA timezone for the meeting's display time. Default 'Asia/Kolkata'. */
  timezone?: string;
}

export interface CreatedZoomMeeting {
  /** The URL attendees click to join. */
  joinUrl: string;
  /** Zoom's numeric meeting id, as a string. */
  meetingId: string;
}

// ── token (S2S OAuth, cached for its TTL) ────────────────────────────────────

interface CachedToken {
  token: string;
  /** epoch ms after which the token must be re-minted. */
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

/**
 * Mint (or reuse) a Server-to-Server OAuth access token. Cached in-process
 * until 60s before its stated expiry. Returns null on any failure — the caller
 * must treat that as "Zoom unavailable" (fail closed). NEVER logs the secret.
 */
async function accessToken(): Promise<string | null> {
  const accountId = env('ZOOM_ACCOUNT_ID');
  const clientId = env('ZOOM_CLIENT_ID');
  const clientSecret = env('ZOOM_CLIENT_SECRET');
  if (!accountId || !clientId || !clientSecret) return null;

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.token;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(
      `${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
  } catch (e) {
    console.error(`${LOG_PREFIX} token request threw:`, (e as Error).message);
    return null;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`${LOG_PREFIX} token mint failed:`, res.status, body.slice(0, 200));
    return null;
  }
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!json?.access_token) {
    console.error(`${LOG_PREFIX} token response missing access_token`);
    return null;
  }
  // Zoom tokens last 3600s; refresh 60s early to avoid edge-of-expiry 401s.
  const ttlMs = ((json.expires_in ?? 3600) - 60) * 1000;
  tokenCache = { token: json.access_token, expiresAt: now + Math.max(ttlMs, 0) };
  return json.access_token;
}

/** Test seam: drop the cached token (used by unit tests, never in prod paths). */
export function __resetZoomTokenCache(): void {
  tokenCache = null;
}

// ── service ──────────────────────────────────────────────────────────────────

/**
 * Create a scheduled Zoom meeting under `hostEmail`. Returns the join URL and
 * meeting id, or null if Zoom is not configured or the API call fails (the
 * book route then falls back to another location mode — never blocks a
 * booking on a video-link failure).
 */
export async function createZoomMeeting(
  input: CreateZoomMeetingInput,
): Promise<CreatedZoomMeeting | null> {
  if (!isZoomConfigured()) return null;

  const token = await accessToken();
  if (!token) return null;

  const body = {
    topic: input.topic,
    type: 2, // scheduled meeting
    start_time: input.startIso,
    duration: Math.max(1, Math.round(input.durationMin)),
    timezone: input.timezone ?? 'Asia/Kolkata',
    settings: {
      join_before_host: false,
      waiting_room: true,
      // Attendees join via the URL; no Zoom account required.
      approval_type: 2,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/users/${encodeURIComponent(input.hostEmail)}/meetings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`${LOG_PREFIX} meeting create threw:`, (e as Error).message);
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`${LOG_PREFIX} meeting create failed:`, res.status, text.slice(0, 200));
    return null;
  }
  const json = (await res.json().catch(() => null)) as {
    id?: number | string;
    join_url?: string;
  } | null;
  if (!json?.join_url || json.id == null) {
    console.error(`${LOG_PREFIX} meeting response missing join_url/id`);
    return null;
  }
  return { joinUrl: json.join_url, meetingId: String(json.id) };
}
