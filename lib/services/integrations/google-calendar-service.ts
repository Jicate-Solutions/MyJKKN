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

const LOG_PREFIX = '[google-calendar]';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
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

    const res = await fetch(`${CAL_BASE}/freeBusy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: fromIso, timeMax: toIso, items: [{ id: 'primary' }] }),
    });
    if (!res.ok) {
      console.error(`${LOG_PREFIX} freeBusy failed for ${hostProfileId}:`, res.status);
      return { status: 'failed' };
    }
    const json = (await res.json()) as {
      calendars?: { primary?: { busy?: GoogleBusyRange[]; errors?: unknown[] } };
    };
    const cal = json.calendars?.primary;
    if (!cal || (cal.errors && cal.errors.length)) {
      console.error(`${LOG_PREFIX} freeBusy returned errors for ${hostProfileId}`);
      return { status: 'failed' };
    }

    // Health bookkeeping (best effort — never blocks the read).
    await supabase
      .from('meeting_host_google_connections')
      .update({ last_ok_at: new Date().toISOString() })
      .eq('host_profile_id', hostProfileId);

    return { status: 'ok', busy: cal.busy ?? [] };
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
    const json = (await res.json()) as { id?: string; hangoutLink?: string };
    if (!json.id) return null;
    return { eventId: json.id, meetUrl: json.hangoutLink ?? null };
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
}
