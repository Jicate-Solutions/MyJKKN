// lib/services/integrations/google-read/connection.ts
//
// SERVER-ONLY. The person's own Gmail/Drive connection: the switch, the vaulted
// token, the access-token exchange and the audit log.
//
// Every connection call here goes through the CALLER's client, and every
// function it calls is pinned to auth.uid() (20270303090000_ai_google_read.sql).
// There is no argument anywhere that names a person, so this module cannot
// reach anyone else's connection even if a route were written wrongly.
//
// The ONE exception is the audit row: it is written with the service-role
// client, for the userId the route already proved, because a signed-in person
// must not be able to add audit rows for tool calls that never happened
// (repair round 1: authenticated holds SELECT only on the audit table).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  DRIVE_READONLY_SCOPE,
  GMAIL_READONLY_SCOPE,
  GOOGLE_FETCH_TIMEOUT_MS,
  GOOGLE_READ_POLICY_KEY,
  IDENTITY_SCOPES,
  type GoogleReadAuditTool,
} from './constants';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const LOG_PREFIX = '[google-read]';

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

/**
 * Same OAuth client and vault secret as the calendar connection (the
 * incremental-authorization design): mirrors isGoogleCalConfigured().
 */
export function isGoogleReadConfigured(): boolean {
  return !!(
    env('GOOGLE_CAL_CLIENT_ID') &&
    env('GOOGLE_CAL_CLIENT_SECRET') &&
    env('GOOGLE_TOKEN_MASTER_SECRET')
  );
}

/**
 * The switch. Fails CLOSED: an unreadable policy means off, because "on" hands
 * a machine the key to someone's mailbox.
 */
export async function isGoogleReadEnabled(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('fn_get_policy', {
      p_key: GOOGLE_READ_POLICY_KEY,
      p_scope_id: null,
    });
    if (error) {
      console.error(`${LOG_PREFIX} switch read failed, treating as off:`, error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error(`${LOG_PREFIX} switch read threw, treating as off:`, (err as Error).message);
    return false;
  }
}

/**
 * One audit row: who, which tool, when, outcome. Never content.
 *
 * Written with the service-role client for `userId` — the id the calling route
 * already took from the verified session or bearer token, never from the
 * request body. Nobody signed in can write this table directly.
 */
export async function logGoogleRead(
  userId: string,
  tool: GoogleReadAuditTool,
  outcome: string,
): Promise<void> {
  try {
    const { error } = await createServiceRoleClient()
      .from('ai_google_read_audit')
      .insert({ profile_id: userId, tool, outcome });
    if (error) console.error(`${LOG_PREFIX} audit write failed:`, error.message);
  } catch (err) {
    console.error(`${LOG_PREFIX} audit write threw:`, (err as Error).message);
  }
}

export interface StoredGrant {
  googleEmail: string;
  refreshToken: string;
  scopes: string[];
}

export type GrantRead =
  | { kind: 'ok'; grant: StoredGrant }
  /** No ACTIVE connection: never connected, disconnected, or marked broken. */
  | { kind: 'none' }
  /**
   * The key could not be read: the vault call failed, the server secret is
   * missing, or the stored key no longer decrypts. Nothing is known about
   * what Google holds.
   */
  | { kind: 'error' };

/** The caller's own decrypted grant — and, when there is none, WHY. */
export async function readOwnGrant(supabase: SupabaseClient): Promise<GrantRead> {
  const master = env('GOOGLE_TOKEN_MASTER_SECRET');
  if (!master) return { kind: 'error' };
  const { data, error } = await supabase.rpc('fn_ai_google_read_get_token', {
    p_master_secret: master,
  });
  if (error) {
    console.error(`${LOG_PREFIX} vault read failed:`, error.message);
    return { kind: 'error' };
  }
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!row || typeof row.refresh_token !== 'string' || !row.refresh_token) return { kind: 'none' };
  return {
    kind: 'ok',
    grant: {
      googleEmail: String(row.google_email ?? ''),
      refreshToken: row.refresh_token,
      scopes: Array.isArray(row.granted_scopes) ? (row.granted_scopes as string[]) : [],
    },
  };
}

export type AccessResult =
  | { status: 'ok'; accessToken: string }
  /** Never connected, or disconnected. */
  | { status: 'not_connected' }
  /** Was connected; Google has since withdrawn it (invalid_grant). */
  | { status: 'reconnect_needed' }
  /** Connected, but the person did not tick the box this tool needs. */
  | { status: 'missing_scope' }
  /** Google or the vault did not answer. Try again later. */
  | { status: 'failed' };

