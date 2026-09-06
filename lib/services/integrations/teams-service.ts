// lib/services/integrations/teams-service.ts
//
// Microsoft Teams meeting integration for the Universal Booking module
// (Wave-3 scaffold). Spec: specs/universal-booking-module-2026-06-12.md — D4
// (location_mode 'online'), D12 (a video link per booking). Teams counterpart
// to google-calendar-service.ts's Meet-link generation and zoom-service.ts.
//
// Token pattern is the one documented in
// specs/ai-pulse-graph-attendance-integration-2026-06-18.md: Microsoft Graph
// client-credentials (app-only) flow against the JKKN Entra tenant. A single
// platform app mints an app-only access token, then creates an online meeting
// under a fixed ORGANIZER user (the service account that also reads attendance
// reports — Graph requires app-only meeting access to target a specific user,
// and attendance reports are organizer-scoped).
//   https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings
//
// SERVER-ONLY: the client secret lives here. NEVER import from a client
// component.
//
// ENV-GATED: with any of MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID /
// MS_GRAPH_CLIENT_SECRET / MS_GRAPH_ORGANIZER_USER_ID empty,
// isTeamsConfigured() returns false and createTeamsMeeting() returns null
// WITHOUT throwing. Azure setup (app registration, admin consent, Teams
// application access policy, service account) is the long pole — see the spec's
// IT checklist — so until IT delivers the four values this module is inert.
//
// Transport: native fetch (Node 24 / Next 16 — no @azure/msal SDK, keeps the
// bundle lean and the surface auditable). Pattern: google-calendar-service.ts.

const LOG_PREFIX = '[teams]';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

// ── env ──────────────────────────────────────────────────────────────────────

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

function tokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

/**
 * True only when all four Graph credentials are present. Callers MUST gate on
 * this before invoking createTeamsMeeting — the create call also fails closed
 * (returns null), but checking here lets the book route skip the provider and
 * pick another location mode.
 */
export function isTeamsConfigured(): boolean {
  return !!(
    env('MS_GRAPH_TENANT_ID') &&
    env('MS_GRAPH_CLIENT_ID') &&
    env('MS_GRAPH_CLIENT_SECRET') &&
    env('MS_GRAPH_ORGANIZER_USER_ID')
  );
}

// ── types ────────────────────────────────────────────────────────────────────

export interface CreateTeamsMeetingInput {
  /** Subject shown in the Teams client and invite. */
  topic: string;
  /** Start instant, ISO 8601 (e.g. '2026-07-01T10:00:00Z'). */
  startIso: string;
  /** Duration in minutes (used to derive endDateTime). */
  durationMin: number;
  /**
   * Best-effort: the attendee/host email shown in the Teams subject context.
   * Unlike Google (per-host OAuth) and Zoom (per-host Zoom user), Teams meetings
   * are always organized by the fixed MS_GRAPH_ORGANIZER_USER_ID service
   * account, so this is informational only and does not change the organizer.
   * Accepted for signature parity with createZoomMeeting.
   */
  hostEmail?: string;
}

export interface CreatedTeamsMeeting {
  /** The URL attendees click to join. */
  joinUrl: string;
  /** Graph onlineMeeting id. */
  meetingId: string;
}

// ── token (client-credentials, cached for its TTL) ──────────────────────────

interface CachedToken {
  token: string;
  /** epoch ms after which the token must be re-minted. */
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

/**
 * Mint (or reuse) an app-only Graph access token via the client-credentials
 * grant. Cached in-process until 60s before expiry. Returns null on any
 * failure — the caller treats that as "Teams unavailable" (fail closed).
 * NEVER logs the secret.
 */
async function accessToken(): Promise<string | null> {
  const tenantId = env('MS_GRAPH_TENANT_ID');
  const clientId = env('MS_GRAPH_CLIENT_ID');
  const clientSecret = env('MS_GRAPH_CLIENT_SECRET');
  if (!tenantId || !clientId || !clientSecret) return null;

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.token;

  let res: Response;
  try {
    res = await fetch(tokenUrl(tenantId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: GRAPH_SCOPE,
        grant_type: 'client_credentials',
      }),
    });
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
  // Graph app-only tokens last ~3600s; refresh 60s early.
  const ttlMs = ((json.expires_in ?? 3600) - 60) * 1000;
  tokenCache = { token: json.access_token, expiresAt: now + Math.max(ttlMs, 0) };
  return json.access_token;
}

/** Test seam: drop the cached token (used by unit tests, never in prod paths). */
export function __resetTeamsTokenCache(): void {
  tokenCache = null;
}

// ── service ──────────────────────────────────────────────────────────────────

/**
 * Create an online Teams meeting under the configured organizer service
 * account. Returns the join URL and meeting id, or null if Teams is not
 * configured or the Graph call fails (the book route then falls back to
 * another location mode — never blocks a booking on a video-link failure).
 */
export async function createTeamsMeeting(
  input: CreateTeamsMeetingInput,
): Promise<CreatedTeamsMeeting | null> {
  if (!isTeamsConfigured()) return null;

  const organizerId = env('MS_GRAPH_ORGANIZER_USER_ID');
  if (!organizerId) return null;

  const token = await accessToken();
  if (!token) return null;

  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) {
    console.error(`${LOG_PREFIX} invalid startIso:`, input.startIso);
    return null;
  }
  const end = new Date(start.getTime() + Math.max(1, Math.round(input.durationMin)) * 60_000);

  const body = {
    subject: input.topic,
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
  };

  let res: Response;
  try {
    res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(organizerId)}/onlineMeetings`, {
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
    id?: string;
    joinWebUrl?: string;
  } | null;
  if (!json?.joinWebUrl || !json.id) {
    console.error(`${LOG_PREFIX} meeting response missing joinWebUrl/id`);
    return null;
  }
  return { joinUrl: json.joinWebUrl, meetingId: json.id };
}
