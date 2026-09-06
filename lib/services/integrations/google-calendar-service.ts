// lib/services/integrations/google-calendar-service.ts
//
// Google Calendar integration for the Universal Booking module (U2).
// Spec: specs/universal-booking-module-2026-06-12.md — D12 (full depth:
// freebusy busy-check + event per booking + Meet links), D19 (auto-hide on
// break), D20 (public page requires an active connection).
//
// SERVER-ONLY: client secret + the token vault master secret live here.
// NEVER import from client components.
//
// Auth model: per-host OAuth (offline access). The refresh token is stored
// pgp-encrypted via fn_set_google_cal_token (service_role-only RPC, U1) and
// exchanged for a short-lived access token on demand. invalid_grant on
// refresh = the host revoked access / password change → markConnectionBroken
// flips status, auto-hides the public page (D19) and emails the host.
//
// Transport: native fetch (Node 24 / Next 16 — no googleapis SDK, keeps the
// bundle lean and the surface auditable).
// Pattern: cal-com-api-client.ts (external REST client shape, error taxonomy).

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MeetingBookingEmailService } from '@/lib/services/email/meeting-booking-email-service';

import { selectBusyCalendarIds, FREEBUSY_MAX_CALENDARS } from './google-busy-calendars';
import type { GoogleCalendarListEntry } from './google-busy-calendars';

const LOG_PREFIX = '[google-calendar]';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  // Lists WHICH calendars the host has, so busy-checking is not limited to
  // 'primary'. The narrowest of the four scopes Google accepts for
  // calendarList.list — it grants the list only, not the events inside them
  // (calendar.readonly would have granted both).
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ');

/** OAuth state tokens older than this are rejected. */
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

// ── env ──────────────────────────────────────────────────────────────────────

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

export function isGoogleCalConfigured(): boolean {
  return !!(
    env('GOOGLE_CAL_CLIENT_ID') &&
    env('GOOGLE_CAL_CLIENT_SECRET') &&
    env('GOOGLE_TOKEN_MASTER_SECRET')
  );
}

function redirectUri(): string {
  const app = env('NEXT_PUBLIC_APP_URL') ?? 'https://www.jkkn.ai';
  return `${app.replace(/\/$/, '')}/api/integrations/google-calendar/callback`;
}

// ── types ────────────────────────────────────────────────────────────────────

export interface GoogleBusyRange {
  start: string; // ISO instant
  end: string;
}

export type HostBusyResult =
  | { status: 'ok'; busy: GoogleBusyRange[] }
  /** Host has no (active) Google connection — engine availability only. */
  | { status: 'none' }
  /** Connection exists but the check failed — caller must FAIL CLOSED (D19). */
  | { status: 'failed' };

// The calendar-selection rule lives in its own dependency-free module so it can
// be unit-tested without importing this service's transitive graph. Re-exported
// here so existing call sites keep working.
export {
  selectBusyCalendarIds,
  FREEBUSY_MAX_CALENDARS,
  type GoogleCalendarListEntry,
} from './google-busy-calendars';

export interface CreateEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  /** IANA timezone for the event's display. */
  timezone: string;
  attendees: Array<{ email: string; displayName?: string }>;
  /** true → request a Google Meet link (location_mode 'online', D4). */
  withMeet: boolean;
  /** PR1: in-person venue directions shown as the event location. */
  location?: string;
}

export interface CreatedEvent {
  eventId: string;
  meetUrl: string | null;
}

interface ConnectionRow {
  host_profile_id: string;
  google_email: string;
  status: 'active' | 'broken' | 'revoked';
}

// ── OAuth state (HMAC-signed, no server-side session needed) ────────────────

interface StatePayload {
  h: string; // host profile id
  t: number; // issued-at ms
}