/** True when a token's scope list holds nothing beyond `allowed` + identity. */
export function scopeIsOnly(scopeField: string | undefined, allowed: string): boolean {
  if (typeof scopeField !== 'string' || !scopeField.trim()) return false;
  const got = scopeField.split(/\s+/).filter(Boolean);
  return got.includes(allowed) && got.every((s) => s === allowed || IDENTITY_SCOPES.includes(s));
}

/**
 * Refresh token → short-lived access token for the caller's own grant,
 * carrying ONLY `requiredScope` (gmail.readonly or drive.readonly).
 *
 * The stored refresh token may also carry the calendar scopes, including
 * calendar.events (write), because the consent is incremental. So the refresh
 * request names the one scope this tool needs (Google's down-scoping), and a
 * token that comes back with anything else — or without saying what it holds —
 * is refused, never used.
 */
export async function getOwnAccessToken(
  supabase: SupabaseClient,
  userId: string,
  requiredScope: string,
): Promise<AccessResult> {
  const clientId = env('GOOGLE_CAL_CLIENT_ID');
  const clientSecret = env('GOOGLE_CAL_CLIENT_SECRET');
  if (!clientId || !clientSecret) return { status: 'failed' };

  const read = await readOwnGrant(supabase);
  if (read.kind === 'error') return { status: 'failed' };
  if (read.kind === 'none') {
    // Tell "never connected" apart from "Google withdrew it" — the second one
    // needs a different sentence to the person.
    const { data } = await supabase
      .from('ai_google_read_connections')
      .select('status')
      .eq('profile_id', userId)
      .maybeSingle();
    return (data as { status?: string } | null)?.status === 'broken'
      ? { status: 'reconnect_needed' }
      : { status: 'not_connected' };
  }
  const grant = read.grant;
  if (!grant.scopes.includes(requiredScope)) return { status: 'missing_scope' };

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: grant.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        scope: requiredScope,
      }),
      signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} token refresh threw:`, (err as Error).message);
    return { status: 'failed' };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`${LOG_PREFIX} token refresh failed:`, res.status, body.slice(0, 200));
    if (body.includes('invalid_grant')) {
      const { error } = await supabase.rpc('fn_ai_google_read_mark_broken');
      if (error) console.error(`${LOG_PREFIX} mark broken failed:`, error.message);
      return { status: 'reconnect_needed' };
    }
    // Google refuses to down-scope to a scope the grant no longer holds.
    if (body.includes('invalid_scope')) return { status: 'missing_scope' };
    return { status: 'failed' };
  }

  const json = (await res.json().catch(() => ({}))) as { access_token?: string; scope?: string };
  if (!json.access_token) return { status: 'failed' };
  if (!scopeIsOnly(json.scope, requiredScope)) {
    console.error(`${LOG_PREFIX} refreshed token was not narrowed to ${requiredScope}; refused.`);
    return { status: 'failed' };
  }
  return { status: 'ok', accessToken: json.access_token };
}

export function hasMailScope(scopes: string[]): boolean {
  return scopes.includes(GMAIL_READONLY_SCOPE);
}

export function hasDriveScope(scopes: string[]): boolean {
  return scopes.includes(DRIVE_READONLY_SCOPE);
}

// ── the card ─────────────────────────────────────────────────────────────────

export interface GoogleReadCardState {
  enabled: boolean;
  configured: boolean;
  canUseAssistant: boolean;
  connection: {
    googleEmail: string;
    status: 'active' | 'broken' | 'revoked';
    mail: boolean;
    drive: boolean;
    revokedAtGoogle: boolean | null;
  } | null;
}

/** Everything the connect card needs, read as the signed-in person. */
export async function getGoogleReadCardState(
  supabase: SupabaseClient,
  userId: string,
  canUseAssistantNow: boolean,
): Promise<GoogleReadCardState> {
  const enabled = await isGoogleReadEnabled(supabase);
  const { data } = await supabase
    .from('ai_google_read_connections')
    .select('google_email, status, granted_scopes, revoked_at_google')
    .eq('profile_id', userId)
    .maybeSingle();
  const row = data as {
    google_email?: string;
    status?: 'active' | 'broken' | 'revoked';
    granted_scopes?: string[];
    revoked_at_google?: boolean | null;
  } | null;
  const scopes = Array.isArray(row?.granted_scopes) ? row!.granted_scopes : [];
  return {
    enabled,
    configured: isGoogleReadConfigured(),
    canUseAssistant: canUseAssistantNow,
    connection: row?.status
      ? {
          googleEmail: row.google_email ?? '',
          status: row.status,
          mail: hasMailScope(scopes),
          drive: hasDriveScope(scopes),
          revokedAtGoogle: row.revoked_at_google ?? null,
        }
      : null,
  };
}