function signState(payload: StatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state: string, secret: string): StatePayload | null {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as StatePayload;
    if (!payload.h || !payload.t) return null;
    if (Date.now() - payload.t > STATE_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Pull the Google Meet URL out of a created-event response. With
 * conferenceDataVersion=1 the durable link is on conferenceData.entryPoints
 * (entryPointType='video'); hangoutLink is also populated for Meet events but
 * is the legacy field — prefer the explicit video entry point, fall back to
 * hangoutLink, then any entry-point uri. Returns null for non-Meet events.
 */
function extractMeetUrl(json: {
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
}): string | null {
  const eps = json.conferenceData?.entryPoints ?? [];
  const video = eps.find((e) => e.entryPointType === 'video' && e.uri);
  if (video?.uri) return video.uri;
  if (json.hangoutLink) return json.hangoutLink;
  const anyEp = eps.find((e) => e.uri);
  return anyEp?.uri ?? null;
}

// ── service ──────────────────────────────────────────────────────────────────

export class GoogleCalendarService {
  /** OAuth consent URL for a host. Throws if the integration env is missing. */
  static buildAuthUrl(hostProfileId: string): string {
    const clientId = env('GOOGLE_CAL_CLIENT_ID');
    const secret = env('GOOGLE_TOKEN_MASTER_SECRET');
    if (!clientId || !secret) throw new Error('Google Calendar integration is not configured');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      // Force the consent screen so Google re-issues a refresh_token even on
      // re-connect (Google omits it otherwise and the vault would store null).
      prompt: 'consent',
      state: signState({ h: hostProfileId, t: Date.now() }, secret),
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  /** Validate the OAuth state param. Returns the host profile id or null. */
  static verifyStateParam(state: string): string | null {
    const secret = env('GOOGLE_TOKEN_MASTER_SECRET');
    if (!secret) return null;
    return verifyState(state, secret)?.h ?? null;
  }

  /**
   * Exchange the authorization code, extract the google email from the
   * id_token, and store the refresh token in the vault (status → active).
   * Also clears a D19 auto-hide if one was in force.
   */
  static async completeConnection(
    supabase: SupabaseClient,
    hostProfileId: string,
    code: string,
  ): Promise<{ success: boolean; googleEmail?: string; error?: string }> {
    const clientId = env('GOOGLE_CAL_CLIENT_ID');
    const clientSecret = env('GOOGLE_CAL_CLIENT_SECRET');
    const master = env('GOOGLE_TOKEN_MASTER_SECRET');
    if (!clientId || !clientSecret || !master) {
      return { success: false, error: 'not_configured' };
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`${LOG_PREFIX} code exchange failed:`, res.status, body.slice(0, 200));
      return { success: false, error: 'exchange_failed' };
    }
    const tokens = (await res.json()) as {
      refresh_token?: string;
      id_token?: string;
    };
    if (!tokens.refresh_token) {
      // prompt=consent should prevent this; surface it if Google still omits.
      console.error(`${LOG_PREFIX} no refresh_token in exchange response`);
      return { success: false, error: 'no_refresh_token' };
    }

    // google email from the id_token payload (came directly from Google over
    // TLS in the same response — no signature verification needed server-side).
    let googleEmail = '';
    try {
      const payload = JSON.parse(
        Buffer.from((tokens.id_token ?? '').split('.')[1] ?? '', 'base64url').toString(),
      ) as { email?: string };
      googleEmail = payload.email ?? '';
    } catch {
      /* fall through */
    }
    if (!googleEmail) return { success: false, error: 'no_email' };

    const { error } = await supabase.rpc('fn_set_google_cal_token', {
      p_host_id: hostProfileId,
      p_google_email: googleEmail,
      p_refresh_token: tokens.refresh_token,
      p_master_secret: master,
    });
    if (error) {
      console.error(`${LOG_PREFIX} vault store failed:`, error.message);
      return { success: false, error: 'vault_failed' };
    }

    // Reconnect lifts a D19 auto-hide; the host's own is_public choice stands.
    await supabase
      .from('meeting_host_pages')
      .update({ auto_hidden: false, auto_hidden_reason: null })
      .eq('host_profile_id', hostProfileId)
      .eq('auto_hidden', true);

    // Re-consent may have granted the calendar-list scope, so forget any earlier
    // "no" and let the next busy-check find out. Without this reset a host who
    // reconnects specifically to fix their coverage stays stuck on primary-only
    // forever — silently, since reduced protection still returns slots.
    await supabase
      .from('meeting_host_google_connections')
      .update({ calendar_list_scope: null })
      .eq('host_profile_id', hostProfileId);

    // Start the inbound push-notification watch so calendar-side edits sync
    // back immediately. Best-effort: a watch failure (e.g. unverified webhook
    // domain) must not fail the connection — the daily cron retries it.
    await this.startWatch(supabase, hostProfileId).catch((e) => {
      console.error(`${LOG_PREFIX} startWatch after connect failed:`, (e as Error).message);
      return false;
    });

    return { success: true, googleEmail };
  }

  /** Active connection row for a host, or null. */
  static async getConnection(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<ConnectionRow | null> {
    const { data } = await supabase
      .from('meeting_host_google_connections')
      .select('host_profile_id, google_email, status')
      .eq('host_profile_id', hostProfileId)
      .maybeSingle();
    return (data as ConnectionRow | null) ?? null;
  }

  /**
   * Refresh-token → access-token. invalid_grant marks the connection broken
   * (D19). Returns null on any failure.
   */
  private static async accessTokenForHost(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<string | null> {
    const clientId = env('GOOGLE_CAL_CLIENT_ID');
    const clientSecret = env('GOOGLE_CAL_CLIENT_SECRET');
    const master = env('GOOGLE_TOKEN_MASTER_SECRET');
    if (!clientId || !clientSecret || !master) return null;

    const { data, error } = await supabase.rpc('fn_get_google_cal_token', {
      p_host_id: hostProfileId,
      p_master_secret: master,
    });
    if (error || !data || !(data as any[]).length) return null;
    const refreshToken = (data as Array<{ refresh_token: string }>)[0].refresh_token;
    if (!refreshToken) return null;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`${LOG_PREFIX} token refresh failed for ${hostProfileId}:`, res.status, body.slice(0, 200));
      if (body.includes('invalid_grant')) {
        await this.markConnectionBroken(supabase, hostProfileId, 'Google access was revoked (invalid_grant)');
      }
      return null;
    }
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  }

  /**
   * Busy ranges from the host's primary Google calendar. Tri-state result —
   * callers must treat 'failed' as fully busy (fail closed, D19).
   */
  static async busyForHost(
    supabase: SupabaseClient,
    hostProfileId: string,
    fromIso: string,
    toIso: string,
  ): Promise<HostBusyResult> {
    const conn = await this.getConnection(supabase, hostProfileId);
    if (!conn || conn.status !== 'active') return { status: 'none' };

    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return { status: 'failed' };

    // Which calendars count as busy? Everything the host owns and shows — not
    // just 'primary'. A meeting kept on a second calendar used to be invisible
    // here, so the engine called the host free and offered the slot to a
    // stranger. `calendarIdsForHost` returns ['primary'] for connections that
    // predate the calendarList scope, which is exactly the old behaviour.
    const { ids, reduced } = await this.calendarIdsForHost(supabase, hostProfileId, token);

    const res = await fetch(`${CAL_BASE}/freeBusy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: fromIso,
        timeMax: toIso,
        items: ids.map((id) => ({ id })),
      }),
    });
    if (!res.ok) {
      console.error(`${LOG_PREFIX} freeBusy failed for ${hostProfileId}:`, res.status);
      return { status: 'failed' };
    }
    const json = (await res.json()) as {
      calendars?: Record<string, { busy?: GoogleBusyRange[]; errors?: unknown[] }>;
    };

    const calendars = json.calendars ?? {};
    const busy: GoogleBusyRange[] = [];

    for (const id of ids) {
      const cal = calendars[id];
      // Fail CLOSED on any calendar we asked about but could not read. Skipping
      // it would mean treating "unknown" as "free", which is the exact bug this
      // change exists to remove — now with the calendar NAMED, so the failure is
      // diagnosable instead of a mystery empty slot list.
      if (!cal || (cal.errors && cal.errors.length)) {
        console.error(
          `${LOG_PREFIX} freeBusy could not read calendar ${id} for ${hostProfileId} — failing closed`,
        );
        return { status: 'failed' };
      }
      busy.push(...(cal.busy ?? []));
    }

    if (reduced) {
      // Not an error, but never silent: this host is protected on one calendar
      // only until they reconnect and grant the calendar-list scope.
      console.warn(
        `${LOG_PREFIX} ${hostProfileId} checked PRIMARY ONLY — reconnect Google to cover every calendar`,
      );
    }

    // Health bookkeeping (best effort — never blocks the read).
    await supabase
      .from('meeting_host_google_connections')
      .update({ last_ok_at: new Date().toISOString() })
      .eq('host_profile_id', hostProfileId);

    return { status: 'ok', busy };
  }

  /**
   * The calendar ids to busy-check for this host.
   *
   * Connections created before the calendar-list scope existed cannot call
   * calendarList.list at all, and /meet slots is a public hot path — probing
   * Google for a guaranteed 403 on every page load would be a wasted round trip
   * per visitor. So the answer is cached on the connection row:
   *
   *   NULL   not yet probed → try once, record what happened
   *   true   list it every time
   *   false  do not try again until the host reconnects (which resets it to NULL)
   *
   * Never throws. Any failure degrades to ['primary'] — today's behaviour — with
   * `reduced` set so the caller can say so out loud.
   */
  private static async calendarIdsForHost(
    supabase: SupabaseClient,
    hostProfileId: string,
    token: string,
  ): Promise<{ ids: string[]; reduced: boolean }> {
    const PRIMARY_ONLY = { ids: ['primary'], reduced: true };

    try {
      const { data: conn } = await supabase
        .from('meeting_host_google_connections')
        .select('calendar_list_scope')
        .eq('host_profile_id', hostProfileId)
        .maybeSingle();

      // Known not to have the scope — skip the round trip.
      if (conn?.calendar_list_scope === false) return PRIMARY_ONLY;

      const res = await fetch(
        `${CAL_BASE}/users/me/calendarList?minAccessRole=owner&showHidden=false&maxResults=250`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.status === 401 || res.status === 403) {
        // The connection predates the scope. Record it so this costs one call
        // per host, ever — not one per booking-page visit.
        await supabase
          .from('meeting_host_google_connections')
          .update({ calendar_list_scope: false })
          .eq('host_profile_id', hostProfileId);
        console.warn(
          `${LOG_PREFIX} ${hostProfileId} cannot list calendars (${res.status}) — primary only until reconnect`,
        );
        return PRIMARY_ONLY;
      }

      if (!res.ok) {
        // A transient failure is NOT recorded as "no scope" — that would
        // permanently downgrade a host over one bad minute.
        console.error(`${LOG_PREFIX} calendarList failed for ${hostProfileId}:`, res.status);
        return PRIMARY_ONLY;
      }

      const json = (await res.json()) as { items?: GoogleCalendarListEntry[] };
      const { ids, truncated } = selectBusyCalendarIds(json.items ?? []);

      if (truncated > 0) {
        // Never cap silently: the calendars we dropped are ones the engine will
        // treat as free.
        console.warn(
          `${LOG_PREFIX} ${hostProfileId} has more than ${FREEBUSY_MAX_CALENDARS} eligible calendars — ${truncated} not checked`,
        );
      }

      if (conn?.calendar_list_scope !== true) {
        await supabase
          .from('meeting_host_google_connections')
          .update({ calendar_list_scope: true })
          .eq('host_profile_id', hostProfileId);
      }

      return { ids, reduced: false };
    } catch (err) {
      console.error(`${LOG_PREFIX} calendarList threw for ${hostProfileId}:`, err);
      return PRIMARY_ONLY;
    }
  }

  /** Calendar event for a booking; attendee is invited by Google itself. */
  static async createEvent(
    supabase: SupabaseClient,
    hostProfileId: string,
    input: CreateEventInput,
  ): Promise<CreatedEvent | null> {
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return null;

    const body: Record<string, unknown> = {
      summary: input.summary,
      description: input.description ?? '',
      start: { dateTime: input.startIso, timeZone: input.timezone },
      end: { dateTime: input.endIso, timeZone: input.timezone },
      attendees: input.attendees,
    };
    if (input.location) body.location = input.location;
    if (input.withMeet) {
      body.conferenceData = {
        createRequest: {
          requestId: crypto.randomBytes(8).toString('hex'),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`${LOG_PREFIX} event create failed:`, res.status, text.slice(0, 200));
      return null;
    }
    const json = (await res.json()) as {
      id?: string;
      hangoutLink?: string;
      conferenceData?: {
        entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
      };
    };
    if (!json.id) return null;
    return { eventId: json.id, meetUrl: extractMeetUrl(json) };
  }

  /** Move an existing event (true reschedule, D16). */
  static async patchEventTime(
    supabase: SupabaseClient,
    hostProfileId: string,
    eventId: string,
    startIso: string,
    endIso: string,
    timezone: string,
  ): Promise<boolean> {
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return false;
    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: { dateTime: startIso, timeZone: timezone },
          end: { dateTime: endIso, timeZone: timezone },
        }),
      },
    );
    if (!res.ok) console.error(`${LOG_PREFIX} event patch failed:`, res.status);
    return res.ok;
  }

  /**
   * Add Google Meet conferencing to an EXISTING event, optionally moving it in
   * the same call. This is what turns a face-to-face booking into an online one
   * without cancelling and re-inviting.
   *
   * Why a sibling of patchEventTime rather than a flag on it: patchEventTime
   * PATCHes with `?sendUpdates=all` but no `conferenceDataVersion=1`, and
   * without that parameter Google IGNORES conferenceData entirely — the method
   * structurally cannot add conferencing. The version parameter changes how the
   * whole request body is interpreted, so it is a different call, not an option.
   *
   * Start/end are patched in the SAME request when supplied. That is deliberate:
   * a switch that also moves the meeting must be all-or-nothing, and one PATCH
   * either lands or does not — two calls can half-fail and leave an online
   * meeting at the old time (or a moved meeting with no link).
   *
   * `sendUpdates=all` makes Google update the attendee's EXISTING calendar entry
   * in place and notify them, which is exactly the "one email, no cancellation"
   * behaviour this feature promises. Do not follow this with a cancel.
   *
   * Returns { ok, meetUrl }. A patch that succeeds but yields no Meet link is
   * reported as ok:true with meetUrl:null — the caller decides what that means
   * (for the mode switch it is a failure; see meeting-mode-switch-service.ts).
   */
  static async patchEventToOnline(
    supabase: SupabaseClient,
    hostProfileId: string,
    eventId: string,
    opts: { startIso?: string | null; endIso?: string | null; timezone?: string | null } = {},
  ): Promise<{ ok: boolean; meetUrl: string | null }> {
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return { ok: false, meetUrl: null };

    const body: Record<string, unknown> = {
      conferenceData: {
        createRequest: {
          requestId: crypto.randomBytes(8).toString('hex'),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };
    if (opts.startIso && opts.endIso) {
      const tz = opts.timezone ?? undefined;
      body.start = { dateTime: opts.startIso, timeZone: tz };
      body.end = { dateTime: opts.endIso, timeZone: tz };
    }

    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}` +
        `?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`${LOG_PREFIX} event online-patch failed:`, res.status, text.slice(0, 200));
      return { ok: false, meetUrl: null };
    }
    const json = (await res.json()) as {
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
    };
    return { ok: true, meetUrl: extractMeetUrl(json) };
  }

  /**
   * Undo patchEventToOnline: strip the conferencing back off an event and, when
   * the same patch moved it, put it back at its original time.
   *
   * This exists for ONE caller — the mode switch's rollback. patchEventToOnline
   * can succeed and still yield no Meet link, and at that point Google has
   * already been changed and (via sendUpdates=all) has already emailed the
   * visitor. Reverting only the database would leave the calendar saying "video
   * call" while the booking says "in person", so the rollback has to reach both.
   *
   * `conferenceData: null` is how conferencing is REMOVED, and it needs
   * conferenceDataVersion=1 exactly as adding it does — without that parameter
   * Google ignores the field and the conferencing silently stays.
   *
   * sendUpdates=all again, deliberately: the visitor was already told the
   * meeting moved online, so correcting their calendar entry in place is the
   * honest close. It is a second mail only on this rare failure path — the
   * successful switch is still the one email decision 9 promises.
   */
  static async revertEventFromOnline(
    supabase: SupabaseClient,
    hostProfileId: string,
    eventId: string,
    opts: { startIso?: string | null; endIso?: string | null; timezone?: string | null } = {},
  ): Promise<boolean> {
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return false;

    const body: Record<string, unknown> = { conferenceData: null };
    if (opts.startIso && opts.endIso) {
      const tz = opts.timezone ?? undefined;
      body.start = { dateTime: opts.startIso, timeZone: tz };
      body.end = { dateTime: opts.endIso, timeZone: tz };
    }

    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}` +
        `?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`${LOG_PREFIX} event online-revert failed:`, res.status, text.slice(0, 200));
      return false;
    }
    return true;
  }

  /**
   * Mark a cancelled booking's event as cancelled but KEEP it on the host's
   * calendar — renamed ("Cancelled: …") and freed (transparent so it no longer
   * blocks time), for record-keeping. Mirrors the old Calendly behaviour the
   * Director relied on; status stays 'confirmed' so Google keeps it visible
   * (status:'cancelled' would hide/remove it). Best effort; sendUpdates=all so
   * the attendee is notified. Falls through to a no-op on 410 (already gone).
   */
  static async markEventCancelled(
    supabase: SupabaseClient,
    hostProfileId: string,
    eventId: string,
    cancelledSummary: string,
  ): Promise<boolean> {
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return false;
    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: cancelledSummary, transparency: 'transparent' }),
      },
    );
    if (!res.ok && res.status !== 410) {
      console.error(`${LOG_PREFIX} event cancel-mark failed:`, res.status);
      return false;
    }
    return true;
  }

  /**
   * Rename an existing event WITHOUT notifying anybody.
   *
   * Every other write in this file sends `sendUpdates=all`, deliberately: they
   * each change something the attendee agreed to — the time, the place, whether
   * it still exists — so telling them is the honest close. A rename is the one
   * change that is purely for the host. The meeting is at the same hour, in the
   * same place, with the same people; only the words on the host's row differ.
   * Mailing an external guest "your meeting was updated" for that is noise that
   * costs their trust and tells them nothing, so this method sends
   * `sendUpdates=none` and that is the whole reason it is a separate method
   * rather than a flag on markEventCancelled.
   *
   * Built for the guest-first retitle backfill
   * (scripts/retitle-calendar-events-guest-first.ts), which walks events booked
   * before the title order was fixed. Best effort: 404/410 means the event is
   * already gone, which needs no rename and is not an error.
   */
  static async patchEventSummarySilently(
    supabase: SupabaseClient,
    hostProfileId: string,
    eventId: string,
    summary: string,
  ): Promise<boolean> {
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return false;
    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      },
    );
    if (!res.ok && res.status !== 410 && res.status !== 404) {
      console.error(`${LOG_PREFIX} event retitle failed:`, res.status);
      return false;
    }
    return res.ok;
  }

  /** Delete the calendar event for a cancelled booking (best effort). */
  static async deleteEvent(
    supabase: SupabaseClient,
    hostProfileId: string,
    eventId: string,
  ): Promise<boolean> {
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return false;
    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    // 410 = already gone — that's the desired end state.
    if (!res.ok && res.status !== 410) {
      console.error(`${LOG_PREFIX} event delete failed:`, res.status);
      return false;
    }
    return true;
  }

  /**
   * D19: connection failed in a way that means slots can no longer be
   * protected. Flip status, auto-hide the public page, warn the host.
   */
  static async markConnectionBroken(
    supabase: SupabaseClient,
    hostProfileId: string,
    reason: string,
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    // Transition-gated: only the call that actually flips active→broken does
    // the side effects. A second caller in the same failure episode (e.g.
    // invalid_grant inside accessTokenForHost AND the daily cron) no-ops —
    // exactly one auto-hide and exactly one warning email per break (D19).
    const { data: flipped } = await supabase
      .from('meeting_host_google_connections')
      .update({ status: 'broken', broken_at: nowIso })
      .eq('host_profile_id', hostProfileId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();
    if (!flipped) return;

    const { data: page } = await supabase
      .from('meeting_host_pages')
      .update({ auto_hidden: true, auto_hidden_reason: reason })
      .eq('host_profile_id', hostProfileId)
      .eq('is_public', true)
      .eq('auto_hidden', false)
      .select('id')
      .maybeSingle();

    const { data: host } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', hostProfileId)
      .maybeSingle();
    if (host?.email) {
      await MeetingBookingEmailService.sendGoogleConnectionBrokenEmail({
        to: host.email as string,
        hostName: (host.full_name as string | undefined) ?? (host.email as string),
        reason,
        pageWasHidden: !!page,
      });
    }
    console.warn(`${LOG_PREFIX} connection BROKEN for ${hostProfileId}: ${reason}`);
  }

  // ── INBOUND SYNC: watch channels + incremental events.list ─────────────────
  //
  // The module was outbound-only until 2026-06-20. These methods let changes
  // made DIRECTLY in Google Calendar (delete / cancel / move an event) flow
  // back into meeting_bookings. events.watch pushes a contentless ping to the
  // webhook; we then read the delta with the stored sync_token.

  /** Public webhook address Google POSTs change-pings to. */
  private static watchAddress(): string {
    const app = env('NEXT_PUBLIC_APP_URL') ?? 'https://www.jkkn.ai';
    return `${app.replace(/\/$/, '')}/api/webhooks/google-calendar`;
  }

  /**
   * Per-host verification token. Sent as the channel `token` at watch time and
   * echoed back by Google in X-Goog-Channel-Token on every ping — the webhook
   * recomputes and compares it (constant work, no DB round-trip) so a spoofed
   * ping for a guessed channel id cannot trigger a reconcile.
   */
  static channelToken(hostProfileId: string): string | null {
    const secret = env('GOOGLE_TOKEN_MASTER_SECRET');
    if (!secret) return null;
    return crypto
      .createHmac('sha256', secret)
      .update(`watch:${hostProfileId}`)
      .digest('base64url');
  }

  /**
   * Seed (or re-seed) the incremental-sync cursor: a full events.list paginated
   * to its nextSyncToken, stored on the connection. The webhook reads deltas
   * from here. Returns the token, or null on failure.
   *
   * Note: a sync token only becomes valid once the full list is exhausted, so
   * we page to the end (capped defensively at 20 pages × 250 = 5k events).
   */
  static async seedSyncToken(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<string | null> {
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return null;

    let pageToken: string | undefined;
    let syncToken: string | null = null;
    for (let i = 0; i < 20; i++) {
      const params = new URLSearchParams({
        singleEvents: 'true',
        showDeleted: 'true',
        maxResults: '250',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(`${CAL_BASE}/calendars/primary/events?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error(`${LOG_PREFIX} seedSyncToken list failed for ${hostProfileId}:`, res.status);
        return null;
      }
      const json = (await res.json()) as { nextSyncToken?: string; nextPageToken?: string };
      if (json.nextSyncToken) {
        syncToken = json.nextSyncToken;
        break;
      }
      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
    if (syncToken) {
      await supabase
        .from('meeting_host_google_connections')
        .update({ sync_token: syncToken })
        .eq('host_profile_id', hostProfileId);
    }
    return syncToken;
  }

  /**
   * Start (or restart) a push-notification watch on the host's primary
   * calendar. Stops any prior channel first, seeds a sync cursor, then calls
   * events.watch. FAIL-SAFE: on any error (most likely the receiving domain is
   * not verified in the GCP project → 401 "Unauthorized WebHook callback
   * channel") it logs and returns false — the booking/freebusy flow is
   * completely unaffected; only real-time inbound sync is deferred.
   */
  static async startWatch(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<boolean> {
    const conn = await this.getConnection(supabase, hostProfileId);
    if (!conn || conn.status !== 'active') return false;
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return false;
    const channelTok = this.channelToken(hostProfileId);
    if (!channelTok) return false;

    // Stop a prior channel so we don't receive duplicate pings.
    await this.stopWatch(supabase, hostProfileId).catch(() => {});
    // Seed the delta cursor BEFORE the watch goes live.
    await this.seedSyncToken(supabase, hostProfileId);

    const channelId = crypto.randomUUID();
    const res = await fetch(`${CAL_BASE}/calendars/primary/events/watch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: this.watchAddress(),
        token: channelTok,
        params: { ttl: '604800' }, // 7 days; the renewal cron re-watches before expiry.
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `${LOG_PREFIX} events.watch failed for ${hostProfileId}:`,
        res.status,
        text.slice(0, 200),
      );
      return false;
    }
    const json = (await res.json()) as { resourceId?: string; expiration?: string };
    await supabase
      .from('meeting_host_google_connections')
      .update({
        watch_channel_id: channelId,
        watch_resource_id: json.resourceId ?? null,
        watch_expiration: json.expiration
          ? new Date(Number(json.expiration)).toISOString()
          : null,
        watch_started_at: new Date().toISOString(),
      })
      .eq('host_profile_id', hostProfileId);
    return true;
  }

  /** Stop the host's active watch channel (best effort) and clear its state. */
  static async stopWatch(supabase: SupabaseClient, hostProfileId: string): Promise<void> {
    const { data: conn } = await supabase
      .from('meeting_host_google_connections')
      .select('watch_channel_id, watch_resource_id')
      .eq('host_profile_id', hostProfileId)
      .maybeSingle();
    if (!conn?.watch_channel_id || !conn?.watch_resource_id) return;

    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (token) {
      await fetch(`${CAL_BASE}/channels/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: conn.watch_channel_id, resourceId: conn.watch_resource_id }),
      }).catch(() => {});
    }
    await supabase
      .from('meeting_host_google_connections')
      .update({
        watch_channel_id: null,
        watch_resource_id: null,
        watch_expiration: null,
        watch_started_at: null,
      })
      .eq('host_profile_id', hostProfileId);
  }

  /**
   * Read the change delta since the stored sync_token. Returns:
   *   { changes, nextSyncToken } — apply changes, then persist the new token.
   *   { expired: true }          — sync token died (410); caller must re-seed.
   *   null                       — transient failure; caller does nothing.
   * Each change carries the event id + status ('confirmed'|'cancelled'|…) +
   * start/end so the reconcile can decide cancel vs reschedule.
   */
  static async listEventChanges(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<
    | { changes: CalendarChange[]; nextSyncToken: string | null }
    | { expired: true }
    | null
  > {
    const { data: conn } = await supabase
      .from('meeting_host_google_connections')
      .select('sync_token')
      .eq('host_profile_id', hostProfileId)
      .maybeSingle();
    if (!conn?.sync_token) {
      // No cursor yet — seed one. Nothing to reconcile from the delta this round.
      await this.seedSyncToken(supabase, hostProfileId);
      return { changes: [], nextSyncToken: null };
    }
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return null;

    const changes: CalendarChange[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    for (let i = 0; i < 20; i++) {
      const params = new URLSearchParams({ syncToken: conn.sync_token, maxResults: '250' });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(`${CAL_BASE}/calendars/primary/events?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 410) return { expired: true }; // sync token expired
      if (!res.ok) {
        console.error(`${LOG_PREFIX} listEventChanges failed for ${hostProfileId}:`, res.status);
        return null;
      }
      const json = (await res.json()) as {
        items?: Array<{
          id?: string;
          status?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
        }>;
        nextPageToken?: string;
        nextSyncToken?: string;
      };
      for (const ev of json.items ?? []) {
        if (!ev.id) continue;
        changes.push({
          id: ev.id,
          status: (ev.status as CalendarChange['status']) ?? 'confirmed',
          startIso: ev.start?.dateTime ?? null,
          endIso: ev.end?.dateTime ?? null,
        });
      }
      if (json.nextSyncToken) {
        nextSyncToken = json.nextSyncToken;
        break;
      }
      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
    return { changes, nextSyncToken };
  }

  /** Persist a fresh incremental-sync cursor. */
  static async storeSyncToken(
    supabase: SupabaseClient,
    hostProfileId: string,
    syncToken: string,
  ): Promise<void> {
    await supabase
      .from('meeting_host_google_connections')
      .update({ sync_token: syncToken })
      .eq('host_profile_id', hostProfileId);
  }

  /**
   * Current state of ONE event. Used by the safety reconcile (cron) to recheck
   * a confirmed booking directly. Returns:
   *   'gone'  — 404/410 or status=cancelled (the event no longer exists);
   *   null    — transient failure (caller must NOT change the booking);
   *   object  — the live start/end, plus the Meet link if the event has one.
   *
   * meetUrl and summary are additive: the reconcile cron ignores both, the mode
   * switch uses this call to re-read an event whose PATCH response carried no
   * link yet (Google often provisions conferenceData a moment after it
   * answers), and the guest-first retitle backfill reads summary to see what an
   * event is called today before deciding whether to touch it.
   */
  static async getEvent(
    supabase: SupabaseClient,
    hostProfileId: string,
    eventId: string,
  ): Promise<
    | {
        startIso: string | null;
        endIso: string | null;
        meetUrl: string | null;
        summary: string | null;
      }
    | 'gone'
    | null
  > {
    const token = await this.accessTokenForHost(supabase, hostProfileId);
    if (!token) return null;
    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 404 || res.status === 410) return 'gone';
    if (!res.ok) return null;
    const ev = (await res.json()) as {
      status?: string;
      summary?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
    };
    if (ev.status === 'cancelled') return 'gone';
    return {
      startIso: ev.start?.dateTime ?? null,
      endIso: ev.end?.dateTime ?? null,
      meetUrl: extractMeetUrl(ev),
      summary: ev.summary ?? null,
    };
  }
}

/** One changed event from an incremental events.list. */
export interface CalendarChange {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  startIso: string | null;
  endIso: string | null;
}
